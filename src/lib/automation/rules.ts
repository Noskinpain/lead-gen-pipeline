import { AutomationRule } from "./types";

export const automationRules: AutomationRule[] = [
  {
    name: "no_reply_follow_up",
    event: "state_check",
    condition: (c) => c.opportunityStage === "contacted" && c.daysSinceLastEvent >= 3,
    action: { type: "create_follow_up" },
  },
  {
    name: "high_confidence_interested",
    event: "reply_classified",
    condition: (c) => c.replyClassification?.intent === "interested" && (c.replyClassification?.confidence ?? 0) >= 0.8,
    action: { type: "create_task", taskType: "schedule_meeting", title: "Schedule meeting — high-confidence interest", priority: "high" },
  },
  {
    name: "low_confidence_reply_needs_review",
    event: "reply_classified",
    // Deliberately the inverse of the rule above: any reply classification
    // with confidence below 0.6, regardless of intent, is uncertain enough
    // that a human should look at it rather than the system guessing.
    condition: (c) => (c.replyClassification?.confidence ?? 1) < 0.6,
    action: { type: "create_task", taskType: "review_reply", title: "Review uncertain reply classification", priority: "normal" },
  },
  {
    name: "unsubscribe_stops_automation",
    event: "reply_classified",
    condition: (c) => c.replyClassification?.intent === "unsubscribe",
    action: { type: "stop_automation" },
  },
];

export function evaluateRules(event: string, context: import("./types").AutomationContext): import("./types").AutomationRule[] {
  return automationRules.filter((rule) => rule.event === event && rule.condition(context));
}