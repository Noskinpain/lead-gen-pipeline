import { supabase } from "../supabase";
import { findSuppression } from "./suppression";
import { isLawfulBasis, type LawfulBasis } from "./constants";

export type ContactableResult =
  | { ok: true; basis: LawfulBasis; email: string; collectedFrom: string | null }
  | {
      ok: false;
      kind: "missing" | "do_not_contact" | "no_email" | "suppressed" | "no_basis" | "basis_not_allowed" | "check_failed";
      reason: string;
    };

// The single question every draft, approval and send asks: may we contact this
// person at all? Anything that can't be checked counts as "no".
export async function checkContactable(contactId: string, options: { realSend: boolean }): Promise<ContactableResult> {
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("email, do_not_contact, do_not_contact_reason, lawful_basis, collected_from")
    .eq("id", contactId)
    .maybeSingle();

  if (error) return { ok: false, kind: "check_failed", reason: "The contact couldn't be checked, so this is blocked for safety." };
  if (!contact) return { ok: false, kind: "missing", reason: "Contact not found." };

  if (contact.do_not_contact) {
    return {
      ok: false,
      kind: "do_not_contact",
      reason: `Marked do not contact${contact.do_not_contact_reason ? ` (${contact.do_not_contact_reason})` : ""}.`,
    };
  }

  if (!contact.email) return { ok: false, kind: "no_email", reason: "This contact has no email address." };

  try {
    const suppression = await findSuppression(contact.email);
    if (suppression) return { ok: false, kind: "suppressed", reason: `On the suppression list (${suppression.reason}).` };
  } catch {
    return { ok: false, kind: "check_failed", reason: "The suppression list couldn't be checked, so this is blocked for safety." };
  }

  if (!isLawfulBasis(contact.lawful_basis)) {
    return {
      ok: false,
      kind: "no_basis",
      reason: "No lawful basis is recorded for this contact. Record one on the Compliance page.",
    };
  }

  if (options.realSend) {
    if (contact.lawful_basis === "test_data") {
      return { ok: false, kind: "basis_not_allowed", reason: "Test data can't be emailed for real." };
    }
    if (contact.lawful_basis === "legitimate_interest" && process.env.ALLOW_LEGITIMATE_INTEREST_SENDS !== "true") {
      return { ok: false, kind: "basis_not_allowed", reason: "Real sends on legitimate interest are switched off." };
    }
  }

  return { ok: true, basis: contact.lawful_basis, email: contact.email, collectedFrom: contact.collected_from };
}