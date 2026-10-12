import { redirect } from "next/navigation";
import type { ZodError } from "zod";

// Only allow redirects back to pages inside the CRM. Anything else (another
// site, a protocol-relative URL) falls back to a safe default.
export function safeReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!/^\/crm(\/|\?|$)/.test(value)) return fallback;
  if (value.startsWith("//") || /[\r\n\\]/.test(value)) return fallback;
  return value;
}

export function goWithMessage(path: string, kind: "ok" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message.slice(0, 200))}`);
}

export function describeZodError(error: ZodError): string {
  const field = error.issues[0]?.path.join(".") || "form";
  return `Check the "${field}" field.`;
}

// Blank form fields arrive as "". Treat them as "not provided".
export const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;