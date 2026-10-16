export const LAWFUL_BASES = ["consent", "inbound_enquiry", "existing_client", "legitimate_interest", "test_data"] as const;

export type LawfulBasis = (typeof LAWFUL_BASES)[number];

export function isLawfulBasis(value: unknown): value is LawfulBasis {
  return typeof value === "string" && (LAWFUL_BASES as readonly string[]).includes(value);
}

// Record-keeping labels, not legal categories. The note is what makes them mean something.
export const BASIS_HELP: Record<LawfulBasis, string> = {
  consent: "They agreed to hear from you. The note must say when and how (a form, a message, a conversation).",
  inbound_enquiry: "They contacted you first and asked about your service. The note must say where the enquiry came in.",
  existing_client: "They are a current or past client. The note must say what you did for them.",
  legitimate_interest:
    "Your own written assessment that contacting them is justified and fair to them. The note must reference that assessment. The law on this is unsettled for cold outreach, so real sends stay off until you enable them.",
  test_data: "Not a real person: generated or demo data. Can never be emailed for real.",
};

export const MANUAL_SUPPRESSION_REASONS = ["manual", "objected", "complained", "bounced"] as const;