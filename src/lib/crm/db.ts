// Throws if a query failed, so a broken query shows up as a visible error
// instead of silently rendering as "no data".
export function must<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as unknown as T;
}