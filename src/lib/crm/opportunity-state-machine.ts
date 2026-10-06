export type OpportunityStage =
  | "new" | "qualified" | "contacted" | "replied" | "interested"
  | "meeting_booked" | "proposal" | "won" | "lost" | "follow_up";

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

export function canTransitionStage(from: OpportunityStage, to: OpportunityStage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertStageTransition(from: OpportunityStage, to: OpportunityStage): void {
  if (!canTransitionStage(from, to)) {
    throw new Error(`Invalid opportunity stage transition: ${from} → ${to}`);
  }
}

// "lost" is technically reachable from anywhere except itself and "won" —
// this is worth a dedicated helper, since it's a real, common business
// need (a deal can die at any stage) that the strict linear graph above
// doesn't otherwise allow for non-adjacent stages.
export function canMarkLost(from: OpportunityStage): boolean {
  return from !== "won" && from !== "lost";
}