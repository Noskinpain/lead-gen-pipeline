import { supabase } from "../supabase";
import { computeFullFunnel, type FullFunnel } from "../analytics/funnel";
import { computeUnitEconomics, type UnitEconomics } from "../analytics/unit-economics";
import { extractWebsiteSignals } from "../website-scoring/website-signals";
import { scoreWebsiteOpportunity } from "../website-scoring/score-website-opportunity";
import { evaluateScoring } from "../evaluation/evaluate-scoring";
import { evaluateContactSelection } from "../evaluation/evaluate-contact-selection";
import { runRegressionSuite } from "../evaluation/regression-suite";

// Companies created by run-prospect-batch.ts carry this source tag.
export const WEBSITE_PROSPECT_SOURCE = "website_prospect_test";

export const PIPELINE_STAGES = [
  "new",
  "qualified",
  "contacted",
  "follow_up",
  "replied",
  "interested",
  "meeting_booked",
  "proposal",
  "won",
  "lost",
] as const;

// ---------- Types the page renders ----------

export interface PipelineEvent {
  eventType: string;
  fromStage: string | null;
  toStage: string | null;
  createdAt: string;
}

export interface PipelineCard {
  id: string;
  name: string;
  stage: string;
  contactName: string | null;
  contactTitle: string | null;
  emailStatus: string | null;
  estimatedValue: number | null;
  owner: string | null;
  updatedAt: string;
  events: PipelineEvent[];
}

export interface TaskRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  opportunityName: string | null;
}

export interface ProspectRow {
  name: string;
  domain: string;
  score: number | null; // null = could not be scored
  contact: string;
  gaps: string[];
}

export interface CostSummary {
  economics: UnitEconomics;
  llmCalls: number;
}

export interface EvaluationSummary {
  scoring: {
    precision: number | null;
    recall: number | null;
    f1: number | null;
    accuracy: number;
    samples: number;
    constructed: number;
  };
  contactAccuracy: number;
  contactCases: number;
  regression: { passed: number; total: number };
}

export interface DashboardData {
  funnel: FullFunnel | null;
  pipeline: PipelineCard[];
  tasks: TaskRow[];
  prospects: ProspectRow[];
  costs: CostSummary | null;
  evaluation: EvaluationSummary | null;
  errors: string[];
  loadedAt: string;
}

// ---------- Database row shapes ----------

interface OppRow {
  id: string;
  name: string;
  stage: string;
  estimated_value: number | null;
  owner: string | null;
  updated_at: string;
  contact_id: string | null;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email_status: string | null;
}

interface EventRow {
  opportunity_id: string;
  event_type: string;
  from_stage: string | null;
  to_stage: string | null;
  created_at: string;
}

interface TaskDbRow {
  id: string;
  opportunity_id: string;
  type: string;
  title: string;
  priority: string;
  status: string;
  due_at: string | null;
}

interface CompanyRow {
  id: string;
  company_name: string;
  domain: string | null;
}

interface FactRow {
  company_id: string;
  field_name: string;
  field_value: string;
  observed_at: string;
}

// ---------- Helpers ----------

// Throws if the query failed, so a broken query shows up as a visible error
// on the dashboard instead of silently rendering as "no data".
function must<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as unknown as T;
}

