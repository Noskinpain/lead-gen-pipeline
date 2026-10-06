export type ConfidenceAction = "use" | "flag_for_review" | "discard";

export function evaluateConfidence(confidence: number | null): ConfidenceAction {
  if (confidence === null) return "discard"; // no LLM data at all
  if (confidence > 0.8) return "use";
  if (confidence >= 0.5) return "flag_for_review";
  return "discard";
}