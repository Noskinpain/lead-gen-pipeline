import type { SenderIdentity } from "./sender-identity";

export function unsubscribeUrlFor(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/unsubscribe/${token}`;
}

// Added to every email at send time, so it can't be edited out of a draft.
export function buildFooter(identity: SenderIdentity, unsubscribeUrl: string, collectedFrom: string | null): string {
  const lines = ["", "--", `${identity.senderName}, ${identity.businessName}`, identity.businessAddress, ""];
  if (collectedFrom) lines.push(`Where your business details came from: ${collectedFrom}`);
  lines.push(`Privacy notice: ${identity.privacyNoticeUrl}`, `Unsubscribe: ${unsubscribeUrl}`);
  return lines.join("\n");
}