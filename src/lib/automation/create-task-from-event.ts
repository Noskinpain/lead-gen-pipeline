import { supabase } from "../supabase";
import { evaluateRules } from "./rules";
import { AutomationContext } from "./types";
import { logger } from "../logger";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createTasksFromReplyEvent(sourceEventId: string, opportunityId: string, context: AutomationContext) {
  const matchedRules = evaluateRules("reply_classified", context);
  const results: Array<{ rule: string; result: string }> = [];

  // Tasks inherit the deal's company, contact and owner so they show up on
  // the company page and land on the right person's task list.
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("company_id, contact_id, owner_id")
    .eq("id", opportunityId)
    .maybeSingle();

  for (const rule of matchedRules) {
    if (rule.action.type !== "create_task") continue;

    // A unique source_event_id per (event, rule) pair, so the SAME event
    // triggering the SAME rule twice is caught, but a single event that
    // legitimately matches two different rules still creates two tasks.
    const dedupeKey = `${sourceEventId}:${rule.name}`;
    const dueDays = rule.action.priority === "high" ? 1 : 2;

    const { error } = await supabase.from("tasks").insert({
      opportunity_id: opportunityId,
      company_id: opportunity?.company_id ?? null,
      contact_id: opportunity?.contact_id ?? null,
      assigned_to_id: opportunity?.owner_id ?? null,
      type: rule.action.taskType,
      title: rule.action.title,
      priority: rule.action.priority,
      due_at: new Date(Date.now() + dueDays * DAY_MS).toISOString(),
      source_event_id: dedupeKey,
    });

    if (error) {
      if (error.code === "23505") {
        // Postgres unique-violation code: this exact event+rule already
        // created a task. Correctly ignored, not retried or duplicated.
        logger.info("Task already exists for this event — skipped", { sourceEventId, rule: rule.name });
        results.push({ rule: rule.name, result: "already_exists" });
      } else {
        logger.error("Failed to create task", { sourceEventId, rule: rule.name, error: error.message });
        results.push({ rule: rule.name, result: "failed" });
      }
      continue;
    }

    logger.info("Task created from automation rule", { sourceEventId, rule: rule.name, opportunityId });
    results.push({ rule: rule.name, result: "created" });
  }

  return results;
}