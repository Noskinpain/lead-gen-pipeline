import { supabase } from "../supabase";
import { ScoringResult } from "./score-company";

const SCORING_VERSION = "v1";

export async function saveScore(result: ScoringResult & { needsReview: boolean }) {
  const { error } = await supabase.from("lead_scores").insert({
    company_id: result.companyId,
    fit_score: result.fitScore,
    intent_score: result.intentScore,
    priority_score: result.priorityScore,
    priority: result.priority,
    signals: result.signals,
    explanation: result.explanation,
    needs_review: result.needsReview,
    scoring_version: SCORING_VERSION,
  });

  if (error) throw new Error(`Failed to save score: ${error.message}`);
}