export interface SenderIdentity {
  senderName: string;
  businessName: string;
  businessAddress: string;
  privacyNoticeUrl: string;
  baseUrl: string;
}

export type SenderIdentityResult = { ok: true; identity: SenderIdentity } | { ok: false; missing: string[] };

const REQUIRED = [
  "SENDER_NAME",
  "BUSINESS_NAME",
  "BUSINESS_ADDRESS",
  "PRIVACY_NOTICE_URL",
  "APP_BASE_URL",
  "UNSUBSCRIBE_SECRET",
] as const;

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

// Reports whether each setting is usable, without ever returning its value.
export function senderSettingStatus(): Array<{ name: string; ok: boolean; problem: string | null }> {
  return REQUIRED.map((name) => {
    const value = read(name);
    if (value === "") return { name, ok: false, problem: "not set" };
    if (name === "UNSUBSCRIBE_SECRET" && value.length < 32) {
      return { name, ok: false, problem: "needs at least 32 characters" };
    }
    if ((name === "PRIVACY_NOTICE_URL" || name === "APP_BASE_URL") && !/^https?:\/\//i.test(value)) {
      return { name, ok: false, problem: "must start with http:// or https://" };
    }
    return { name, ok: true, problem: null };
  });
}

export function getSenderIdentity(): SenderIdentityResult {
  const missing = senderSettingStatus()
    .filter((s) => !s.ok)
    .map((s) => `${s.name} (${s.problem})`);
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    identity: {
      senderName: read("SENDER_NAME"),
      businessName: read("BUSINESS_NAME"),
      businessAddress: read("BUSINESS_ADDRESS"),
      privacyNoticeUrl: read("PRIVACY_NOTICE_URL"),
      baseUrl: read("APP_BASE_URL"),
    },
  };
}