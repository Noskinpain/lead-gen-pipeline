// Throws if a query failed, so a broken query shows up as a visible error
// instead of silently rendering as "no data".
export function must<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as unknown as T;
}

// Escapes the characters that act as wildcards inside a Postgres LIKE/ILIKE
// pattern, so a search for "50%" or "a_b" matches those characters literally.
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}