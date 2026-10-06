export interface AutomationContext {
  opportunityId: string;
  opportunityStage: string;
  daysSinceLastEvent: number;
  replyClassification?: {
    intent: string;
    confidence: number;
  };
}

export type AutomationAction =
  | { type: "create_follow_up" }
  | { type: "create_task"; taskType: string; title: string; priority: "low" | "normal" | "high" }
  | { type: "stop_automation" };

export interface AutomationRule {
  name: string;
  event: string;
  condition: (context: AutomationContext) => boolean;
  action: AutomationAction;
}