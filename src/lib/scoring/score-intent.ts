import { CompanyForScoring, SignalResult } from "./types";
import { intentRules } from "./intent-rules";

export function scoreIntent(company: CompanyForScoring): { score: number; signals: SignalResult[] } {
  const signals: SignalResult[] = intentRules.map((rule) => {
    const matched = rule.evaluate(company);
    return { name: rule.name, category: rule.category, points: matched ? rule.points : 0, matched };
  });

  const score = signals.reduce((sum, s) => sum + s.points, 0);

  return { score, signals };
}