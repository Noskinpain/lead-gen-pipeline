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
  blocked: boolean
): QualityCheckResult {
  const issues: string[] = [];

  // 1. Basic structural checks
  if (!contactEmail) issues.push("No recipient email address available.");
  if (!message.subject || message.subject.trim().length === 0) issues.push("Missing subject line.");
  if (!message.body || message.body.trim().length === 0) issues.push("Missing body.");
  if (message.body && message.body.length > 1500) issues.push("Body exceeds maximum length.");

  // 2. A placeholder like [Your Name] that nobody filled in
  if (/\[[A-Za-z][^\]\n]{1,40}\]/.test(`${message.subject} ${message.body}`)) {
    issues.push("Unfilled placeholder in the email, such as [Your Name].");
  }

  // 3. CTA presence: a crude but real check, and deterministic.
  const hasCta = /\?|would you|worth a|open to|interested in/i.test(message.body ?? "");
  if (!hasCta) issues.push("No clear call-to-action detected in body.");

  // 4. Claim traceability: every claimed source must be a real signal that
  // was actually present in the context.
  const validSignalNames = new Set(context.signals.map((s) => s.name));
  const unsupportedClaims = message.claims.filter((c) => !validSignalNames.has(c.source));
  if (unsupportedClaims.length > 0) {
    issues.push(
      `${unsupportedClaims.length} claim(s) reference a source not present in the actual context: ${unsupportedClaims.map((c) => c.source).join(", ")}.`
    );
  }

  // 5. Eligibility checks
  if (alreadyContacted) issues.push("Contact has already been messaged.");
  if (blocked) issues.push("Contact is blocked from receiving email (do not contact or suppressed).");

  return { passed: issues.length === 0, issues };
}