// One failing section must not blank the whole page.
async function section<T>(name: string, errors: string[], fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${name}: ${err instanceof Error ? err.message : "unknown error"}`);
    return fallback;
  }
}

// ---------- Section loaders ----------

async function loadPipeline(): Promise<PipelineCard[]> {
  const opportunities = must<OppRow[]>(
    await supabase
      .from("opportunities")
      .select("id, name, stage, estimated_value, owner, updated_at, contact_id")
      .order("updated_at", { ascending: false }),
    "opportunities"
  );
  if (opportunities.length === 0) return [];

  const contactIds = [
    ...new Set(opportunities.map((o) => o.contact_id).filter((id): id is string => id !== null)),
  ];
  const opportunityIds = opportunities.map((o) => o.id);

  const contacts =
    contactIds.length > 0
      ? must<ContactRow[]>(
          await supabase
            .from("contacts")
            .select("id, first_name, last_name, job_title, email_status")
            .in("id", contactIds),
          "contacts"
        )
      : [];

  const events = must<EventRow[]>(
    await supabase
      .from("opportunity_events")
      .select("opportunity_id, event_type, from_stage, to_stage, created_at")
      .in("opportunity_id", opportunityIds)
      .order("created_at", { ascending: true }),
    "opportunity_events"
  );

  return opportunities.map((o) => {
    const contact = contacts.find((c) => c.id === o.contact_id);
    return {
      id: o.id,
      name: o.name,
      stage: o.stage,
      contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contactTitle: contact?.job_title ?? null,
      emailStatus: contact?.email_status ?? null,
      estimatedValue: o.estimated_value === null ? null : Number(o.estimated_value),
      owner: o.owner,
      updatedAt: o.updated_at,
      events: events
        .filter((e) => e.opportunity_id === o.id)
        .map((e) => ({
          eventType: e.event_type,
          fromStage: e.from_stage,
          toStage: e.to_stage,
          createdAt: e.created_at,
        })),
    };
  });
}

async function loadTasks(): Promise<TaskRow[]> {
  const tasks = must<TaskDbRow[]>(
    await supabase
      .from("tasks")
      .select("id, opportunity_id, type, title, priority, status, due_at")
      .in("status", ["pending", "in_progress"])
      .order("created_at", { ascending: false }),
    "tasks"
  );
  if (tasks.length === 0) return [];

  const opportunityIds = [...new Set(tasks.map((t) => t.opportunity_id))];
  const opportunities = must<Array<{ id: string; name: string }>>(
    await supabase.from("opportunities").select("id, name").in("id", opportunityIds),
    "task opportunities"
  );

  const now = Date.now();
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    dueAt: t.due_at,
    overdue: t.due_at !== null && new Date(t.due_at).getTime() < now,
    opportunityName: opportunities.find((o) => o.id === t.opportunity_id)?.name ?? null,
  }));
}

async function loadProspects(): Promise<ProspectRow[]> {
  const companies = must<CompanyRow[]>(
    await supabase.from("companies").select("id, company_name, domain").eq("source", WEBSITE_PROSPECT_SOURCE),
    "website prospects"
  );
  if (companies.length === 0) return [];

  // Newest facts first, so .find() below always returns the latest value
  // even if a company was enriched more than once.
  const facts = must<FactRow[]>(
    await supabase
      .from("company_enrichments")
      .select("company_id, field_name, field_value, observed_at")
      .in("company_id", companies.map((c) => c.id))
      .in("field_name", ["meta_description", "body_text_sample", "contact_signals"])
      .order("observed_at", { ascending: false }),
    "prospect enrichments"
  );

  const rows: ProspectRow[] = companies.map((company) => {
    const mine = facts.filter((f) => f.company_id === company.id);

    if (mine.length === 0) {
      return { name: company.company_name, domain: company.domain ?? "", score: null, contact: "-", gaps: [] };
    }

    const latest = (field: string) => mine.find((f) => f.field_name === field)?.field_value ?? null;
    const contactFact = latest("contact_signals");
    const hasContact = contactFact === null ? null : contactFact !== "none";

    const result = scoreWebsiteOpportunity(
      extractWebsiteSignals(company.domain, latest("meta_description"), latest("body_text_sample"), hasContact)
    );

    return {
      name: company.company_name,
      domain: company.domain ?? "",
      score: result.score,
      contact: contactFact ?? "not captured",
      gaps: result.signals.filter((s) => s.matched).map((s) => s.name),
    };
  });

  // Scored rows first (highest score first), unscored rows last.
  rows.sort((a, b) => {
    if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || a.name.localeCompare(b.name);
  });

  return rows;
}

async function loadCosts(): Promise<CostSummary> {
  const economics = await computeUnitEconomics();
  const costRows = must<Array<{ service: string }>>(
    await supabase.from("usage_costs").select("service"),
    "usage_costs"
  );
  return { economics, llmCalls: costRows.filter((c) => c.service === "gemini").length };
}

async function loadEvaluation(): Promise<EvaluationSummary> {
  const scoring = evaluateScoring();
  const allScored = [
    ...scoring.matrix.truePositives,
    ...scoring.matrix.falsePositives,
    ...scoring.matrix.falseNegatives,
    ...scoring.matrix.trueNegatives,
  ];

  const contact = evaluateContactSelection();
  const regression = runRegressionSuite();

  return {
    scoring: {
      precision: scoring.precision,
      recall: scoring.recall,
      f1: scoring.f1,
      accuracy: scoring.accuracy,
      samples: allScored.length,
      constructed: allScored.filter((e) => !e.isReal).length,
    },
    contactAccuracy: contact.accuracy,
    contactCases: contact.results.length,
    regression: { passed: regression.results.length - regression.failedCount, total: regression.results.length },
  };
}

// ---------- Entry point ----------

export async function loadDashboardData(): Promise<DashboardData> {
  const errors: string[] = [];

  const [funnel, pipeline, tasks, prospects, costs, evaluation] = await Promise.all([
    section<FullFunnel | null>("Funnel", errors, null, () => computeFullFunnel("all")),
    section<PipelineCard[]>("Pipeline", errors, [], loadPipeline),
    section<TaskRow[]>("Tasks", errors, [], loadTasks),
    section<ProspectRow[]>("Website prospects", errors, [], loadProspects),
    section<CostSummary | null>("Costs", errors, null, loadCosts),
    section<EvaluationSummary | null>("Evaluation", errors, null, loadEvaluation),
  ]);

  return { funnel, pipeline, tasks, prospects, costs, evaluation, errors, loadedAt: new Date().toISOString() };
}