"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { STAGES, canTransitionStage, type OpportunityStage } from "@/lib/crm/opportunity-state-machine";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/crm/task-constants";
import { describeZodError, emptyToUndefined, goWithMessage, safeReturnTo } from "@/lib/crm/form-helpers";
import { label, toNumberOrNull } from "@/lib/crm/format";

type Outcome = { ok: true; message: string } | { ok: false; error: string };

function finish(returnTo: string, outcome: Outcome): never {
  if (outcome.ok) {
    revalidatePath("/crm", "layout");
    goWithMessage(returnTo, "ok", outcome.message);
  }
  goWithMessage(returnTo, "error", outcome.error);
}

async function isApprovedPerson(id: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("id").eq("id", id).eq("approved", true).maybeSingle();
  return Boolean(data);
}

async function logEvent(
  opportunityId: string,
  actorId: string,
  eventType: string,
  extra: { fromStage?: string; toStage?: string; metadata?: Record<string, unknown> } = {}
) {
  const { error } = await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId,
    event_type: eventType,
    from_stage: extra.fromStage ?? null,
    to_stage: extra.toStage ?? null,
    metadata: extra.metadata ?? null,
    actor_id: actorId,
  });
  if (error) logger.error("Timeline event failed to save", { opportunityId, eventType, error: error.message });
}

// ---------- Move stage ----------

const MoveStageSchema = z.object({
  opportunityId: z.uuid(),
  toStage: z.enum(STAGES),
  lostReason: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
  actualValue: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

async function performMove(userId: string, input: z.infer<typeof MoveStageSchema>): Promise<Outcome> {
  const { data: current, error: loadError } = await supabase
    .from("opportunities")
    .select("id, stage")
    .eq("id", input.opportunityId)
    .maybeSingle();

  if (loadError) {
    logger.error("moveStage: load failed", { error: loadError.message });
    return { ok: false, error: "Could not load the deal." };
  }
  if (!current) return { ok: false, error: "Deal not found." };

  const from = current.stage as OpportunityStage;
  const to = input.toStage;

  if (!canTransitionStage(from, to)) {
    return { ok: false, error: `A deal can't move from ${label(from)} to ${label(to)}.` };
  }
  if (to === "lost" && !input.lostReason) return { ok: false, error: "Add a reason before marking a deal lost." };
  if (to === "won" && input.actualValue === undefined) {
    return { ok: false, error: "Enter the deal value before marking it won." };
  }

  const now = new Date().toISOString();
  const changes: Record<string, unknown> = { stage: to, updated_at: now };
  if (to === "lost") {
    changes.lost_reason = input.lostReason;
    changes.closed_at = now;
  }
  if (to === "won") {
    changes.actual_value = input.actualValue;
    changes.closed_at = now;
  }

  // Only update if the stage is still what we just read, so two people can't
  // silently overwrite each other's change.
  const { data: updated, error: updateError } = await supabase
    .from("opportunities")
    .update(changes)
    .eq("id", input.opportunityId)
    .eq("stage", from)
    .select("id");

  if (updateError) {
    logger.error("moveStage: update failed", { error: updateError.message });
    return { ok: false, error: "Could not save the change." };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Someone else changed this deal. Reload and try again." };
  }

  await logEvent(input.opportunityId, userId, "stage_changed", {
    fromStage: from,
    toStage: to,
    metadata: {
      source: "manual",
      ...(to === "lost" ? { lost_reason: input.lostReason } : {}),
      ...(to === "won" ? { actual_value: input.actualValue } : {}),
    },
  });

  return { ok: true, message: `Moved to ${label(to)}.` };
}

export async function moveStage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = MoveStageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performMove(user.id, parsed.data));
}

// ---------- Update opportunity details ----------

const UpdateOpportunitySchema = z.object({
  opportunityId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  estimatedValue: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  actualValue: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  probability: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
  ownerId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});

