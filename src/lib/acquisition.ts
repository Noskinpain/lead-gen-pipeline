import { SourceAdapter } from "./sources/types";
import { supabase } from "./supabase";
import { logger } from "./logger";

export async function runAcquisition(adapter: SourceAdapter, maxPages = 5) {
  // 1. Create the run record up front, status "running"
  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({ source: adapter.name, status: "running" })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create ingestion run: ${runError?.message}`);
  }

  const stats = {
    records_fetched: 0,
    records_valid: 0,
    records_inserted: 0,
    records_updated: 0,
    records_duplicate: 0,
    records_failed: 0,
  };

  logger.info("Acquisition started", { runId: run.id, source: adapter.name });

  try {
    let cursor: string | null = null;
    let pageCount = 0;

    do {
  const page = await adapter.fetchPage(cursor);
  stats.records_fetched += page.records.length;
  pageCount++;

  logger.info("Fetched page", { runId: run.id, page: pageCount, recordsThisPage: page.records.length });

  cursor = page.nextCursor;

  // Checkpoint: save progress after every page, not just at the end.
  // If the process crashes on page 4, this row tells you exactly
  // where it got to.
  await supabase
    .from("ingestion_runs")
    .update({ ...stats, last_cursor: cursor })
    .eq("id", run.id);

} while (cursor !== null && pageCount < maxPages);

    // 2. Mark the run as successful, with final stats
    await supabase
      .from("ingestion_runs")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        ...stats,
      })
      .eq("id", run.id);

    logger.info("Acquisition completed", { runId: run.id, ...stats });
  } catch (err) {
    // 3. Something failed partway through — record that honestly, don't
    //    just let the run sit at "running" forever with no explanation.
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        ...stats,
      })
      .eq("id", run.id);

    logger.error("Acquisition failed", { runId: run.id, error: errorMessage, ...stats });
    throw err;
  }
}