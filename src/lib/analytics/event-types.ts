// The single source of truth for every event type in the system.
// Anywhere code inserts an event row, it should reference this list,
// not a raw string — so a typo ('lead_qualifed') can't silently create
// an event type that never gets counted anywhere.
export const EVENT_TYPES = [
  "lead_created",
  "lead_qualified",
  "contact_found",
  "contact_verified",
  "message_generated",
  "message_approved",
  "message_sent",
  "message_delivered",
  "message_bounced",
  "reply_received",
  "positive_reply",
  "meeting_booked",
  "opportunity_created",
  "opportunity_won",
  "opportunity_lost",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];