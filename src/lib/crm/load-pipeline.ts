import { supabase } from "../supabase";
import { must } from "./db";
import { isOverdue, personLabel } from "./format";

export type OwnerFilter = "all" | "mine" | "unassigned";

export interface BoardCard {
  id: string;
  name: string;
  stage: string;
  companyName: string;
  contactName: string | null;
  contactTitle: string | null;
  estimatedValue: number | null;
  ownerName: string | null;
  updatedAt: string;
  openTasks: number;
  overdueTasks: number;
}

interface OppRow {
  id: string;
  name: string;
  stage: string;
  estimated_value: number | null;
  owner_id: string | null;
  updated_at: string;
  company_id: string;
  contact_id: string | null;
}

interface CompanyRow {
  id: string;
  company_name: string;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
}

interface OpenTaskRow {
  opportunity_id: string;
  status: string;
  due_at: string | null;
}

export async function loadBoard(filter: OwnerFilter, userId: string): Promise<BoardCard[]> {
  let query = supabase
    .from("opportunities")
    .select("id, name, stage, estimated_value, owner_id, updated_at, company_id, contact_id");
  if (filter === "mine") query = query.eq("owner_id", userId);
  if (filter === "unassigned") query = query.is("owner_id", null);

  const opportunities = must<OppRow[]>(await query.order("updated_at", { ascending: false }), "opportunities");
  if (opportunities.length === 0) return [];

  const companyIds = [...new Set(opportunities.map((o) => o.company_id))];
  const contactIds = [...new Set(opportunities.map((o) => o.contact_id).filter((id): id is string => id !== null))];
  const opportunityIds = opportunities.map((o) => o.id);

  const [companies, contacts, profiles, tasks] = await Promise.all([
    supabase.from("companies").select("id, company_name").in("id", companyIds),
    contactIds.length > 0
      ? supabase.from("contacts").select("id, first_name, last_name, job_title").in("id", contactIds)
      : Promise.resolve({ data: [] as ContactRow[], error: null }),
    supabase.from("profiles").select("id, email, full_name").eq("approved", true),
    supabase
      .from("tasks")
      .select("opportunity_id, status, due_at")
      .in("opportunity_id", opportunityIds)
      .in("status", ["pending", "in_progress"]),
  ]);

  const companyRows = must<CompanyRow[]>(companies, "companies");
  const contactRows = must<ContactRow[]>(contacts, "contacts");
  const profileRows = must<ProfileRow[]>(profiles, "profiles");
  const taskRows = must<OpenTaskRow[]>(tasks, "tasks");

  return opportunities.map((o) => {
    const contact = contactRows.find((c) => c.id === o.contact_id);
    const owner = profileRows.find((p) => p.id === o.owner_id);
    const myTasks = taskRows.filter((t) => t.opportunity_id === o.id);

    return {
      id: o.id,
      name: o.name,
      stage: o.stage,
      companyName: companyRows.find((c) => c.id === o.company_id)?.company_name ?? "Unknown company",
      contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
      contactTitle: contact?.job_title ?? null,
      estimatedValue: o.estimated_value === null ? null : Number(o.estimated_value),
      ownerName: owner ? personLabel(owner) : null,
      updatedAt: o.updated_at,
      openTasks: myTasks.length,
      overdueTasks: myTasks.filter((t) => isOverdue(t.due_at, t.status)).length,
    };
  });
}