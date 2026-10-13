import { GeneratedMessage } from "../outreach/generate-message";
import { OutreachContext } from "../outreach/types";

export interface PersonalizationScore {
  factuallyCorrect: boolean;
  supportedBySource: boolean;
  relevant: boolean;
  natural: boolean;
  professional: boolean;
  overallScore: number; // out of 5
  reviewerNotes?: string;
}

// This is deliberately a MANUAL scoring function, not automated —
// matching your notes' "0/1 system, reviewer notes" approach. A human
// reads the message against its real context and makes the call. This
// is NOT an LLM-as-judge today — that's a real, more complex technique
// worth exploring later, not substituted in silently here.
export function scorePersonalization(
  message: GeneratedMessage,
  context: OutreachContext,
  manualAssessment: Omit<PersonalizationScore, "overallScore">
): PersonalizationScore {
  const checks = [manualAssessment.factuallyCorrect, manualAssessment.supportedBySource, manualAssessment.relevant, manualAssessment.natural, manualAssessment.professional];
  const overallScore = checks.filter(Boolean).length;
  return { ...manualAssessment, overallScore };
}