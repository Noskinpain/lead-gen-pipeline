import { NextRequest, NextResponse } from "next/server";
import { IngestRequestSchema } from "@/lib/schemas";
import { normalizeCompanyName, normalizeDomain, normalizeIndustry, normalizeLocation } from "@/lib/normalize";
import { checkDuplicate, ExistingCompany } from "@/lib/dedupe";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logger.error("Ingestion failed: invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = IngestRequestSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Ingestion validation failed", { issues: parsed.error.issues });
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { source, companies } = parsed.data;

  logger.info("Starting ingestion", { source, received: companies.length });

  const stats = {
    received: companies.length,
    valid: companies.length, // already validated by Zod at this point
    duplicates: 0,
    inserted: 0,
    failed: 0,
  };
  const errors: Array<{ company_name: string; error: string }> = [];

  // 3. Pull existing companies once, for in-memory dedup checks.
  //    Fine at today's scale; at real scale you'd query per-domain instead.
  const { data: existingRows, error: fetchError } = await supabase
    .from("companies")
    .select("id, normalized_name, domain, location");

  if (fetchError) {
    return NextResponse.json({ error: "Failed to fetch existing companies", details: fetchError.message }, { status: 500 });
  }
  const existing: ExistingCompany[] = existingRows ?? [];

  // 4. Process each company: normalize -> dedupe -> insert
  for (const company of companies) {
    try {
      const normalized_name = normalizeCompanyName(company.company_name);
      const domain = normalizeDomain(company.website);
      const industry = normalizeIndustry(company.industry);
      const location = normalizeLocation(company.location);

      const dedupResult = checkDuplicate(
        { company_name: company.company_name, website: company.website, location },
        existing
      );

      if (dedupResult.isDuplicate === true) {
        // Confirmed duplicate — skip insert, count it, move on
        stats.duplicates++;
        continue;
      }

      if (dedupResult.isDuplicate === "possible") {
        // Weak match — don't auto-merge, don't auto-insert either.
        // Flag as needing review instead of guessing.
        stats.duplicates++; // counted separately from "inserted" either way
        errors.push({ company_name: company.company_name, error: "possible_duplicate_needs_review" });
        continue;
      }

      // No match — insert as new
      const { data: inserted, error: insertError } = await supabase
        .from("companies")
        .insert({
          company_name: company.company_name,
          normalized_name,
          website: company.website,
          domain,
          industry,
          location,
          employee_count: company.employee_count ?? null,
          source,
        })
        .select("id, normalized_name, domain, location")
        .single();

    if (insertError) {
  stats.failed++;
  errors.push({ company_name: company.company_name, error: insertError.message });
  logger.error("Row insert failed", { company_name: company.company_name, error: insertError.message });
  continue;
}

      // Add to in-memory `existing` so later rows in this same batch
      // can be deduped against rows we just inserted.
      existing.push(inserted);
      stats.inserted++;
    } catch (err) {
      stats.failed++;
      errors.push({
        company_name: company.company_name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

 const durationMs = Date.now() - startTime;

  logger.info("Ingestion completed", {
    source,
    ...stats,
    duration_ms: durationMs,
  });

  return NextResponse.json({
    ...stats,
    duration_ms: durationMs,
    errors: errors.length > 0 ? errors : undefined,
  });
}