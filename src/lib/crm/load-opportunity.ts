import { supabase } from "../supabase";
import { must } from "./db";
import { isOverdue, personLabel, toNumberOrNull } from "./format";

export interface Person {
  id: string;
  label: string;
}

export interface OpportunityDetail {
  opportunity: {
    id: string;
    name: string;
    stage: string;
    estimatedValue: number | null;
    actualValue: number | null;
    probability: number | null;
    ownerId: string | null;
    lostReason: string | null;
    createdAt: string;
    closedAt: string | null;
  };
  company: { id: string; name: string; domain: string | null };
  contact: { id: string; name: string; title: string | null; emailStatus: string | null } | null;
  people: Person[];
  events: Array<{
    id: string;
    eventType: string;
    fromStage: string | null;
    toStage: string | null;
    metadata: Record<string, unknown> | null;
    actorName: string;
    createdAt: string;
  }>;
  notes: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
  tasks: Array<{
    id: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    dueAt: string | null;
    assigneeName: string | null;
    overdue: boolean;
  }>;
  messages: Array<{ id: string; subject: string; status: string; createdAt: string }>;
}

interface OppRow {
  id: string;
  name: string;
  stage: string;
  estimated_value: number | null;
  actual_value: number | null;
  probability: number | null;
  owner_id: string | null;
  lost_reason: string | null;
  company_id: string;
  contact_id: string | null;
  created_at: string;
  closed_at: string | null;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
}

export async function loadOpportunityDetail(id: string): Promise<OpportunityDetail | null> {
  const opportunities = must<OppRow[]>(
    await supabase
      .from("opportunities")
      .select(
        "id, name, stage, estimated_value, actual_value, probability, owner_id, lost_reason, company_id, contact_id, created_at, closed_at"
      )
      .eq("id", id)
      .limit(1),
    "opportunity"
  );
  const opportunity = opportunities[0];
  if (!opportunity) return null;

  const [companyResult, contactResult, profileResult, eventResult, noteResult, taskResult, messageResult] =
    await Promise.all([
      supabase.from("companies").select("id, company_name, domain").eq("id", opportunity.company_id).limit(1),
      opportunity.contact_id
        ? supabase
            .from("contacts")
            .select("id, first_name, last_name, job_title, email_status")
            .eq("id", opportunity.contact_id)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("profiles").select("id, email, full_name").eq("approved", true),
      supabase
        .from("opportunity_events")
        .select("id, event_type, from_stage, to_stage, metadata, actor_id, created_at")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("id, body, author_id, created_at")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, type, priority, status, due_at, assigned_to_id")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("outreach_messages")
        .select("id, subject, status, created_at")
        .eq("company_id", opportunity.company_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const company = must<Array<{ id: string; company_name: string; domain: string | null }>>(companyResult, "company")[0];
  const contact = must<
    Array<{ id: string; first_name: string; last_name: string; job_title: string | null; email_status: string | null }>
  >(contactResult, "contact")[0];
  const profiles = must<ProfileRow[]>(profileResult, "profiles");
  const events = must<
    Array<{
      id: string;
      event_type: string;
      from_stage: string | null;
      to_stage: string | null;
      metadata: Record<string, unknown> | null;
      actor_id: string | null;
      created_at: string;
    }>
  >(eventResult, "timeline");
  const notes = must<Array<{ id: string; body: string; author_id: string | null; created_at: string }>>(
    noteResult,
    "notes"
  );
  const tasks = must<
    Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
      status: string;
      due_at: string | null;
      assigned_to_id: string | null;
    }>
  >(taskResult, "tasks");
  const messages = must<Array<{ id: string; subject: string; status: string; created_at: string }>>(
    messageResult,
    "messages"
  );

  const nameOf = (profileId: string | null): string | null => {
    if (!profileId) return null;
    const profile = profiles.find((p) => p.id === profileId);
    return profile ? personLabel(profile) : null;
  };

  return {
    opportunity: {
      id: opportunity.id,
      name: opportunity.name,
      stage: opportunity.stage,
      estimatedValue: toNumberOrNull(opportunity.estimated_value),
      actualValue: toNumberOrNull(opportunity.actual_value),
      probability: toNumberOrNull(opportunity.probability),
      ownerId: opportunity.owner_id,
      lostReason: opportunity.lost_reason,
      createdAt: opportunity.created_at,
      closedAt: opportunity.closed_at,
    },
    company: {
      id: opportunity.company_id,
      name: company?.company_name ?? "Unknown company",
      domain: company?.domain ?? null,
    },
    contact: contact
      ? {
          id: contact.id,
          name: `${contact.first_name} ${contact.last_name}`,
          title: contact.job_title,
          emailStatus: contact.email_status,
        }
      : null,
    people: profiles.map((p) => ({ id: p.id, label: personLabel(p) })),
    events: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      fromStage: e.from_stage,
      toStage: e.to_stage,
      metadata: e.metadata,
      actorName: nameOf(e.actor_id) ?? "system",
      createdAt: e.created_at,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      authorName: nameOf(n.author_id) ?? "unknown",
      createdAt: n.created_at,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      dueAt: t.due_at,
      assigneeName: nameOf(t.assigned_to_id),
      overdue: isOverdue(t.due_at, t.status),
    })),
    messages: messages.map((m) => ({ id: m.id, subject: m.subject, status: m.status, createdAt: m.created_at })),
  };
}