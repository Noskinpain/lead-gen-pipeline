import { MessageStatus } from "./state-machine";

// States from which a follow-up makes sense — i.e. we sent something
// and haven't heard anything that should stop us.
const FOLLOW_UP_ELIGIBLE_STATES: MessageStatus[] = ["DELIVERED", "NO_REPLY"];

// Terminal/stop states — any of these means: never follow up, regardless
// of how much time has passed.
const STOP_STATES: MessageStatus[] = ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "QUALIFIED", "MEETING_BOOKED", "CONVERTED"];

export interface FollowUpDecision {
  shouldFollowUp: boolean;
  reason: string;
}

export function evaluateFollowUp(status: MessageStatus, daysSinceLastEvent: number, followUpsSent: number): FollowUpDecision {
  if (STOP_STATES.includes(status)) {
    return { shouldFollowUp: false, reason: `Message is in a terminal/stop state (${status}) — never follow up.` };
  }

  if (!FOLLOW_UP_ELIGIBLE_STATES.includes(status)) {
    return { shouldFollowUp: false, reason: `Message status (${status}) is not eligible for follow-up yet.` };
  }

  if (followUpsSent >= 2) {
    return { shouldFollowUp: false, reason: "Maximum follow-up count (2) already reached." };
  }

  // Day 0 initial → Day 3 first follow-up → Day 7 final follow-up,
  // matching today's notes' example cadence.
  const requiredGap = followUpsSent === 0 ? 3 : 7;

  if (daysSinceLastEvent < requiredGap) {
    return { shouldFollowUp: false, reason: `Only ${daysSinceLastEvent} day(s) since last event; ${requiredGap} required.` };
  }

  return { shouldFollowUp: true, reason: `${daysSinceLastEvent} days since last event, ${followUpsSent} follow-up(s) sent so far — eligible.` };
}