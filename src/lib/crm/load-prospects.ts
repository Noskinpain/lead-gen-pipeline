import { supabase } from "../supabase";
import { must } from "./db";
import { fetchAll } from "./fetch-all";
import { extractWebsiteSignals } from "../website-scoring/website-signals";
import { scoreWebsiteOpportunity } from "../website-scoring/score-website-opportunity";

// Only the newest companies that have a website are considered, to keep pages fast.
export const PROSPECT_WINDOW = 300;
const RETRY_AFTER_DAYS = 7;
const FACT_FIELDS = ["website_title", "meta_description", "body_text_sample", "contact_signals"];

export interface ScoredProspect {
  id: string;
  name: string;
  domain: string;
  source: string | null;
  score: number;
  gaps: string[];
  contact: string;
  enrichedAt: string;
}

export interface FailedProspect {
  id: string;
  name: string;
  domain: string;
  source: string | null;
  attemptedAt: string;
}

export interface WaitingProspect {
  id: string;
  name: string;
  domain: string;
  source: string | null;
  createdAt: string;
}

export interface ProspectTable {
  scored: ScoredProspect[];
  failed: FailedProspect[];
  waiting: WaitingProspect[];
  waitingSources: string[];
  limited: boolean;
}

interface CompanyRow {
  id: string;
  company_name: string;
  domain: string | null;
  source: string | null;
  created_at: string;
  last_enrich_attempt_at: string | null;
  last_enrich_status: string | null;
}

interface FactRow {
  company_id: string;
  field_name: string;
  field_value: string;
  observed_at: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

export async function loadProspectTable(): Promise<ProspectTable> {
  const companies = must<CompanyRow[]>(
    await supabase
      .from("companies")
      .select("id, company_name, domain, source, created_at, last_enrich_attempt_at, last_enrich_status")
      .not("domain", "is", null)
      .or("status.is.null,status.neq.archived")
      .order("created_at", { ascending: false })
      .limit(PROSPECT_WINDOW + 1),
    "companies"
  );

  const limited = companies.length > PROSPECT_WINDOW;
  const windowRows = companies.slice(0, PROSPECT_WINDOW);
  const empty: ProspectTable = { scored: [], failed: [], waiting: [], waitingSources: [], limited };
  if (windowRows.length === 0) return empty;

  // Newest facts first within each company
  const factsByCompany = new Map<string, FactRow[]>();
  for (const ids of chunk(
    windowRows.map((c) => c.id),
    100
  )) {
    const facts = await fetchAll<FactRow>(
      (from, to) =>
        supabase
          .from("company_enrichments")
          .select("company_id, field_name, field_value, observed_at")
          .in("company_id", ids)
          .in("field_name", FACT_FIELDS)
          .order("observed_at", { ascending: false })
          .order("id")
          .range(from, to),
      "enrichment"
    );
    for (const fact of facts) {
      const list = factsByCompany.get(fact.company_id) ?? [];
      list.push(fact);
      factsByCompany.set(fact.company_id, list);
    }
  }

  const retryCutoff = Date.now() - RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const scored: ScoredProspect[] = [];
  const failed: FailedProspect[] = [];
  const waiting: WaitingProspect[] = [];

  for (const company of windowRows) {
    const domain = company.domain ?? "";
    const facts = factsByCompany.get(company.id) ?? [];

    if (facts.length > 0) {
      const latest = (field: string) => facts.find((f) => f.field_name === field)?.field_value ?? null;
      const contactFact = latest("contact_signals");
      const result = scoreWebsiteOpportunity(
        extractWebsiteSignals(
          company.domain,
          latest("meta_description"),
          latest("body_text_sample"),
          contactFact === null ? null : contactFact !== "none"
        )
      );
      scored.push({
        id: company.id,
        name: company.company_name,
        domain,
        source: company.source,
        score: result.score,
        gaps: result.signals.filter((s) => s.matched).map((s) => s.name),
        contact: contactFact ?? "not captured",
        enrichedAt: facts[0].observed_at,
      });
      continue;
    }

    const attemptedAt = company.last_enrich_attempt_at;
    const recentlyFailed =
      company.last_enrich_status === "failed" && attemptedAt !== null && new Date(attemptedAt).getTime() > retryCutoff;

    if (recentlyFailed && attemptedAt) {
      failed.push({ id: company.id, name: company.company_name, domain, source: company.source, attemptedAt });
    } else {
      waiting.push({
        id: company.id,
        name: company.company_name,
        domain,
        source: company.source,
        createdAt: company.created_at,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  failed.sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt));

  const waitingSources = [...new Set(waiting.map((w) => w.source).filter((s): s is string => s !== null))].sort();

  return { scored, failed, waiting, waitingSources, limited };
}