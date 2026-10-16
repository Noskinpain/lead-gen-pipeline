import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { verifyUnsubscribeToken } from "@/lib/compliance/unsubscribe-token";
import { addSuppression } from "@/lib/compliance/suppression";
import { getSenderIdentity } from "@/lib/compliance/sender-identity";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function page(status: number, title: string, body: string): Response {
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;line-height:1.5;color:#1b1b19}button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid #1b1b19;background:#1b1b19;color:#fff;cursor:pointer}</style></head><body>${body}</body></html>`;
  return new Response(doc, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

function businessName(): string {
  const identity = getSenderIdentity();
  return identity.ok ? identity.identity.businessName : "us";
}

const INVALID = page(
  404,
  "Link not valid",
  "<h1>This link isn't valid</h1><p>It may have been copied incompletely. Reply to the email and ask to be removed, and it will be done.</p>"
);

// Opening the link only asks for confirmation. The change happens on POST, so
// mail scanners that open links can't unsubscribe anyone by accident.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!verifyUnsubscribeToken(token)) return INVALID;

  return page(
    200,
    "Unsubscribe",
    `<h1>Unsubscribe</h1><p>Stop receiving emails from ${escapeHtml(businessName())}?</p><form method="post"><button type="submit">Yes, unsubscribe me</button></form>`
  );
}

async function processUnsubscribe(messageId: string): Promise<boolean> {
  const { data: message } = await supabase
    .from("outreach_messages")
    .select("id, contact_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) return false;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email, do_not_contact")
    .eq("id", message.contact_id)
    .maybeSingle();
  if (!contact) return false;

  if (contact.email) {
    const suppressed = await addSuppression({ email: contact.email, reason: "unsubscribed", source: "unsubscribe_link" });
    if (!suppressed.ok) throw new Error(suppressed.error);
  }

  const now = new Date().toISOString();
  if (!contact.do_not_contact) {
    const { error } = await supabase
      .from("contacts")
      .update({
        do_not_contact: true,
        do_not_contact_reason: `Unsubscribed through an email link on ${now.slice(0, 10)}`,
        do_not_contact_at: now,
        updated_at: now,
      })
      .eq("id", contact.id);
    if (error) throw new Error(error.message);
  }

  await supabase.from("outreach_events").insert({ message_id: messageId, event_type: "unsubscribe_link_used", event_data: {} });

  const { data: deals } = await supabase
    .from("opportunities")
    .select("id")
    .eq("contact_id", contact.id)
    .not("stage", "in", "(won,lost)");

  for (const deal of deals ?? []) {
    await supabase.from("opportunity_events").insert({
      opportunity_id: deal.id,
      event_type: "do_not_contact_changed",
      metadata: { flag: true, reason: "Unsubscribed through an email link", contact_id: contact.id },
    });
  }

  return true;
}

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const verified = verifyUnsubscribeToken(token);
  if (!verified) return INVALID;

  try {
    if (!(await processUnsubscribe(verified.messageId))) return INVALID;
  } catch (err) {
    // An opt-out that silently failed is the worst outcome, so say so loudly.
    logger.error("Unsubscribe failed", { error: err instanceof Error ? err.message : "unknown" });
    return page(
      500,
      "Something went wrong",
      "<h1>Something went wrong</h1><p>Your request wasn't saved. Please reply to the email and ask to be removed, and it will be done.</p>"
    );
  }

  return page(
    200,
    "Unsubscribed",
    `<h1>You've been unsubscribed</h1><p>You won't receive further emails from ${escapeHtml(businessName())}.</p>`
  );
}