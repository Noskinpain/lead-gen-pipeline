// The minimal shape every source adapter must produce,
// regardless of where the raw data actually came from.
export interface RawCompanyRecord {
  company_name: string;
  website: string;
  industry?: string;
  location?: string;
  employee_count?: number;
  source_id: string; // a unique id from the source, for idempotency later
}

export interface FetchPage {
  records: RawCompanyRecord[];
  nextCursor: string | null; // null means no more pages
}

export interface SourceAdapter {
  name: string;
  fetchPage(cursor: string | null): Promise<FetchPage>;
}