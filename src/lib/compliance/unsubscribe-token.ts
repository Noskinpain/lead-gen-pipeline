import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = (process.env.UNSUBSCRIBE_SECRET ?? "").trim();
  if (value.length < 32) throw new Error("UNSUBSCRIBE_SECRET must be set to at least 32 characters.");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

// The token carries only the message id, signed so it can't be forged or
// guessed. It never expires: an unsubscribe link must keep working.
export function createUnsubscribeToken(messageId: string): string {
  const payload = Buffer.from(JSON.stringify({ m: messageId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { messageId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { m?: unknown };
    return typeof data.m === "string" && data.m.length > 0 ? { messageId: data.m } : null;
  } catch {
    return null;
  }
}