import { supabase } from "../supabase";

// How many of the newest records to show behind each funnel number.
export const FUNNEL_DETAIL_LIMIT = 50;

export type FunnelStageKey =
  | "discovered"
  | "qualified"
  | "contactsFound"
  | "verified"
  | "sent"
  | "delivered"
  | "replied"
  | "meetings"
  | "opportunities"
  | "won";

export interface FunnelRecord {
  primary: string;
  secondary: string;
}

export type FunnelDetails = Record<FunnelStageKey, FunnelRecord[]>;

interface CompanyRow {
  id: string;
  company_name: string;
  domain: string | null;
  source: string | null;
  created_at: string;
}

interface ScoreRow {
  company_id: string;
  priority: string;
  fit_score: number;
  intent_score: number;
  created_at: string;
}

interface ContactRow {
  company_id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email_status: string | null;
  created_at: string;
}

interface MessageRow {
  company_id: string;
  subject: string;
  status: string;
  created_at: string;
}

interface MeetingTaskRow {
  title: string;
  status: string;
  opportunity_id: string;
  created_at: string;
}

interface OpportunityRow {
  id: string;
  name: string;
  stage: string;
  updated_at: string;
}

function must<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as unknown as T;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

const newest = { ascending: false };
const CONTACT_COLUMNS = "company_id, first_name, last_name, job_title, email_status, created_at";

function messagesWithStatus(status: string) {
  return supabase
    .from("outreach_messages")
    .select("company_id, subject, status, created_at")
    .eq("status", status)
    .order("created_at", newest)
    .limit(FUNNEL_DETAIL_LIMIT);
}

export async function loadFunnelDetails(): Promise<{ details: FunnelDetails | null; error: string | null }> {
  try {
    const [
      companyResult,
      scoreResult,
      contactResult,
      verifiedResult,
      sentResult,
      deliveredResult,
      repliedResult,
      taskResult,
      opportunityResult,
    ] = await Promise.all([
      supabase
        .from("companies")
        .select("id, company_name, domain, source, created_at")
        .order("created_at", newest)
        .limit(1000),
      supabase
        .from("lead_scores")
        .select("company_id, priority, fit_score, intent_score, created_at")
        .in("priority", ["HIGH", "MEDIUM", "LOW"])
        .order("created_at", newest)
        .limit(FUNNEL_DETAIL_LIMIT),
      supabase.from("contacts").select(CONTACT_COLUMNS).order("created_at", newest).limit(FUNNEL_DETAIL_LIMIT),
      supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .in("email_status", ["verified", "risky"])
        .order("created_at", newest)
        .limit(FUNNEL_DETAIL_LIMIT),
      messagesWithStatus("SENT"),
      messagesWithStatus("DELIVERED"),
      messagesWithStatus("REPLIED"),
      supabase
        .from("tasks")
        .select("title, status, opportunity_id, created_at")
        .eq("type", "schedule_meeting")
        .order("created_at", newest)
        .limit(FUNNEL_DETAIL_LIMIT),
      supabase.from("opportunities").select("id, name, stage, updated_at").order("updated_at", newest).limit(200),
    ]);

    const companies = must<CompanyRow[]>(companyResult, "companies");
    const scores = must<ScoreRow[]>(scoreResult, "lead scores");
    const contacts = must<ContactRow[]>(contactResult, "contacts");
    const verifiedContacts = must<ContactRow[]>(verifiedResult, "verified contacts");
    const sent = must<MessageRow[]>(sentResult, "sent messages");
    const delivered = must<MessageRow[]>(deliveredResult, "delivered messages");
    const replied = must<MessageRow[]>(repliedResult, "replied messages");
    const meetingTasks = must<MeetingTaskRow[]>(taskResult, "meeting tasks");
    const opportunities = must<OpportunityRow[]>(opportunityResult, "opportunities");

    const companyNames = new Map<string, string>(companies.map((c): [string, string] => [c.id, c.company_name]));
    const opportunityNames = new Map<string, string>(opportunities.map((o): [string, string] => [o.id, o.name]));
    const nameOf = (companyId: string) => companyNames.get(companyId) ?? "unknown company";

    // Email addresses are deliberately never included: name, title and status only.
    const contactRecord = (c: ContactRow): FunnelRecord => ({
      primary: `${c.first_name} ${c.last_name}`,
      secondary: `${c.job_title ?? "no title"} | ${nameOf(c.company_id)} | email: ${c.email_status ?? "unknown"} | ${day(c.created_at)}`,
    });

    const messageRecord = (m: MessageRow): FunnelRecord => ({
      primary: nameOf(m.company_id),
      secondary: `"${m.subject}" | ${m.status} | ${day(m.created_at)}`,
    });

    const opportunityRecord = (o: OpportunityRow): FunnelRecord => ({
      primary: o.name,
      secondary: `stage: ${o.stage.replace(/_/g, " ")} | updated ${day(o.updated_at)}`,
    });

    const details: FunnelDetails = {
      discovered: companies.slice(0, FUNNEL_DETAIL_LIMIT).map((c) => ({
        primary: c.company_name,
        secondary: `${c.domain ?? "no domain"} | source: ${c.source ?? "unknown"} | ${day(c.created_at)}`,
      })),
      qualified: scores.map((s) => ({
        primary: nameOf(s.company_id),
        secondary: `${s.priority} | fit ${s.fit_score} | intent ${s.intent_score} | ${day(s.created_at)}`,
      })),
      contactsFound: contacts.map(contactRecord),
      verified: verifiedContacts.map(contactRecord),
      sent: sent.map(messageRecord),
      delivered: delivered.map(messageRecord),
      replied: replied.map(messageRecord),
      meetings: meetingTasks.map((t) => ({
        primary: t.title,
        secondary: `${t.status} | ${opportunityNames.get(t.opportunity_id) ?? "unknown opportunity"} | ${day(t.created_at)}`,
      })),
      opportunities: opportunities.slice(0, FUNNEL_DETAIL_LIMIT).map(opportunityRecord),
      won: opportunities
        .filter((o) => o.stage === "won")
        .slice(0, FUNNEL_DETAIL_LIMIT)
        .map(opportunityRecord),
    };

    return { details, error: null };
  } catch (err) {
    return { details: null, error: `Funnel details: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}