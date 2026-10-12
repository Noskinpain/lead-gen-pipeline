import { supabase } from "../supabase";
import { escapeLike, must } from "./db";

export interface SearchResults {
  companies: Array<{ id: string; name: string; domain: string | null; industry: string | null }>;
  contacts: Array<{ id: string; name: string; title: string | null; companyId: string; companyName: string }>;
  deals: Array<{ id: string; name: string; stage: string; companyName: string }>;
}

interface CompanyHit {
  id: string;
  company_name: string;
  domain: string | null;
  industry: string | null;
}

interface ContactHit {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company_id: string;
}

interface DealHit {
  id: string;
  name: string;
  stage: string;
  company_id: string;
}

const RESULT_LIMIT = 25;
const COMPANY_COLUMNS = "id, company_name, domain, industry";
const CONTACT_COLUMNS = "id, first_name, last_name, job_title, company_id";

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function runSearch(rawTerm: string): Promise<SearchResults> {
  const term = rawTerm.trim().slice(0, 100);
  if (term.length < 2) return { companies: [], contacts: [], deals: [] };

  const pattern = `%${escapeLike(term)}%`;
  const tokens = term.split(/\s+/).filter(Boolean);
  const noRows = { data: [] as ContactHit[], error: null };

  const [byName, byDomain, byFirst, byLast, byEmail, byTitle, byFullName, dealResult] = await Promise.all([
    supabase.from("companies").select(COMPANY_COLUMNS).ilike("company_name", pattern).limit(RESULT_LIMIT),
    supabase.from("companies").select(COMPANY_COLUMNS).ilike("domain", pattern).limit(RESULT_LIMIT),
    supabase.from("contacts").select(CONTACT_COLUMNS).ilike("first_name", pattern).limit(RESULT_LIMIT),
    supabase.from("contacts").select(CONTACT_COLUMNS).ilike("last_name", pattern).limit(RESULT_LIMIT),
    supabase.from("contacts").select(CONTACT_COLUMNS).ilike("email", pattern).limit(RESULT_LIMIT),
    supabase.from("contacts").select(CONTACT_COLUMNS).ilike("job_title", pattern).limit(RESULT_LIMIT),
    // "John Smith": first token against first name, last token against last name
    tokens.length >= 2
      ? supabase
          .from("contacts")
          .select(CONTACT_COLUMNS)
          .ilike("first_name", `%${escapeLike(tokens[0])}%`)
          .ilike("last_name", `%${escapeLike(tokens[tokens.length - 1])}%`)
          .limit(RESULT_LIMIT)
      : Promise.resolve(noRows),
    supabase.from("opportunities").select("id, name, stage, company_id").ilike("name", pattern).limit(RESULT_LIMIT),
  ]);

  const companyHits = uniqueById([
    ...must<CompanyHit[]>(byName, "company search"),
    ...must<CompanyHit[]>(byDomain, "website search"),
  ]).slice(0, RESULT_LIMIT);

  const contactHits = uniqueById([
    ...must<ContactHit[]>(byFullName, "contact name search"),
    ...must<ContactHit[]>(byFirst, "contact search"),
    ...must<ContactHit[]>(byLast, "contact search"),
    ...must<ContactHit[]>(byEmail, "contact email search"),
    ...must<ContactHit[]>(byTitle, "contact title search"),
  ]).slice(0, RESULT_LIMIT);

  const dealHits = must<DealHit[]>(dealResult, "deal search");

  const companyIds = [...new Set([...contactHits.map((c) => c.company_id), ...dealHits.map((d) => d.company_id)])];
  const names = new Map<string, string>();
  if (companyIds.length > 0) {
    const rows = must<Array<{ id: string; company_name: string }>>(
      await supabase.from("companies").select("id, company_name").in("id", companyIds),
      "company names"
    );
    rows.forEach((r) => names.set(r.id, r.company_name));
  }

  return {
    companies: companyHits.map((c) => ({ id: c.id, name: c.company_name, domain: c.domain, industry: c.industry })),
    contacts: contactHits.map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      title: c.job_title,
      companyId: c.company_id,
      companyName: names.get(c.company_id) ?? "Unknown company",
    })),
    deals: dealHits.map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      companyName: names.get(d.company_id) ?? "Unknown company",
    })),
  };
}