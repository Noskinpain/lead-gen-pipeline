"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { describeZodError, emptyToUndefined, safeReturnTo } from "@/lib/crm/form-helpers";
import { finish, logEvent, type Outcome } from "@/lib/crm/action-helpers";

const SetDoNotContactSchema = z.object({
  contactId: z.uuid(),
  opportunityId: z.uuid(),
  flag: z.enum(["0", "1"]),
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
});

async function performSetDoNotContact(userId: string, input: z.infer<typeof SetDoNotContactSchema>): Promise<Outcome> {
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("company_id")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (!opportunity) return { ok: false, error: "Deal not found." };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, company_id, do_not_contact")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact || contact.company_id !== opportunity.company_id) {
    return { ok: false, error: "That contact doesn't belong to this deal's company." };
  }

  const flag = input.flag === "1";

  // Clearing the flag re-opens contact with someone who may have asked to be
  // left alone, so it needs a recorded reason.
  if (!flag && !input.reason) return { ok: false, error: "Say why it's OK to contact them again." };
  if (flag === contact.do_not_contact) return { ok: true, message: "No change." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("contacts")
    .update({
      do_not_contact: flag,
      do_not_contact_reason: flag ? (input.reason ?? "Marked manually") : null,
      do_not_contact_at: flag ? now : null,
      updated_at: now,
    })
    .eq("id", input.contactId);

  if (error) {
    logger.error("setDoNotContact failed", { error: error.message });
    return { ok: false, error: "Could not update the contact." };
  }

  await logEvent(input.opportunityId, userId, "do_not_contact_changed", {
    metadata: { flag, reason: input.reason ?? null, contact_id: input.contactId },
  });

  return { ok: true, message: flag ? "Contact marked do not contact." : "Contact can be emailed again." };
}

export async function setDoNotContact(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = SetDoNotContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performSetDoNotContact(user.id, parsed.data));
}