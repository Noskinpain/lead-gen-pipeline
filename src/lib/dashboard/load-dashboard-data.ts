import { supabase } from "../supabase";
import { computeFullFunnel, type FullFunnel } from "../analytics/funnel";
import { computeUnitEconomics, type UnitEconomics } from "../analytics/unit-economics";
import { evaluateScoring } from "../evaluation/evaluate-scoring";
import { evaluateContactSelection } from "../evaluation/evaluate-contact-selection";
import { runRegressionSuite } from "../evaluation/regression-suite";
import { must } from "../crm/db";
import { loadProspectTable, type ProspectTable } from "../crm/load-prospects";

export interface CostSummary {
  economics: UnitEconomics;
  llmCalls: number;
}

export interface EvaluationSummary {
  scoring: {
    precision: number | null;
    recall: number | null;
    f1: number | null;
    accuracy: number;
    samples: number;
    constructed: number;
  };
  contactAccuracy: number;
  contactCases: number;
  regression: { passed: number; total: number };
}

export interface DashboardData {
  funnel: FullFunnel | null;
  prospects: ProspectTable | null;
  costs: CostSummary | null;
  evaluation: EvaluationSummary | null;
  errors: string[];
  loadedAt: string;
}

// One failing section must not blank the whole page.
async function section<T>(name: string, errors: string[], fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${name}: ${err instanceof Error ? err.message : "unknown error"}`);
    return fallback;
  }
}

async function loadCosts(): Promise<CostSummary> {
  const economics = await computeUnitEconomics();
  const costRows = must<Array<{ service: string }>>(await supabase.from("usage_costs").select("service"), "usage_costs");
  return { economics, llmCalls: costRows.filter((c) => c.service === "gemini").length };
}

async function loadEvaluation(): Promise<EvaluationSummary> {
  const scoring = evaluateScoring();
  const allScored = [
    ...scoring.matrix.truePositives,
    ...scoring.matrix.falsePositives,
    ...scoring.matrix.falseNegatives,
    ...scoring.matrix.trueNegatives,
  ];

  const contact = evaluateContactSelection();
  const regression = runRegressionSuite();

  return {
    scoring: {
      precision: scoring.precision,
      recall: scoring.recall,
      f1: scoring.f1,
      accuracy: scoring.accuracy,
      samples: allScored.length,
      constructed: allScored.filter((e) => !e.isReal).length,
    },
    contactAccuracy: contact.accuracy,
    contactCases: contact.results.length,
    regression: { passed: regression.results.length - regression.failedCount, total: regression.results.length },
  };
}

export async function loadDashboardData(): Promise<DashboardData> {
  const errors: string[] = [];

  const [funnel, prospects, costs, evaluation] = await Promise.all([
    section<FullFunnel | null>("Funnel", errors, null, () => computeFullFunnel("all")),
    section<ProspectTable | null>("Website prospects", errors, null, loadProspectTable),
    section<CostSummary | null>("Costs", errors, null, loadCosts),
    section<EvaluationSummary | null>("Evaluation", errors, null, loadEvaluation),
  ]);

  return { funnel, prospects, costs, evaluation, errors, loadedAt: new Date().toISOString() };
}