async function performUpdate(userId: string, input: z.infer<typeof UpdateOpportunitySchema>): Promise<Outcome> {
  const { data: current, error: loadError } = await supabase
    .from("opportunities")
    .select("id, name, stage, estimated_value, actual_value, probability, owner_id")
    .eq("id", input.opportunityId)
    .maybeSingle();

  if (loadError) {
    logger.error("updateOpportunity: load failed", { error: loadError.message });
    return { ok: false, error: "Could not load the deal." };
  }
  if (!current) return { ok: false, error: "Deal not found." };

  if (input.ownerId && !(await isApprovedPerson(input.ownerId))) {
    return { ok: false, error: "Pick an owner from the list." };
  }

  const next: Record<string, unknown> = {
    name: input.name,
    estimated_value: input.estimatedValue ?? null,
    probability: input.probability ?? null,
    owner_id: input.ownerId ?? null,
  };
  if (current.stage === "won") next.actual_value = input.actualValue ?? null;

  const before: Record<string, unknown> = {
    name: current.name,
    estimated_value: toNumberOrNull(current.estimated_value),
    probability: toNumberOrNull(current.probability),
    owner_id: current.owner_id,
    actual_value: toNumberOrNull(current.actual_value),
  };

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(next)) {
    if (before[key] !== value) changes[key === "owner_id" ? "owner" : key] = { from: before[key], to: value };
  }
  if (Object.keys(changes).length === 0) return { ok: true, message: "No changes to save." };

  const { error: updateError } = await supabase
    .from("opportunities")
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", input.opportunityId);

  if (updateError) {
    logger.error("updateOpportunity: update failed", { error: updateError.message });
    return { ok: false, error: "Could not save the changes." };
  }

  await logEvent(input.opportunityId, userId, "opportunity_updated", { metadata: { changes } });
  return { ok: true, message: "Saved." };
}

export async function updateOpportunity(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = UpdateOpportunitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performUpdate(user.id, parsed.data));
}

// ---------- Notes ----------

const AddNoteSchema = z.object({
  opportunityId: z.uuid(),
  body: z.string().trim().min(1).max(5000),
});

async function performAddNote(userId: string, input: z.infer<typeof AddNoteSchema>): Promise<Outcome> {
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("company_id, contact_id")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (!opportunity) return { ok: false, error: "Deal not found." };

  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      company_id: opportunity.company_id,
      opportunity_id: input.opportunityId,
      contact_id: opportunity.contact_id,
      author_id: userId,
      body: input.body,
    })
    .select("id")
    .single();

  if (error || !note) {
    logger.error("addNote failed", { error: error?.message });
    return { ok: false, error: "Could not save the note." };
  }

  await logEvent(input.opportunityId, userId, "note_added", { metadata: { note_id: note.id } });
  return { ok: true, message: "Note added." };
}

export async function addNote(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = AddNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performAddNote(user.id, parsed.data));
}

// ---------- Tasks ----------

const CreateTaskSchema = z.object({
  opportunityId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(TASK_TYPES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  assignedToId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});

// Due dates are date-only, stored as the end of that day (UTC).
function parseDueDate(date: string | undefined): { ok: true; value: string | null } | { ok: false } {
  if (!date) return { ok: true, value: null };
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { ok: false };
  return { ok: true, value: `${date}T23:59:59Z` };
}

async function performCreateTask(userId: string, input: z.infer<typeof CreateTaskSchema>): Promise<Outcome> {
  const due = parseDueDate(input.dueDate);
  if (!due.ok) return { ok: false, error: "That due date isn't a real date." };

  const assigneeId = input.assignedToId ?? userId;
  if (!(await isApprovedPerson(assigneeId))) return { ok: false, error: "Pick an assignee from the list." };

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("company_id, contact_id")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (!opportunity) return { ok: false, error: "Deal not found." };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      opportunity_id: input.opportunityId,
      company_id: opportunity.company_id,
      contact_id: opportunity.contact_id,
      title: input.title,
      type: input.type,
      priority: input.priority,
      status: "pending",
      due_at: due.value,
      assigned_to_id: assigneeId,
      created_by_id: userId,
    })
    .select("id")
    .single();

  if (error || !task) {
    logger.error("createTask failed", { error: error?.message });
    return { ok: false, error: "Could not create the task." };
  }

  await logEvent(input.opportunityId, userId, "task_created", { metadata: { task_id: task.id, title: input.title } });
  return { ok: true, message: "Task created." };
}

export async function createTask(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = CreateTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performCreateTask(user.id, parsed.data));
}

const SetTaskStatusSchema = z.object({
  taskId: z.uuid(),
  status: z.enum(TASK_STATUSES),
});

async function performSetTaskStatus(userId: string, input: z.infer<typeof SetTaskStatusSchema>): Promise<Outcome> {
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, status, opportunity_id")
    .eq("id", input.taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Task not found." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tasks")
    .update({
      status: input.status,
      completed_at: input.status === "completed" ? now : null,
      updated_at: now,
    })
    .eq("id", input.taskId);

  if (error) {
    logger.error("setTaskStatus failed", { error: error.message });
    return { ok: false, error: "Could not update the task." };
  }

  if (task.opportunity_id) {
    await logEvent(task.opportunity_id, userId, "task_status_changed", {
      metadata: { task_id: task.id, title: task.title, from: task.status, to: input.status },
    });
  }
  return { ok: true, message: `Task marked ${label(input.status)}.` };
}

export async function setTaskStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/crm/pipeline");
  const parsed = SetTaskStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(returnTo, { ok: false, error: describeZodError(parsed.error) });
  finish(returnTo, await performSetTaskStatus(user.id, parsed.data));
}