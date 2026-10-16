import { createHash } from "node:crypto";
import { supabase } from "../supabase";
import { logger } from "../logger";
import { escapeLike } from "../crm/db";

export type SuppressionReason = "unsubscribed" | "objected" | "complained" | "bounced" | "manual" | "erased";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Only a hash is stored, so a person who was erased stays suppressed without
// us keeping their address.
export function hashEmail(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : null;
}

export interface SuppressionHit {
  reason: string;
  kind: "email" | "domain" | "contact_flag";
}

// Throws if the lookups fail. Callers must treat that as "blocked": a database
// problem must never be able to allow a send.
export async function findSuppression(email: string): Promise<SuppressionHit | null> {
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);

  const [byEmail, byDomain, byFlag] = await Promise.all([
    supabase.from("suppressions").select("reason").eq("email_hash", hashEmail(normalized)).is("removed_at", null).limit(1),
    domain
      ? supabase.from("suppressions").select("reason").eq("domain", domain).is("removed_at", null).limit(1)
      : Promise.resolve({ data: [] as Array<{ reason: string }>, error: null }),
    // The same address flagged do-not-contact on ANY contact row, at any company
    supabase
      .from("contacts")
      .select("do_not_contact_reason")
      .ilike("email", escapeLike(normalized))
      .eq("do_not_contact", true)
      .limit(1),
  ]);

  if (byEmail.error || byDomain.error || byFlag.error) throw new Error("Could not check the suppression list.");

  if (byEmail.data && byEmail.data.length > 0) return { reason: byEmail.data[0].reason, kind: "email" };
  if (byDomain.data && byDomain.data.length > 0) return { reason: `domain: ${byDomain.data[0].reason}`, kind: "domain" };
  if (byFlag.data && byFlag.data.length > 0) {
    return { reason: byFlag.data[0].do_not_contact_reason ?? "do not contact", kind: "contact_flag" };
  }
  return null;
}

export async function addSuppression(input: {
  email?: string;
  domain?: string;
  reason: SuppressionReason;
  source: string;
  createdById?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email ? normalizeEmail(input.email) : null;
  const domain = input.domain ? input.domain.trim().toLowerCase() : null;
  if ((email === null) === (domain === null)) return { ok: false, error: "Give either an email or a domain." };

  const { error } = await supabase.from("suppressions").insert({
    email_hash: email ? hashEmail(email) : null,
    domain,
    reason: input.reason,
    source: input.source,
    created_by_id: input.createdById ?? null,
  });

  // 23505: already actively suppressed, which is the state we wanted
  if (error && error.code !== "23505") {
    logger.error("addSuppression failed", { error: error.message });
    return { ok: false, error: "Could not save the suppression." };
  }
  return { ok: true };
}