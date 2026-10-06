import { CompanyForScoring, SignalResult } from "./types";
import { scoreFit } from "./score-fit";
import { scoreIntent } from "./score-intent";
import {evaluateConfidence} from "./confidence";

export interface ScoringResult {
  companyId: string;
  fitScore: number;
  intentScore: number;
  priorityScore: number;
  priority: "HIGH" | "MEDIUM" | "LOW" | "REJECT";
  signals: SignalResult[];
  explanation: string;
    needsReview: boolean;
}

export function scoreToPriority(score: number): ScoringResult["priority"] {
  if (score >= 80) return "HIGH";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "LOW";
  return "REJECT";
}

function buildExplanation(fitSignals: SignalResult[], intentSignals: SignalResult[]): string {
  const matchedFit = fitSignals.filter((s) => s.matched).map((s) => s.name.replace(/_/g, " "));
  const matchedIntent = intentSignals.filter((s) => s.matched).map((s) => s.name.replace(/_/g, " "));

  const fitPart = matchedFit.length > 0
    ? `Fit is supported by: ${matchedFit.join(", ")}.`
    : "No strong fit signals were found.";

  const intentPart = matchedIntent.length > 0
    ? `Intent is supported by: ${matchedIntent.join(", ")}.`
    : "No strong intent signals were found.";

  return `${fitPart} ${intentPart}`;
}

export function scoreCompany(company: CompanyForScoring): ScoringResult {
  const confidenceAction = evaluateConfidence(company.classification_confidence);

  // If confidence is too low, don't let the LLM-derived fields
  // influence scoring at all — treat them as unknown, not wrong.
  const safeCompany: CompanyForScoring =
    confidenceAction === "discard"
      ? { ...company, enriched_industry: null, business_model: null, customer_type: null }
      : company;

  const fit = scoreFit(safeCompany);
  const intent = scoreIntent(safeCompany);
  const priorityScore = Math.round(fit.score * 0.5 + intent.score * 0.5);


  return {
    companyId: company.id,
    fitScore: fit.score,
    intentScore: intent.score,
    priorityScore,
    priority: scoreToPriority(priorityScore),
    signals: [...fit.signals, ...intent.signals],
    explanation: buildExplanation(fit.signals, intent.signals),
    needsReview: confidenceAction === "flag_for_review",
  };
}