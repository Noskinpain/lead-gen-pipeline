import { supabase } from "../supabase";
import { enrichBatch } from "../enrichment/enrich-batch";
import { extractWebsiteSignals } from "./website-signals";
import { scoreWebsiteOpportunity } from "./score-website-opportunity";

// Add more real small-business domains here. Aim for a mix of strong,
// mediocre and weak sites so the ranking has something to prove.
const PROSPECTS: Array<{ name: string; domain: string }> = [
  { name: "tagroom", domain: "tagroomqms.xyz" },
  { name: "thescentsstore", domain: "thescentsstore.com" },
  { name: "loxlite", domain: "loxlite.com" },
  { name: "fragrances", domain: "fragrances.com.ng" },
  { name: "dscentsation", domain: "dscentsation.com" },
  { name: "essenza", domain: "essenza.ng" },
  { name: "theperfumesforlessng", domain: "theperfumesforlessng.com" },
];

async function getOrCreateCompany(name: string, domain: string): Promise<string | null> {
  const { data: existing } = await supabase.from("companies").select("id").eq("domain", domain).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("companies")
    .insert({
      company_name: name,
      normalized_name: name,
      website: `https://${domain}`,
      domain,
      source: "website_prospect_test",
    })
    .select("id")
    .single();

  if (error || !created) {
    console.log("Insert failed for", domain, error?.message);
    return null;
  }
  return created.id;
}

async function main() {
  const companies: Array<{ id: string; name: string; domain: string }> = [];

  for (const p of PROSPECTS) {
    const id = await getOrCreateCompany(p.name, p.domain);
    if (id) companies.push({ id, name: p.name, domain: p.domain });
  }

  await enrichBatch(companies.map((c) => c.id));

  const rows: Array<{ business: string; domain: string; score: number | string; contact: string; why: string }> = [];

  for (const c of companies) {
    const { data: facts } = await supabase
      .from("company_enrichments")
      .select("field_name, field_value")
      .eq("company_id", c.id)
      .in("field_name", ["website_title", "meta_description", "body_text_sample", "contact_signals"]);

    if (!facts || facts.length === 0) {
      rows.push({ business: c.name, domain: c.domain, score: "UNSCORED", contact: "-", why: "fetch failed, blocked, or nothing parseable" });
      continue;
    }

    const meta = facts.find((f) => f.field_name === "meta_description")?.field_value ?? null;
    const body = facts.find((f) => f.field_name === "body_text_sample")?.field_value ?? null;

    // undefined = no contact_signals fact stored, so pass null and let the
    // signal extractor fall back to the old keyword check.
    const contactFact = facts.find((f) => f.field_name === "contact_signals")?.field_value;
    const hasContact = contactFact === undefined ? null : contactFact !== "none";

    const result = scoreWebsiteOpportunity(extractWebsiteSignals(c.domain, meta, body, hasContact));

    rows.push({
      business: c.name,
      domain: c.domain,
      score: result.score,
      contact: contactFact ?? "not captured",
      why: result.signals.filter((s) => s.matched).map((s) => s.name).join(", ") || "no deficiencies detected",
    });
  }

  rows.sort((a, b) => (typeof b.score === "number" ? b.score : -1) - (typeof a.score === "number" ? a.score : -1));
  console.table(rows);
}

main();