import { supabase } from "../supabase";
import { OutreachContext } from "./types";

// The offer is a fixed, honest description of what you're actually
// selling — never generated, never inferred. This is deliberately
// hardcoded, not pulled from anywhere dynamic.
const OFFER = {
  description: "A data pipeline and lead-qualification system for B2B teams.",
  valueProposition: "We help growing teams automate lead discovery, qualification, and follow-up so nothing worth pursuing falls through the cracks.",
};

export async function buildOutreachContext(companyId: string, contactId: string): Promise<OutreachContext | null> {
  const { data: company } = await supabase
    .from("companies")
    .select("company_name, industry, location")
    .eq("id", companyId)
    .single();

  const { data: contact } = await supabase
    .from("contacts")
    .select("first_name, job_title")
    .eq("id", contactId)
    .single();

  if (!company || !contact) return null;

  // Pull only real, stored facts as signals — never inferred here.
  const { data: enrichments } = await supabase
    .from("company_enrichments")
    .select("field_name, field_value")
    .eq("company_id", companyId)
    .in("field_name", ["meta_description", "industry", "business_model"]);

  const signals: OutreachContext["signals"] = (enrichments ?? [])
    .filter((e) => e.field_value && e.field_value.trim().length > 0)
    .map((e) => ({
      name: e.field_name,
      evidence: e.field_value,
    }));

  const description = enrichments?.find((e) => e.field_name === "meta_description")?.field_value;

  return {
    company: {
      name: company.company_name,
      industry: company.industry ?? undefined,
      location: company.location ?? undefined,
      description: description ?? undefined,
    },
    contact: {
      firstName: contact.first_name,
      jobTitle: contact.job_title ?? "there", // fallback if title is genuinely unknown
    },
    signals,
    offer: OFFER,
  };
}