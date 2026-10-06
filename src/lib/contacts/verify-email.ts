import dns from "node:dns/promises";

dns.setServers(["8.8.8.8", "1.1.1.1"]); // Google + Cloudflare public DNS
export type EmailStatus = "verified" | "risky" | "unknown" | "invalid";

export interface VerificationResult {
  status: EmailStatus;
  reason: string;
}

// A small, well-known sample of disposable email domains.
// A real system would use a maintained list/API (hundreds of thousands
// of domains); this is enough to prove the mechanism works.
const DISPOSABLE_DOMAINS = new Set(["mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com"]);

const ROLE_BASED_PREFIXES = new Set(["info", "sales", "support", "contact", "admin", "hello", "team"]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyEmail(email: string | null): Promise<VerificationResult> {
  if (!email) {
    return { status: "unknown", reason: "No email provided." };
  }

  // 1. Syntax
  if (!EMAIL_REGEX.test(email)) {
    return { status: "invalid", reason: "Email fails basic syntax validation." };
  }

  const [localPart, domain] = email.split("@");

  // 2. Disposable domain check
  if (DISPOSABLE_DOMAINS.has(domain.toLowerCase())) {
    return { status: "invalid", reason: "Domain is a known disposable/throwaway email provider." };
  }

  // 3. Domain/MX existence — does this domain actually accept mail?
  try {
  const mxRecords = await dns.resolveMx(domain);
  if (!mxRecords || mxRecords.length === 0) {
    return { status: "invalid", reason: "Domain has no mail server (MX record) configured." };
  }
} catch (err) {
  return { status: "invalid", reason: "Domain does not exist or has no mail configuration." };
}

  // 4. Role-based address — deliverable, but not a real named person
  if (ROLE_BASED_PREFIXES.has(localPart.toLowerCase())) {
    return { status: "risky", reason: "Role-based address (e.g. info@, sales@) — likely reaches a shared inbox, not the named individual." };
  }

  // We cannot confirm the specific mailbox exists without real SMTP
  // verification (out of scope today) — so a syntactically valid,
  // real-domain, non-disposable, non-role-based email is the strongest
  // claim we can honestly make without that deeper check.
  return { status: "risky", reason: "Domain and syntax are valid, but mailbox existence could not be confirmed (no SMTP verification performed)." };
}