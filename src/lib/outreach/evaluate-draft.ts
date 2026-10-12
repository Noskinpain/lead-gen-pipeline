import { supabase } from "../supabase";
import { buildOutreachContext } from "./build-context";
import { runQualityGate, type QualityCheckResult } from "./quality-gate";
import type { GeneratedMessage } from "./generate-message";

// Statuses that mean "not actually sent yet".
const NOT_YET_SENT = "(DRAFT,APPROVED,SCHEDULED,REJECTED)";

export interface DraftEvaluation {
  result: QualityCheckResult;
  contactEmail: string | null;
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
// against the CURRENT state of the contact and the company's enrichment.
// Returns null if the company or contact no longer exists.
export async function evaluateDraft(draft: DraftInput): Promise<DraftEvaluation | null> {
  const context = await buildOutreachContext(draft.company_id, draft.contact_id);
  if (!context) return null;

  const { data: contact } = await supabase
    .from("contacts")
    .select("email, do_not_contact")
    .eq("id", draft.contact_id)
    .maybeSingle();
  if (!contact) return null;

  const { data: priorSends } = await supabase
    .from("outreach_messages")
    .select("id")
    .eq("contact_id", draft.contact_id)
    .neq("id", draft.id)
    .not("status", "in", NOT_YET_SENT)
    .limit(1);

  // The recorded claims describe the text the model wrote. If a person has
  // since edited the text, claim traceability is only checked against the
  // signals, not against their wording.
  const message: GeneratedMessage = {
    subject: draft.subject,
    body: draft.body,
    personalization_used: Array.isArray(draft.personalization_used)
      ? draft.personalization_used.filter((item): item is string => typeof item === "string")
      : [],
    claims: Array.isArray(draft.claims) ? draft.claims.filter(isClaim) : [],
  };

  const doNotContact = contact.do_not_contact === true;
  const result = runQualityGate(message, context, contact.email, (priorSends?.length ?? 0) > 0, doNotContact);

  return { result, contactEmail: contact.email, doNotContact };
}