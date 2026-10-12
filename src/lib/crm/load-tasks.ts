import { supabase } from "../supabase";
import { must } from "./db";
import { isOverdue, personLabel } from "./format";

export type TaskScope = "mine" | "all";
export type TaskView = "open" | "closed";

export interface TaskListRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  assigneeName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  companyId: string | null;
  companyName: string | null;
}

interface TaskDbRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  due_at: string | null;
  assigned_to_id: string | null;
  opportunity_id: string | null;
  company_id: string | null;
}

interface DealRow {
  id: string;
  name: string;
  company_id: string;
}

interface CompanyRow {
  id: string;
  company_name: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
}

export async function loadTasks(scope: TaskScope, view: TaskView, userId: string): Promise<TaskListRow[]> {
  let query = supabase
    .from("tasks")
    .select("id, title, type, priority, status, due_at, assigned_to_id, opportunity_id, company_id");
  query = view === "open" ? query.in("status", ["pending", "in_progress"]) : query.in("status", ["completed", "cancelled"]);
  if (scope === "mine") query = query.eq("assigned_to_id", userId);

  const tasks = must<TaskDbRow[]>(await query.order("created_at", { ascending: false }).limit(200), "tasks");
  if (tasks.length === 0) return [];

  const dealIds = [...new Set(tasks.map((t) => t.opportunity_id).filter((id): id is string => id !== null))];
  const deals =
    dealIds.length > 0
      ? must<DealRow[]>(await supabase.from("opportunities").select("id, name, company_id").in("id", dealIds), "task deals")
      : [];

  // Older tasks may have no company of their own, so fall back to the deal's company.
  const companyIdOf = (t: TaskDbRow): string | null =>
    t.company_id ?? deals.find((d) => d.id === t.opportunity_id)?.company_id ?? null;

  const companyIds = [...new Set(tasks.map(companyIdOf).filter((id): id is string => id !== null))];

  const [companyResult, profileResult] = await Promise.all([
    companyIds.length > 0
      ? supabase.from("companies").select("id, company_name").in("id", companyIds)
      : Promise.resolve({ data: [] as CompanyRow[], error: null }),
    supabase.from("profiles").select("id, email, full_name").eq("approved", true),
  ]);
  const companies = must<CompanyRow[]>(companyResult, "task companies");
  const profiles = must<ProfileRow[]>(profileResult, "profiles");

  const rows: TaskListRow[] = tasks.map((t) => {
    const companyId = companyIdOf(t);
    const assignee = profiles.find((p) => p.id === t.assigned_to_id);
    return {
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      dueAt: t.due_at,
      overdue: isOverdue(t.due_at, t.status),
      assigneeName: assignee ? personLabel(assignee) : null,
      opportunityId: t.opportunity_id,
      opportunityName: deals.find((d) => d.id === t.opportunity_id)?.name ?? null,
      companyId,
      companyName: companies.find((c) => c.id === companyId)?.company_name ?? null,
    };
  });

  // Overdue first, then soonest due, then tasks with no date.
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });

  return rows;
}