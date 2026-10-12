import type { IngestProblem } from "../ingest-companies";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      source: string;
      inserted: number;
      duplicates: number;
      invalid: number;
      failed: number;
      problems: IngestProblem[];
      truncated: boolean;
    };