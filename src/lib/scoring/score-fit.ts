import { CompanyForScoring, SignalResult } from "./types";
import { fitRules } from "./fit-rules";

export function scoreFit(company: CompanyForScoring): { score: number; signals: SignalResult[] } {
  const signals: SignalResult[] = fitRules.map((rule) => {
    const matched = rule.evaluate(company);
    return { name: rule.name, category: rule.category, points: matched ? rule.points : 0, matched };
  });

  const score = signals.reduce((sum, s) => sum + s.points, 0);

  return { score, signals };
}