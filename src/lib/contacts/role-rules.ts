import { RawContact } from "./types";

export interface ContactRule {
  name: string;
  points: number;
  matches: (contact: RawContact) => boolean;
}

// Points reflect how likely this role is to care about a business
// automation/lead-gen offer — matching today's notes' example table.
// These are starting weights, not settled truth — same spirit as Day 4's
// fit/intent weights.
export const roleRules: ContactRule[] = [
  {
    name: "founder_or_ceo",
    points: 30,
    matches: (c) => c.seniority === "founder" || /\b(ceo|founder)\b/i.test(c.jobTitle ?? ""),
  },
  {
    name: "head_of_sales",
    points: 25,
    matches: (c) => /head of sales/i.test(c.jobTitle ?? ""),
  },
  {
    name: "head_of_marketing",
    points: 25,
    matches: (c) => /head of marketing/i.test(c.jobTitle ?? ""),
  },
  {
    name: "sales_director",
    points: 20,
    matches: (c) => /sales director/i.test(c.jobTitle ?? ""),
  },
  {
    name: "marketing_manager",
    points: 15,
    matches: (c) => /marketing manager/i.test(c.jobTitle ?? ""),
  },
  {
    name: "other_named_role",
    points: 5,
    // Anyone with a real title that didn't match a stronger rule above —
    // better than a total stranger, worse than a targeted role.
    matches: (c) => c.jobTitle !== null && c.jobTitle.trim().length > 0,
  },
];

export function scoreContactRole(contact: RawContact): { score: number; matchedRule: string | null } {
  for (const rule of roleRules) {
    if (rule.matches(contact)) {
      return { score: rule.points, matchedRule: rule.name };
    }
  }
  return { score: 0, matchedRule: null };
}