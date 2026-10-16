import { supabase } from "../supabase";
import { must } from "./db";
import { LAWFUL_BASES } from "../compliance/constants";

export interface ComplianceOverview {
  needingBasis: Array<{
    id: string;
    name: string;
    title: string | null;
    companyId: string;
    companyName: string;
    source: string;
    hasEmail: boolean;
  }>;
  needingBasisTotal: number;
  basisCounts: Array<{ basis: string; count: number }>;
  suppressions: Array<{
    id: string;
    kind: "email" | "domain";
    target: string;
    reason: string;
    source: string;
    createdAt: string;
  }>;
  flagged: Array<{ id: string; name: string; companyId: string; companyName: string; reason: string | null; at: string | null }>;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company_id: string;
  contact_source: string;
  email: string | null;
}

interface FlaggedRow {
  id: string;
  first_name: string;
  last_name: string;
  company_id: string;
  do_not_contact_reason: string | null;
  do_not_contact_at: string | null;
}

export async function loadComplianceOverview(): Promise<ComplianceOverview> {
  const [needingResult, flaggedResult, suppressionResult, ...countResults] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, first_name, last_name, job_title, company_id, contact_source, email", { count: "exact" })
      .is("lawful_basis", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, company_id, do_not_contact_reason, do_not_contact_at")
      .eq("do_not_contact", true)
      .order("do_not_contact_at", { ascending: false })
      .limit(50),
    supabase
      .from("suppressions")
      .select("id, email_hash, domain, reason, source, created_at")
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    ...LAWFUL_BASES.map((basis) =>
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("lawful_basis", basis)
    ),
  ]);

  if (needingResult.error) throw new Error(`contacts: ${needingResult.error.message}`);
  const needing = (needingResult.data ?? []) as ContactRow[];
  const flagged = must<FlaggedRow[]>(flaggedResult, "flagged contacts");
  const suppressions = must<Array<{ id: string; email_hash: string | null; domain: string | null; reason: string; source: string; created_at: string }>>(
    suppressionResult,
    "suppressions"
  );

  const companyIds = [...new Set([...needing.map((c) => c.company_id), ...flagged.map((c) => c.company_id)])];
  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const companies = must<Array<{ id: string; company_name: string }>>(
      await supabase.from("companies").select("id, company_name").in("id", companyIds),
      "companies"
    );
    companies.forEach((c) => companyNames.set(c.id, c.company_name));
  }
  const companyName = (id: string) => companyNames.get(id) ?? "Unknown company";

  return {
    needingBasis: needing.map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      title: c.job_title,
      companyId: c.company_id,
      companyName: companyName(c.company_id),
      source: c.contact_source,
      hasEmail: Boolean(c.email),
    })),
    needingBasisTotal: needingResult.count ?? needing.length,
    basisCounts: LAWFUL_BASES.map((basis, i) => ({ basis, count: countResults[i]?.count ?? 0 })),
    suppressions: suppressions.map((s) => ({
      id: s.id,
      kind: s.domain ? "domain" : "email",
      target: s.domain ?? `hash ${(s.email_hash ?? "").slice(0, 10)}...`,
      reason: s.reason,
      source: s.source,
      createdAt: s.created_at,
    })),
    flagged: flagged.map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      companyId: c.company_id,
      companyName: companyName(c.company_id),
      reason: c.do_not_contact_reason,
      at: c.do_not_contact_at,
    })),
  };
}