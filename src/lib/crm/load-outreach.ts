import { supabase } from "../supabase";
import { must } from "./db";
import { personLabel } from "./format";

const QUEUE_LIMIT = 200;

export interface QueueRow {
  id: string;
  subject: string;
  status: string;
  qualityPassed: boolean;
  companyId: string;
  companyName: string;
  contactName: string;
  doNotContact: boolean;
  createdAt: string;
}

export interface ReadyDeal {
  dealId: string;
  dealName: string;
  stage: string;
  companyId: string;
  companyName: string;
  contactName: string;
  contactTitle: string | null;
}

export interface OutreachQueue {
  readyToDraft: ReadyDeal[];
  drafts: QueueRow[];
  approved: QueueRow[];
  history: QueueRow[];
}

interface MessageRow {
  id: string;
  subject: string;
  status: string;
  quality_check_passed: boolean;
  company_id: string;
  contact_id: string;
  created_at: string;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  do_not_contact: boolean;
}

interface CompanyRow {
  id: string;
  company_name: string;
}

interface DealRow {
  id: string;
  name: string;
  stage: string;
  company_id: string;
  contact_id: string | null;
}

export async function loadOutreachQueue(): Promise<OutreachQueue> {
  const [messageResult, dealResult] = await Promise.all([
    supabase
      .from("outreach_messages")
      .select("id, subject, status, quality_check_passed, company_id, contact_id, created_at")
      .order("created_at", { ascending: false })
      .limit(QUEUE_LIMIT),
    supabase
      .from("opportunities")
      .select("id, name, stage, company_id, contact_id")
      .in("stage", ["new", "qualified"])
      .not("contact_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const messages = must<MessageRow[]>(messageResult, "emails");
  const deals = must<DealRow[]>(dealResult, "deals");

  const dealContactIds = [...new Set(deals.map((d) => d.contact_id).filter((id): id is string => id !== null))];
  const contactIds = [...new Set([...messages.map((m) => m.contact_id), ...dealContactIds])];
  const companyIds = [...new Set([...messages.map((m) => m.company_id), ...deals.map((d) => d.company_id)])];

  const [contactResult, companyResult, existingResult] = await Promise.all([
    contactIds.length > 0
      ? supabase
          .from("contacts")
          .select("id, first_name, last_name, job_title, email, do_not_contact")
          .in("id", contactIds)
      : Promise.resolve({ data: [] as ContactRow[], error: null }),
    companyIds.length > 0
      ? supabase.from("companies").select("id, company_name").in("id", companyIds)
      : Promise.resolve({ data: [] as CompanyRow[], error: null }),
    // Any email for these contacts other than a rejected one means they're not "ready to draft"
    dealContactIds.length > 0
      ? supabase.from("outreach_messages").select("contact_id").in("contact_id", dealContactIds).not("status", "eq", "REJECTED")
      : Promise.resolve({ data: [] as Array<{ contact_id: string }>, error: null }),
  ]);

  const contacts = must<ContactRow[]>(contactResult, "contacts");
  const companies = must<CompanyRow[]>(companyResult, "companies");
  const existing = must<Array<{ contact_id: string }>>(existingResult, "existing emails");

  const contactName = (c: ContactRow | undefined) => (c ? `${c.first_name} ${c.last_name}` : "Unknown contact");
  const companyName = (id: string) => companies.find((c) => c.id === id)?.company_name ?? "Unknown company";

  const rows: QueueRow[] = messages.map((m) => {
    const contact = contacts.find((c) => c.id === m.contact_id);
    return {
      id: m.id,
      subject: m.subject,
      status: m.status,
      qualityPassed: m.quality_check_passed,
      companyId: m.company_id,
      companyName: companyName(m.company_id),
      contactName: contactName(contact),
      doNotContact: contact?.do_not_contact === true,
      createdAt: m.created_at,
    };
  });

  const contactedIds = new Set(existing.map((e) => e.contact_id));
  const readyToDraft: ReadyDeal[] = [];
  for (const deal of deals) {
    if (!deal.contact_id || contactedIds.has(deal.contact_id)) continue;
    const contact = contacts.find((c) => c.id === deal.contact_id);
    if (!contact || contact.do_not_contact || !contact.email) continue;
    readyToDraft.push({
      dealId: deal.id,
      dealName: deal.name,
      stage: deal.stage,
      companyId: deal.company_id,
      companyName: companyName(deal.company_id),
      contactName: contactName(contact),
      contactTitle: contact.job_title,
    });
  }

  return {
    readyToDraft,
    drafts: rows.filter((r) => r.status === "DRAFT"),
    approved: rows.filter((r) => r.status === "APPROVED"),
    history: rows.filter((r) => r.status !== "DRAFT" && r.status !== "APPROVED").slice(0, 50),
  };
}

// ---------- One email ----------

export interface DraftDetail {
  id: string;
  subject: string;
  body: string;
  status: string;
  qualityPassed: boolean;
  qualityIssues: string[];
  claims: Array<{ text: string; source: string }>;
  personalizationUsed: string[];
  createdAt: string;
  editedAt: string | null;
  editedByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectReason: string | null;
  sentAt: string | null;
  company: { id: string; name: string };
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    emailStatus: string | null;
    doNotContact: boolean;
    doNotContactReason: string | null;
  };
  deal: { id: string; name: string; stage: string } | null;
  events: Array<{ id: string; type: string; at: string }>;
}

interface DetailRow {
  id: string;
  subject: string;
  body: string;
  status: string;
  quality_check_passed: boolean;
  quality_issues: unknown;
  claims: unknown;
  personalization_used: unknown;
  company_id: string;
  contact_id: string;
  created_at: string;
  edited_at: string | null;
  edited_by_id: string | null;
  reviewed_at: string | null;
  reviewed_by_id: string | null;
  reject_reason: string | null;
  sent_at: string | null;
}

interface FullContactRow {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  email_status: string | null;
  do_not_contact: boolean;
  do_not_contact_reason: string | null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function claimArray(value: unknown): Array<{ text: string; source: string }> {
  if (!Array.isArray(value)) return [];
  const claims: Array<{ text: string; source: string }> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const claim = item as Record<string, unknown>;
    if (typeof claim.text === "string" && typeof claim.source === "string") {
      claims.push({ text: claim.text, source: claim.source });
    }
  }
  return claims;
}

export async function loadDraftDetail(id: string): Promise<DraftDetail | null> {
  const rows = must<DetailRow[]>(
    await supabase
      .from("outreach_messages")
      .select(
        "id, subject, body, status, quality_check_passed, quality_issues, claims, personalization_used, company_id, contact_id, created_at, edited_at, edited_by_id, reviewed_at, reviewed_by_id, reject_reason, sent_at"
      )
      .eq("id", id)
      .limit(1),
    "email"
  );
  const message = rows[0];
  if (!message) return null;

  const [companyResult, contactResult, profileResult, eventResult, dealResult] = await Promise.all([
    supabase.from("companies").select("id, company_name").eq("id", message.company_id).limit(1),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, job_title, email, email_status, do_not_contact, do_not_contact_reason")
      .eq("id", message.contact_id)
      .limit(1),
    supabase.from("profiles").select("id, email, full_name").eq("approved", true),
    supabase
      .from("outreach_events")
      .select("id, event_type, occurred_at")
      .eq("message_id", id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select("id, name, stage")
      .eq("company_id", message.company_id)
      .eq("contact_id", message.contact_id)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  const company = must<CompanyRow[]>(companyResult, "company")[0];
  const contact = must<FullContactRow[]>(contactResult, "contact")[0];
  const profiles = must<Array<{ id: string; email: string; full_name: string | null }>>(profileResult, "profiles");
  const events = must<Array<{ id: string; event_type: string; occurred_at: string }>>(eventResult, "email history");
  const deal = must<Array<{ id: string; name: string; stage: string }>>(dealResult, "deal")[0];

  const nameOf = (profileId: string | null): string | null => {
    const profile = profiles.find((p) => p.id === profileId);
    return profile ? personLabel(profile) : null;
  };

  return {
    id: message.id,
    subject: message.subject,
    body: message.body,
    status: message.status,
    qualityPassed: message.quality_check_passed,
    qualityIssues: stringArray(message.quality_issues),
    claims: claimArray(message.claims),
    personalizationUsed: stringArray(message.personalization_used),
    createdAt: message.created_at,
    editedAt: message.edited_at,
    editedByName: nameOf(message.edited_by_id),
    reviewedAt: message.reviewed_at,
    reviewedByName: nameOf(message.reviewed_by_id),
    rejectReason: message.reject_reason,
    sentAt: message.sent_at,
    company: { id: message.company_id, name: company?.company_name ?? "Unknown company" },
    contact: {
      id: message.contact_id,
      name: contact ? `${contact.first_name} ${contact.last_name}` : "Unknown contact",
      title: contact?.job_title ?? null,
      email: contact?.email ?? null,
      emailStatus: contact?.email_status ?? null,
      doNotContact: contact?.do_not_contact === true,
      doNotContactReason: contact?.do_not_contact_reason ?? null,
    },
    deal: deal ? { id: deal.id, name: deal.name, stage: deal.stage } : null,
    events: events.map((e) => ({ id: e.id, type: e.event_type, at: e.occurred_at })),
  };
}