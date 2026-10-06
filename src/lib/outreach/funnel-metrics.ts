import { supabase } from "../supabase";

export interface FunnelMetrics {
  companiesIdentified: number;
  qualifiedCompanies: number;
  contactsFound: number;
  verifiedContacts: number;
  messagesGenerated: number;
  messagesApproved: number;
  messagesSent: number;
  delivered: number;
  replied: number;
}

export async function computeFunnelMetrics(): Promise<FunnelMetrics> {
  const [
    { count: companiesIdentified },
    { count: qualifiedCompanies },
    { count: contactsFound },
    { count: verifiedContacts },
    { count: messagesGenerated },
    { count: messagesApproved },
    { count: messagesSent },
    { count: delivered },
    { count: replied },
  ] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("lead_scores").select("*", { count: "exact", head: true }).in("priority", ["HIGH", "MEDIUM", "LOW"]),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("contacts").select("*", { count: "exact", head: true }).in("email_status", ["verified", "risky"]),
    supabase.from("outreach_messages").select("*", { count: "exact", head: true }),
    supabase.from("outreach_messages").select("*", { count: "exact", head: true }).not("status", "eq", "DRAFT"),
    supabase.from("outreach_messages").select("*", { count: "exact", head: true }).eq("status", "SENT"),
    supabase.from("outreach_messages").select("*", { count: "exact", head: true }).eq("status", "DELIVERED"),
    supabase.from("outreach_messages").select("*", { count: "exact", head: true }).eq("status", "REPLIED"),
  ]);

  return {
    companiesIdentified: companiesIdentified ?? 0,
    qualifiedCompanies: qualifiedCompanies ?? 0,
    contactsFound: contactsFound ?? 0,
    verifiedContacts: verifiedContacts ?? 0,
    messagesGenerated: messagesGenerated ?? 0,
    messagesApproved: messagesApproved ?? 0,
    messagesSent: messagesSent ?? 0,
    delivered: delivered ?? 0,
    replied: replied ?? 0,
  };
}

// Marks which stage-to-stage transitions are actually enforced by the
// pipeline today. A false/misleading percentage is worse than no
// percentage — so ungated pairs show a note instead of bad math.
const GATED_TRANSITIONS = new Set([
  "Companies identified→Qualified companies",
  "Contacts found→Verified contacts",
  "Messages generated→Messages approved",
  "Messages approved→Messages sent",
  "Messages sent→Delivered",
  "Delivered→Replied",
]);

export function printFunnel(metrics: FunnelMetrics) {
  const stages: Array<[string, number]> = [
    ["Companies identified", metrics.companiesIdentified],
    ["Qualified companies", metrics.qualifiedCompanies],
    ["Contacts found", metrics.contactsFound],
    ["Verified contacts", metrics.verifiedContacts],
    ["Messages generated", metrics.messagesGenerated],
    ["Messages approved", metrics.messagesApproved],
    ["Messages sent", metrics.messagesSent],
    ["Delivered", metrics.delivered],
    ["Replied", metrics.replied],
  ];

  let previous: [string, number] | null = null;
  for (const [label, value] of stages) {
    let suffix = "";
    if (previous) {
      const key = `${previous[0]}→${label}`;
      if (GATED_TRANSITIONS.has(key)) {
        const rate = previous[1] > 0 ? Math.round((value / previous[1]) * 100) : 0;
        suffix = ` (${rate}%)`;
      } else {
        suffix = " (not a gated stage in the current pipeline — no meaningful %)";
      }
    }
    console.log(`${label}: ${value}${suffix}`);
    previous = [label, value];
  }
}