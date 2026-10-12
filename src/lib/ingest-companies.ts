import { supabase } from "./supabase";
import { logger } from "./logger";
import { fetchAll } from "./crm/fetch-all";
import { normalizeCompanyName, normalizeDomain, normalizeLocation, normalizeIndustry } from "./normalize";
import { checkDuplicate, type ExistingCompany } from "./dedupe";

export interface IngestRowInput {
  rowNumber: number;
  name: string;
  website?: string;
  industry?: string;
  location?: string;
  employeeCount?: number;
}

export interface IngestProblem {
  row: number;
  name: string;
  reason: string;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
  invalid: number;
  failed: number;
  problems: IngestProblem[];
}

interface ExistingRow {
  id: string;
  company_name: string;
  normalized_name: string;
  domain: string | null;
  location: string | null;
}

const INSERT_CHUNK = 100;

const DUPLICATE_REASONS: Record<string, string> = {
  domain_match: "same website",
  name_and_location_match: "same name and location",
  name_similarity_only: "very similar name, possible duplicate",
};

// Same steps as the Day 1 ingestion route (validate, normalize, deduplicate,
// insert), but for a batch from the CRM. Rows are checked against every
// existing company AND against earlier rows in the same file.
export async function ingestCompanies(rows: IngestRowInput[], source: string): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, duplicates: 0, invalid: 0, failed: 0, problems: [] };

  const existingRows = await fetchAll<ExistingRow>(
    (from, to) =>
      supabase
        .from("companies")
        .select("id, company_name, normalized_name, domain, location")
        .order("id")
        .range(from, to),
    "existing companies"
  );

  const names = new Map<string, string>(existingRows.map((r): [string, string] => [r.id, r.company_name]));
  const known: ExistingCompany[] = existingRows.map((r) => ({
    id: r.id,
    normalized_name: r.normalized_name,
    domain: r.domain,
    location: r.location ?? "",
  }));

  const accepted: Array<{ row: IngestRowInput; record: Record<string, unknown> }> = [];
  let pending = 0;

  for (const row of rows) {
    let website: string | null = null;
    let domain: string | null = null;

    if (row.website) {
      domain = normalizeDomain(row.website);
      if (!domain || !domain.includes(".")) {
        result.invalid++;
        result.problems.push({ row: row.rowNumber, name: row.name, reason: "the website isn't a real address" });
        continue;
      }
      website = /^https?:\/\//i.test(row.website) ? row.website : `https://${row.website}`;
    }

    const location = row.location ? normalizeLocation(row.location) : "";
    const duplicate = checkDuplicate({ company_name: row.name, website: website ?? "", location }, known);

    if (duplicate.isDuplicate !== false) {
      result.duplicates++;
      result.problems.push({
        row: row.rowNumber,
        name: row.name,
        reason: `duplicate of ${names.get(duplicate.matchedId) ?? "an existing company"} (${DUPLICATE_REASONS[duplicate.reason] ?? duplicate.reason})`,
      });
      continue;
    }

    const normalizedName = normalizeCompanyName(row.name);
    const pendingId = `pending-${pending++}`;
    names.set(pendingId, row.name);
    known.push({ id: pendingId, normalized_name: normalizedName, domain, location });

    accepted.push({
      row,
      record: {
        company_name: row.name,
        normalized_name: normalizedName,
        website,
        domain,
        industry: row.industry ? normalizeIndustry(row.industry) : null,
        location: row.location ? location : null,
        employee_count: row.employeeCount ?? null,
        source,
        status: "active",
      },
    });
  }

  for (let i = 0; i < accepted.length; i += INSERT_CHUNK) {
    const chunk = accepted.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from("companies").insert(chunk.map((item) => item.record));

    if (!error) {
      result.inserted += chunk.length;
      continue;
    }

    // One bad row shouldn't sink the other 99, so retry one by one to find it.
    for (const item of chunk) {
      const { error: rowError } = await supabase.from("companies").insert(item.record);
      if (rowError) {
        result.failed++;
        result.problems.push({
          row: item.row.rowNumber,
          name: item.row.name,
          reason: rowError.code === "23505" ? "that website is already used by another company" : "could not be saved",
        });
        logger.error("Import row failed", { row: item.row.rowNumber, error: rowError.message });
      } else {
        result.inserted++;
      }
    }
  }

  result.problems.sort((a, b) => a.row - b.row);
  return result;
}