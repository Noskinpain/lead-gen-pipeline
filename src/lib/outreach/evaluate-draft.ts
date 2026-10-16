import { supabase } from "../supabase";
import { buildOutreachContext } from "./build-context";
import { runQualityGate, type QualityCheckResult } from "./quality-gate";
import type { GeneratedMessage } from "./generate-message";
import { checkContactable } from "../compliance/contactable";
import { getSenderIdentity } from "../compliance/sender-identity";

// Statuses that mean "not actually sent yet".
const NOT_YET_SENT = "(DRAFT,APPROVED,SCHEDULED,REJECTED)";

export interface DraftEvaluation {
  result: QualityCheckResult;
  contactEmail: string | null;
  // True when approval must be refused outright: do-not-contact, suppressed,
  // or a check that couldn't run.
  doNotContact: boolean;
}

interface DraftInput {
  id: string;
  subject: string;
  body: string;
  claims: unknown;
  personalization_used: unknown;
  company_id: string;
  contact_id: string;
}

function isClaim(value: unknown): value is { text: string; source: string } {
  if (typeof value !== "object" || value === null) return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.text === "string" && typeof claim.source === "string";
}

// Runs the same deterministic quality gate used when the draft was generated,
// against the CURRENT state of the contact, the compliance checks and the
// company's enrichment. Returns null if the company or contact no longer exists.
export async function evaluateDraft(draft: DraftInput): Promise<DraftEvaluation | null> {
  const context = await buildOutreachContext(draft.company_id, draft.contact_id);
  if (!context) return null;

  const { data: contact } = await supabase.from("contacts").select("email").eq("id", draft.contact_id).maybeSingle();
  if (!contact) return null;

  const { data: priorSends } = await supabase
    .from("outreach_messages")
    .select("id")
    .eq("contact_id", draft.contact_id)
    .neq("id", draft.id)
    .not("status", "in", NOT_YET_SENT)
    .limit(1);

  const message: GeneratedMessage = {
    subject: draft.subject,
    body: draft.body,
    personalization_used: Array.isArray(draft.personalization_used)
      ? draft.personalization_used.filter((item): item is string => typeof item === "string")
      : [],
    claims: Array.isArray(draft.claims) ? draft.claims.filter(isClaim) : [],
  };

  const contactable = await checkContactable(draft.contact_id, { realSend: false });
  const hardBlock =
    !contactable.ok &&
    (contactable.kind === "do_not_contact" || contactable.kind === "suppressed" || contactable.kind === "check_failed");

  const gate = runQualityGate(message, context, contact.email, (priorSends?.length ?? 0) > 0, false);
  const issues = [...gate.issues];

  if (!contactable.ok) issues.push(`Not allowed to contact: ${contactable.reason}`);

  const sender = getSenderIdentity();
  if (!sender.ok) issues.push(`Sender identity is incomplete (missing ${sender.missing.join(", ")}).`);

  return {
    result: { passed: issues.length === 0, issues },
    contactEmail: contact.email,
    doNotContact: hardBlock,
  };
}