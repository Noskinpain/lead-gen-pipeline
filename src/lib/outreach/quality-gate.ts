import { GeneratedMessage } from "./generate-message";
import { OutreachContext } from "./types";

export interface QualityCheckResult {
  passed: boolean;
  issues: string[];
}

export function runQualityGate(
  message: GeneratedMessage,
  context: OutreachContext,
  contactEmail: string | null,
  alreadyContacted: boolean,
  unsubscribed: boolean
): QualityCheckResult {
  const issues: string[] = [];

  // 1. Basic structural checks
  if (!contactEmail) issues.push("No recipient email address available.");
  if (!message.subject || message.subject.trim().length === 0) issues.push("Missing subject line.");
  if (!message.body || message.body.trim().length === 0) issues.push("Missing body.");
  if (message.body && message.body.length > 1500) issues.push("Body exceeds maximum length.");

  // 2. CTA presence — a crude but real check: does the body contain a
  // question mark or common CTA phrasing? Not perfect, but deterministic.
  const hasCta = /\?|would you|worth a|open to|interested in/i.test(message.body ?? "");
  if (!hasCta) issues.push("No clear call-to-action detected in body.");

  // 3. Claim traceability — every claimed source must correspond to a
  // real signal that was actually present in the context.
  const validSignalNames = new Set(context.signals.map((s) => s.name));
  const unsupportedClaims = message.claims.filter((c) => !validSignalNames.has(c.source));
  if (unsupportedClaims.length > 0) {
    issues.push(`${unsupportedClaims.length} claim(s) reference a source not present in the actual context: ${unsupportedClaims.map((c) => c.source).join(", ")}.`);
  }

  // 4. Eligibility checks — don't message someone twice, don't message
  // someone who opted out.
  if (alreadyContacted) issues.push("Contact has already been messaged.");
  if (unsubscribed) issues.push("Contact has unsubscribed — must not send.");

  return { passed: issues.length === 0, issues };
}