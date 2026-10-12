export const TASK_TYPES = [
  "follow_up",
  "review_lead",
  "call",
  "send_proposal",
  "schedule_meeting",
  "review_reply",
  "manual_outreach",
  "other",
] as const;

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;

export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;