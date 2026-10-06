export interface EnrichmentFact {
  field_value: string;
  source: string;
  observed_at: string;
  confidence: number | null;
}

// Priority order per source — lower number = more trusted.
// This is a deliberately explicit, editable list, not a guess.
const SOURCE_PRIORITY: Record<string, number> = {
  llm_classification: 1, // structured, validated extraction — trusted most for classification fields
  website_scrape: 2,     // raw but directly from the source
};

const DEFAULT_PRIORITY = 99; // unknown sources rank last, not first

export function resolveField(facts: EnrichmentFact[]): EnrichmentFact | null {
  if (facts.length === 0) return null;
  if (facts.length === 1) return facts[0];

  // Sort by: source priority first, then most recent observed_at as a tiebreaker
  const sorted = [...facts].sort((a, b) => {
    const priorityA = SOURCE_PRIORITY[a.source] ?? DEFAULT_PRIORITY;
    const priorityB = SOURCE_PRIORITY[b.source] ?? DEFAULT_PRIORITY;

    if (priorityA !== priorityB) return priorityA - priorityB;

    // Same priority — prefer the more recently observed fact
    return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
  });

  return sorted[0];
}