export type MessageStatus =
  | "DRAFT"
  | "APPROVED"
  | "SCHEDULED"
  | "SENT"
  | "DELIVERED"
  | "REPLIED"
  | "QUALIFIED"
  | "MEETING_BOOKED"
  | "CONVERTED"
  | "BOUNCED"
  | "UNSUBSCRIBED"
  | "NO_REPLY"
  | "REJECTED";

// Explicit allowed transitions: a message can only move to a state reachable
// from its current one. This prevents, e.g., a BOUNCED message from later
// being marked SENT, or a DRAFT jumping straight to CONVERTED.
const ALLOWED_TRANSITIONS: Record<MessageStatus, MessageStatus[]> = {
  DRAFT: ["APPROVED", "REJECTED"],
  APPROVED: ["SCHEDULED", "SENT", "REJECTED"],
  SCHEDULED: ["SENT"],
  SENT: ["DELIVERED", "BOUNCED"],
  DELIVERED: ["REPLIED", "NO_REPLY"],
  NO_REPLY: ["REPLIED"], // a late reply after a follow-up is still valid
  REPLIED: ["QUALIFIED", "UNSUBSCRIBED"],
  QUALIFIED: ["MEETING_BOOKED"],
  MEETING_BOOKED: ["CONVERTED"],
  CONVERTED: [],
  BOUNCED: [],
  UNSUBSCRIBED: [],
  REJECTED: [],
};

export function canTransition(from: MessageStatus, to: MessageStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: MessageStatus, to: MessageStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
}