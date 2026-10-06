import { SourceAdapter, FetchPage, RawCompanyRecord } from "./types";
import { fetchWithRetry } from "../http";

const BASE_URL = "https://api.github.com/search/repositories";
const QUERY = "topic:saas";
const PER_PAGE = 10;

interface GitHubRepoItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  owner: { login: string };
  stargazers_count: number;
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepoItem[];
}

function parseNextUrlFromLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Link header format: <url>; rel="next", <url>; rel="last"
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<(.*)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export const githubAdapter: SourceAdapter = {
  name: "github_saas_repos",

  async fetchPage(cursor: string | null): Promise<FetchPage> {
  const url = cursor ?? `${BASE_URL}?q=${encodeURIComponent(QUERY)}&per_page=${PER_PAGE}&page=1`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/vnd.github+json" },
  });

  // response.ok is now guaranteed true here — fetchWithRetry already
  // threw on permanent failure, or retried transient ones until success.
  const data: GitHubSearchResponse = await response.json();
    const nextCursor = parseNextUrlFromLinkHeader(response.headers.get("link"));

    const records: RawCompanyRecord[] = data.items.map((item) => ({
      company_name: item.full_name,
      website: item.html_url,
      industry: item.language ?? undefined,
      location: undefined, // GitHub repos don't have a "location" — expected gap, not a bug
      employee_count: undefined, // not applicable to repos — same
      source_id: String(item.id),
    }));

    return { records, nextCursor };
  },
};