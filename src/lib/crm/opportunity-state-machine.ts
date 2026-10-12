export const STAGES = [
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

export type OpportunityStage = (typeof STAGES)[number];

const ALLOWED_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  new: ["qualified", "lost"],
  qualified: ["contacted", "lost"],
  contacted: ["replied", "follow_up", "lost"],
  follow_up: ["replied", "lost"],
  replied: ["interested", "lost"],
  interested: ["meeting_booked", "lost"],
  meeting_booked: ["proposal", "lost"],
  proposal: ["won", "lost"],
  won: [],
  lost: [],
};

export function isStage(value: string): value is OpportunityStage {
  return (STAGES as readonly string[]).includes(value);
}

export function canTransitionStage(from: OpportunityStage, to: OpportunityStage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertStageTransition(from: OpportunityStage, to: OpportunityStage): void {
  if (!canTransitionStage(from, to)) {
    throw new Error(`Invalid opportunity stage transition: ${from} → ${to}`);
  }
}

export function nextStages(from: OpportunityStage): OpportunityStage[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export function isOpenStage(stage: OpportunityStage): boolean {
  return stage !== "won" && stage !== "lost";
}

// Kept for existing callers: "lost" is reachable from every open stage.
export function canMarkLost(from: OpportunityStage): boolean {
  return from !== "won" && from !== "lost";
}