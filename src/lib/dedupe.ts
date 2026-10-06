import { normalizeCompanyName, normalizeDomain } from "./normalize";

export type DedupResult =
  | { isDuplicate: true; confidence: "high"; reason: "domain_match"; matchedId: string }
  | { isDuplicate: true; confidence: "medium"; reason: "name_and_location_match"; matchedId: string }
  | { isDuplicate: "possible"; confidence: "low"; reason: "name_similarity_only"; matchedId: string }
  | { isDuplicate: false };

// Minimal existing-record shape needed for comparison.
// In Step 7 this will come from a real DB query.
export interface ExistingCompany {
  id: string;
  normalized_name: string;
  domain: string | null;
  location: string;
}

// Levenshtein distance — counts the minimum single-character edits
// (insertions, deletions, substitutions) needed to turn `a` into `b`.
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[a.length][b.length];
}

function nameSimilarity(a: string, b: string): number {
  const distance = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

export function checkDuplicate(
  incoming: { company_name: string; website: string; location: string },
  existing: ExistingCompany[]
): DedupResult {
  const incomingDomain = normalizeDomain(incoming.website);
  const incomingName = normalizeCompanyName(incoming.company_name);

  // Tier 1 — domain match (strong, near-certain)
  if (incomingDomain) {
    const domainMatch = existing.find((e) => e.domain === incomingDomain);
    if (domainMatch) {
      return { isDuplicate: true, confidence: "high", reason: "domain_match", matchedId: domainMatch.id };
    }
  }

  // Tier 2 — name similarity + same location (medium)
  for (const e of existing) {
    const score = nameSimilarity(incomingName, e.normalized_name);
    const sameLocation = incoming.location.trim().toLowerCase() === e.location.trim().toLowerCase();

    if (score > 0.85 && sameLocation) {
      return { isDuplicate: true, confidence: "medium", reason: "name_and_location_match", matchedId: e.id };
    }
  }

  // Tier 3 — name similarity alone (weak — flag, don't auto-merge)
  for (const e of existing) {
    const score = nameSimilarity(incomingName, e.normalized_name);
    if (score > 0.85) {
      return { isDuplicate: "possible", confidence: "low", reason: "name_similarity_only", matchedId: e.id };
    }
  }

  return { isDuplicate: false };
}