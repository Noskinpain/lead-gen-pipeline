// TTL per field, in days. These are starting guesses, not universal truths —
// worth revisiting once you see how often each field actually changes in practice.
const FIELD_TTL_DAYS: Record<string, number> = {
  website_title: 30,
  meta_description: 30,
  body_text_sample: 7,       // homepage copy changes more often than a title tag
  industry: 90,               // classification-derived fields change rarely
  business_model: 90,
};

const DEFAULT_TTL_DAYS = 30;

export function isStale(observedAt: string, fieldName: string): boolean {
  const ttlDays = FIELD_TTL_DAYS[fieldName] ?? DEFAULT_TTL_DAYS;
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - new Date(observedAt).getTime();
  return ageMs > ttlMs;
}