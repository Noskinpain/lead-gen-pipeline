import { supabase } from "../supabase";

export interface TimeWindow {
  label: "today" | "7d" | "30d" | "all";
  since: string | null; // ISO timestamp, or null for "all time"
}

export function getTimeWindow(label: TimeWindow["label"]): TimeWindow {
  const now = Date.now();
  const days = { today: 1, "7d": 7, "30d": 30, all: null }[label];
  return { label, since: days ? new Date(now - days * 24 * 60 * 60 * 1000).toISOString() : null };
}

export interface FullFunnel {
  window: TimeWindow["label"];
  discovered: number;
  qualified: number;
  contactsFound: number;
  verified: number;
  sent: number;
  delivered: number;
  replied: number;
  positiveReplies: number;
  meetings: number;
  opportunities: number;
  won: number;
}

async function countSince(table: string, since: string | null, filters?: (q: any) => any) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (since) query = query.gte("created_at", since);
  if (filters) query = filters(query);
  const { count } = await query;
  return count ?? 0;
}

export async function computeFullFunnel(windowLabel: TimeWindow["label"] = "all"): Promise<FullFunnel> {
  const { since } = getTimeWindow(windowLabel);

  const [discovered, qualified, contactsFound, verified, sent, delivered, replied, meetings, opportunities, won] = await Promise.all([
    countSince("companies", since),
    countSince("lead_scores", since, (q) => q.in("priority", ["HIGH", "MEDIUM", "LOW"])),
    countSince("contacts", since),
    countSince("contacts", since, (q) => q.in("email_status", ["verified", "risky"])),
    countSince("outreach_messages", since, (q) => q.eq("status", "SENT")),
    countSince("outreach_messages", since, (q) => q.eq("status", "DELIVERED")),
    countSince("outreach_messages", since, (q) => q.eq("status", "REPLIED")),
    countSince("tasks", since, (q) => q.eq("type", "schedule_meeting")),
    countSince("opportunities", since),
    countSince("opportunities", since, (q) => q.eq("stage", "won")),
  ]);

  // "positive replies" isn't a tracked state on its own today — it's
  // implicitly any reply the automation rules classified as "interested"
  // (Day 8's high_confidence_interested rule creating a schedule_meeting
  // task is the closest real proxy currently in the system). Rather than
  // invent a number, be explicit that this is a proxy, not a direct count.
  const positiveReplies = meetings; // honest proxy, not a separate tracked metric — see comment above

  return { window: windowLabel, discovered, qualified, contactsFound, verified, sent, delivered, replied, positiveReplies, meetings, opportunities, won };
}