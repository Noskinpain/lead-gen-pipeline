"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { enrichCompany } from "@/lib/enrichment/enrich-company";
import { ingestCompanies, type IngestProblem, type IngestRowInput } from "@/lib/ingest-companies";
import { parseCsv } from "@/lib/crm/csv";
import { describeZodError, emptyToUndefined } from "@/lib/crm/form-helpers";
import { finish } from "@/lib/crm/action-helpers";
import { loadProspectTable } from "@/lib/crm/load-prospects";
import type { ImportState } from "@/lib/crm/import-types";

// ---------- Import companies from CSV ----------

const MAX_BYTES = 1_000_000;
const MAX_ROWS = 2000;
const MAX_PROBLEMS_SHOWN = 50;

const HEADER_ALIASES = {
  name: ["company_name", "company", "name", "business", "business_name"],
  website: ["website", "domain", "url", "site", "web", "website_url"],
  industry: ["industry", "sector", "category"],
  location: ["location", "city", "country", "state", "address"],
  employees: ["employees", "employee_count", "employee", "headcount", "size"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function findColumn(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

const RowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.preprocess(emptyToUndefined, z.string().trim().max(300).optional()),
  industry: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  location: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  employeeCount: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10000000).optional()),
});

function describeRowError(error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? "row");
  if (field === "name") return "missing or too long company name";
  if (field === "employeeCount") return "employees isn't a whole number";
  return `bad "${field}" value`;
}

export async function importCompaniesCsv(_previous: ImportState, formData: FormData): Promise<ImportState> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a CSV file first." };
  if (file.size > MAX_BYTES) return { status: "error", message: "That file is over 1 MB. Split it into smaller files." };

  const source =
    String(formData.get("source") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "csv_import";

  let table: string[][];
  try {
    table = parseCsv(await file.text());
  } catch {
    return { status: "error", message: "Couldn't read that file as CSV." };
  }
  if (table.length < 2) return { status: "error", message: "The file needs a header row and at least one company." };

  const headers = table[0].map(normalizeHeader);
  const columns = {
    name: findColumn(headers, HEADER_ALIASES.name),
    website: findColumn(headers, HEADER_ALIASES.website),
    industry: findColumn(headers, HEADER_ALIASES.industry),
    location: findColumn(headers, HEADER_ALIASES.location),
    employees: findColumn(headers, HEADER_ALIASES.employees),
  };
  if (columns.name === -1) {
    return {
      status: "error",
      message: `Couldn't find a company name column. The header row needs one of: ${HEADER_ALIASES.name.join(", ")}.`,
    };
  }

  const dataRows = table.slice(1);
  if (dataRows.length > MAX_ROWS) {
    return { status: "error", message: `That file has ${dataRows.length} rows. The limit is ${MAX_ROWS} per import.` };
  }

  const cell = (row: string[], index: number): string | undefined => (index === -1 ? undefined : row[index]?.trim());

  const valid: IngestRowInput[] = [];
  const problems: IngestProblem[] = [];
  let invalid = 0;

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2; // the row number you'd see in a spreadsheet
    const parsed = RowSchema.safeParse({
      name: cell(row, columns.name),
      website: cell(row, columns.website),
      industry: cell(row, columns.industry),
      location: cell(row, columns.location),
      employeeCount: cell(row, columns.employees)?.replace(/,/g, ""),
    });

    if (!parsed.success) {
      invalid++;
      problems.push({ row: rowNumber, name: cell(row, columns.name) ?? "", reason: describeRowError(parsed.error) });
      return;
    }
    valid.push({ rowNumber, ...parsed.data });
  });

  let result;
  try {
    result = await ingestCompanies(valid, source);
  } catch (err) {
    logger.error("CSV import failed", { error: err instanceof Error ? err.message : "unknown" });
    return { status: "error", message: "The import failed before anything was saved. Try again." };
  }

  const allProblems = [...problems, ...result.problems].sort((a, b) => a.row - b.row);

  return {
    status: "done",
    source,
    inserted: result.inserted,
    duplicates: result.duplicates,
    invalid: invalid + result.invalid,
    failed: result.failed,
    problems: allProblems.slice(0, MAX_PROBLEMS_SHOWN),
    truncated: allProblems.length > MAX_PROBLEMS_SHOWN,
  };
}

// ---------- Enrich the next batch ----------

const BATCH_SIZE = 5;
const TIME_BUDGET_MS = 90_000;

const EnrichSchema = z.object({
  source: z.preprocess(emptyToUndefined, z.string().max(80).optional()),
});

export async function enrichProspects(formData: FormData): Promise<void> {
  await requireUser();
  const returnTo = "/crm/prospects";

  const parsed = EnrichSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  const wantedSource = parsed.data.source;

  const table = await loadProspectTable();
  const candidates = table.waiting.filter((w) => !wantedSource || w.source === wantedSource);
  if (candidates.length === 0) finish(returnTo, { ok: true, message: "Nothing is waiting for enrichment." });

  const started = Date.now();
  let attempted = 0;
  let enriched = 0;
  let failed = 0;

  for (const company of candidates.slice(0, BATCH_SIZE)) {
    // A dead website can take about a minute to give up on, so stop starting new ones after a while.
    if (Date.now() - started > TIME_BUDGET_MS) break;
    attempted++;

    let status: "enriched" | "failed" = "failed";
    try {
      const result = await enrichCompany(company.id);
      status = result.status === "enriched" || result.status === "skipped_fresh" ? "enriched" : "failed";
    } catch (err) {
      logger.error("enrichProspects: enrichment threw", {
        companyId: company.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }

    await supabase
      .from("companies")
      .update({ last_enrich_attempt_at: new Date().toISOString(), last_enrich_status: status })
      .eq("id", company.id);

    if (status === "enriched") enriched++;
    else failed++;
  }

  const remaining = candidates.length - attempted;
  finish(returnTo, {
    ok: true,
    message: `Enriched ${enriched}, couldn't fetch ${failed}. ${remaining} still waiting${wantedSource ? ` from ${wantedSource}` : ""}.`,
  });
}