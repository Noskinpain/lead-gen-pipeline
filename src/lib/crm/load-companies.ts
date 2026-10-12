import { supabase } from "../supabase";
import { escapeLike, must } from "./db";
import { isOverdue, personLabel, toNumberOrNull } from "./format";
import { extractWebsiteSignals } from "../website-scoring/website-signals";
import { scoreWebsiteOpportunity } from "../website-scoring/score-website-opportunity";

const LIST_LIMIT = 100;
const LIST_COLUMNS = "id, company_name, domain, industry, location, status, source, created_at";

// Display order for stored enrichment facts; anything else follows alphabetically.
const FACT_ORDER = [
  "website_title",
  "meta_description",
  "industry",
  "business_model",
  "customer_type",
  "contact_signals",
  "body_text_sample",
];

// ---------- Company list ----------

export interface CompanyListRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  status: string;
  source: string | null;
  createdAt: string;
  contactCount: number;
  openDeals: number;
  priority: string | null;
}

interface ListCompanyRow {
  id: string;
  company_name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
}

export async function loadCompanyList(
  search: string,
  showArchived: boolean
): Promise<{ rows: CompanyListRow[]; limited: boolean }> {
  const baseQuery = () => {
    const query = supabase.from("companies").select(LIST_COLUMNS);
    return showArchived ? query : query.or("status.is.null,status.neq.archived");
  };

  const term = search.trim();
  let companies: ListCompanyRow[];
  let limited = false;

  if (term) {
    // Two separate queries instead of one .or() string, so search text can
    // never alter the filter syntax.
    const pattern = `%${escapeLike(term)}%`;
    const [byName, byDomain] = await Promise.all([
      baseQuery().ilike("company_name", pattern).limit(LIST_LIMIT),
      baseQuery().ilike("domain", pattern).limit(LIST_LIMIT),
    ]);
    const merged = [
      ...must<ListCompanyRow[]>(byName, "company search"),
      ...must<ListCompanyRow[]>(byDomain, "website search"),
    ];
    const seen = new Set<string>();
    companies = merged.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    companies.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    const all = must<ListCompanyRow[]>(
      await baseQuery().order("created_at", { ascending: false }).limit(LIST_LIMIT + 1),
      "companies"
    );
    limited = all.length > LIST_LIMIT;
    companies = all.slice(0, LIST_LIMIT);
  }

  if (companies.length === 0) return { rows: [], limited };

  const ids = companies.map((c) => c.id);
  const [dealResult, contactResult, scoreResult] = await Promise.all([
    supabase.from("opportunities").select("company_id, stage").in("company_id", ids),
    supabase.from("contacts").select("company_id").in("company_id", ids),
    supabase
      .from("lead_scores")
      .select("company_id, priority, created_at")
      .in("company_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const deals = must<Array<{ company_id: string; stage: string }>>(dealResult, "deals");
  const contacts = must<Array<{ company_id: string }>>(contactResult, "contacts");
  const scores = must<Array<{ company_id: string; priority: string }>>(scoreResult, "lead scores");

  const rows: CompanyListRow[] = companies.map((c) => ({
    id: c.id,
    name: c.company_name,
    domain: c.domain,
    industry: c.industry,
    location: c.location,
    status: c.status ?? "active",
    source: c.source,
    createdAt: c.created_at,
    contactCount: contacts.filter((x) => x.company_id === c.id).length,
    openDeals: deals.filter((d) => d.company_id === c.id && d.stage !== "won" && d.stage !== "lost").length,
    priority: scores.find((s) => s.company_id === c.id)?.priority ?? null,
  }));

  return { rows, limited };
}

// ---------- Company detail ----------

export interface CompanyContact {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  seniority: string | null;
  email: string | null;
  emailStatus: string | null;
  contactScore: number | null;
  source: string;
}

export interface CompanyDetail {
  company: {
    id: string;
    name: string;
    website: string | null;
    domain: string | null;
    industry: string | null;
    location: string | null;
    employeeCount: number | null;
    source: string | null;
    status: string;
    createdAt: string;
  };
  contacts: CompanyContact[];
  deals: Array<{
    id: string;
    name: string;
    stage: string;
    estimatedValue: number | null;
    contactName: string | null;
    updatedAt: string;
  }>;
  notes: Array<{ id: string; body: string; authorName: string; createdAt: string; context: string }>;
  tasks: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    dueAt: string | null;
    overdue: boolean;
    opportunityId: string | null;
  }>;
  facts: Array<{ field: string; value: string; source: string; confidence: number | null; observedAt: string }>;
  score: {
    priority: string;
    fit: number;
    intent: number;
    explanation: string;
    version: string;
    createdAt: string;
  } | null;
  websiteOpportunity: { score: number; gaps: string[] } | null;
  messages: Array<{ id: string; subject: string; status: string; createdAt: string; contactName: string | null }>;
}

interface CompanyRow {
  id: string;
  company_name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  source: string | null;
  status: string | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  department: string | null;
  seniority: string | null;
  email: string | null;
  email_status: string | null;
  contact_score: number | null;
  contact_source: string;
}

interface DealRow {
  id: string;
  name: string;
  stage: string;
  estimated_value: number | null;
  contact_id: string | null;
  updated_at: string;
}

interface NoteRow {
  id: string;
  body: string;
  author_id: string | null;
  opportunity_id: string | null;
  contact_id: string | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  type: string;
  status: string;
  due_at: string | null;
  opportunity_id: string | null;
}

interface FactRow {
  field_name: string;
  field_value: string;
  source: string;
  confidence: number | null;
  observed_at: string;
}

interface ScoreRow {
  priority: string;
  fit_score: number;
  intent_score: number;
  explanation: string;
  scoring_version: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  subject: string;
  status: string;
  contact_id: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
}

export async function loadCompanyDetail(id: string): Promise<CompanyDetail | null> {
  const companyRows = must<CompanyRow[]>(
    await supabase
      .from("companies")
      .select("id, company_name, website, domain, industry, location, employee_count, source, status, created_at")
      .eq("id", id)
      .limit(1),
    "company"
  );
  const company = companyRows[0];
  if (!company) return null;

  const [contactRes, dealRes, noteRes, taskRes, factRes, scoreRes, messageRes, profileRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, first_name, last_name, job_title, department, seniority, email, email_status, contact_score, contact_source")
      .eq("company_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("opportunities")
      .select("id, name, stage, estimated_value, contact_id, updated_at")
      .eq("company_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("notes")
      .select("id, body, author_id, opportunity_id, contact_id, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("tasks")
      .select("id, title, type, status, due_at, opportunity_id")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("company_enrichments")
      .select("field_name, field_value, source, confidence, observed_at")
      .eq("company_id", id)
      .order("observed_at", { ascending: false }),
    supabase
      .from("lead_scores")
      .select("priority, fit_score, intent_score, explanation, scoring_version, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("outreach_messages")
      .select("id, subject, status, contact_id, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("id, email, full_name").eq("approved", true),
  ]);

  const contactRows = must<ContactRow[]>(contactRes, "contacts");
  const dealRows = must<DealRow[]>(dealRes, "deals");
  const noteRows = must<NoteRow[]>(noteRes, "notes");
  const taskRows = must<TaskRow[]>(taskRes, "tasks");
  const factRows = must<FactRow[]>(factRes, "enrichment");
  const scoreRows = must<ScoreRow[]>(scoreRes, "lead score");
  const messageRows = must<MessageRow[]>(messageRes, "emails");
  const profiles = must<ProfileRow[]>(profileRes, "profiles");

  const contactName = (contactId: string | null): string | null => {
    const contact = contactRows.find((c) => c.id === contactId);
    return contact ? `${contact.first_name} ${contact.last_name}` : null;
  };

  const authorName = (authorId: string | null): string => {
    const profile = profiles.find((p) => p.id === authorId);
    return profile ? personLabel(profile) : "unknown";
  };

  // Facts arrive newest first, so the first one seen per field is the latest.
  const latestByField = new Map<string, FactRow>();
  for (const fact of factRows) {
    if (!latestByField.has(fact.field_name)) latestByField.set(fact.field_name, fact);
  }

  const rank = (field: string) => {
    const index = FACT_ORDER.indexOf(field);
    return index === -1 ? 99 : index;
  };
  const facts = [...latestByField.values()]
    .sort((a, b) => rank(a.field_name) - rank(b.field_name) || a.field_name.localeCompare(b.field_name))
    .map((f) => ({
      field: f.field_name,
      value: f.field_value,
      source: f.source,
      confidence: toNumberOrNull(f.confidence),
      observedAt: f.observed_at,
    }));

  const factValue = (field: string): string | null => latestByField.get(field)?.field_value ?? null;
  const hasWebFacts = ["meta_description", "body_text_sample", "contact_signals"].some((f) => latestByField.has(f));

  let websiteOpportunity: CompanyDetail["websiteOpportunity"] = null;
  if (hasWebFacts) {
    const contactFact = factValue("contact_signals");
    const result = scoreWebsiteOpportunity(
      extractWebsiteSignals(
        company.domain,
        factValue("meta_description"),
        factValue("body_text_sample"),
        contactFact === null ? null : contactFact !== "none"
      )
    );
    websiteOpportunity = { score: result.score, gaps: result.signals.filter((s) => s.matched).map((s) => s.name) };
  }

  const latestScore = scoreRows[0];

  return {
    company: {
      id: company.id,
      name: company.company_name,
      website: company.website,
      domain: company.domain,
      industry: company.industry,
      location: company.location,
      employeeCount: toNumberOrNull(company.employee_count),
      source: company.source,
      status: company.status ?? "active",
      createdAt: company.created_at,
    },
    contacts: contactRows.map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      jobTitle: c.job_title,
      department: c.department,
      seniority: c.seniority,
      email: c.email,
      emailStatus: c.email_status,
      contactScore: toNumberOrNull(c.contact_score),
      source: c.contact_source,
    })),
    deals: dealRows.map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      estimatedValue: toNumberOrNull(d.estimated_value),
      contactName: contactName(d.contact_id),
      updatedAt: d.updated_at,
    })),
    notes: noteRows.map((n) => {
      let context = "company";
      if (n.opportunity_id) {
        context = `deal: ${dealRows.find((d) => d.id === n.opportunity_id)?.name ?? "unknown"}`;
      } else if (n.contact_id) {
        context = `contact: ${contactName(n.contact_id) ?? "unknown"}`;
      }
      return { id: n.id, body: n.body, authorName: authorName(n.author_id), createdAt: n.created_at, context };
    }),
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      dueAt: t.due_at,
      overdue: isOverdue(t.due_at, t.status),
      opportunityId: t.opportunity_id,
    })),
    facts,
    score: latestScore
      ? {
          priority: latestScore.priority,
          fit: latestScore.fit_score,
          intent: latestScore.intent_score,
          explanation: latestScore.explanation,
          version: latestScore.scoring_version,
          createdAt: latestScore.created_at,
        }
      : null,
    websiteOpportunity,
    messages: messageRows.map((m) => ({
      id: m.id,
      subject: m.subject,
      status: m.status,
      createdAt: m.created_at,
      contactName: contactName(m.contact_id),
    })),
  };
}