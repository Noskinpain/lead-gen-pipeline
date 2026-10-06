import { supabase } from "../supabase";
import { evaluateRules } from "./rules";
import { AutomationContext } from "./types";
import { logger } from "../logger";

export async function createTasksFromReplyEvent(sourceEventId: string, opportunityId: string, context: AutomationContext) {
  const matchedRules = evaluateRules("reply_classified", context);
  const results: Array<{ rule: string; result: string }> = [];

  for (const rule of matchedRules) {
    if (rule.action.type !== "create_task") continue;

    // A unique source_event_id per (event, rule) pair, so the SAME event
    // triggering the SAME rule twice is caught — but a single event that
    // legitimately matches two different rules still creates two distinct
    // tasks, since those are different, intentional actions.
    const dedupeKey = `${sourceEventId}:${rule.name}`;

    const { error } = await supabase.from("tasks").insert({
      opportunity_id: opportunityId,
      type: rule.action.taskType,
      title: rule.action.title,
      priority: rule.action.priority,
      source_event_id: dedupeKey,
    });

    if (error) {
      if (error.code === "23505") {
        // Postgres unique-violation code — this exact event+rule already
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