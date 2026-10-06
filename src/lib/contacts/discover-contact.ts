import { supabase } from "../supabase";
import { mockContactSource } from "./mock-source";
import { selectBestContact } from "./select-contact";
import { verifyEmail } from "./verify-email";
import { calculateContactConfidence } from "./confidence";
import { logger } from "../logger";

export async function discoverContact(companyId: string) {
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name, domain")
    .eq("id", companyId)
    .single();

  if (companyError || !company || !company.domain) {
    logger.warn("Cannot discover contact — company or domain missing", { companyId });
    return null;
  }

  // Don't re-discover if we already have a contact for this company
const { data: existingContact } = await supabase
  .from("contacts")
  .select("id, email_status")
  .eq("company_id", companyId)
  .limit(1)
  .maybeSingle();

if (existingContact) {
  logger.info("Contact already exists for company — skipping discovery", { companyId, existingContactId: existingContact.id });
  return { status: "already_exists" as const, contactId: existingContact.id };
}

  const candidates = await mockContactSource.findContacts(company.domain, company.company_name);
  const selection = selectBestContact(candidates);


  // Log the selection run regardless of outcome — even "no contact found"
  // is a meaningful, worth-recording result.
  const { data: run } = await supabase
    .from("contact_selection_runs")
    .insert({
      company_id: companyId,
      candidates_found: candidates.length,
      candidates_scored: selection.candidatesScored.length,
      selection_reason: selection.reason,
    })
    .select("id")
    .single();

  if (!selection.selected) {
    logger.info("No contact selected", { companyId, reason: selection.reason });
    return { status: "no_contact_found" as const, reason: selection.reason, runId: run?.id };
  }

  const verification = await verifyEmail(selection.selected.contact.email);
  const confidence = calculateContactConfidence(selection.selected.roleScore, verification.status);

  const { data: contact, error: insertError } = await supabase
    .from("contacts")
    .insert({
      company_id: companyId,
      first_name: selection.selected.contact.firstName,
      last_name: selection.selected.contact.lastName,
      job_title: selection.selected.contact.jobTitle,
      department: selection.selected.contact.department,
      seniority: selection.selected.contact.seniority,
      email: selection.selected.contact.email,
      email_status: verification.status,
      email_source: selection.selected.contact.email ? "mock_contact_source" : null,
      contact_source: "mock_contact_source",
      contact_score: selection.selected.roleScore,
      confidence,
    })
    .select("id")
    .single();

  if (insertError) {
    logger.error("Failed to save contact", { companyId, error: insertError.message });
    return { status: "failed" as const, error: insertError.message, runId: run?.id };
  }

  // Link the selected contact back to its selection run for traceability
  if (run) {
    await supabase.from("contact_selection_runs").update({ selected_contact_id: contact.id }).eq("id", run.id);
  }

  logger.info("Contact discovered and saved", { companyId, contactId: contact.id, confidence, emailStatus: verification.status });

  return { status: "discovered" as const, contactId: contact.id, confidence, emailStatus: verification.status, reason: selection.reason };
}