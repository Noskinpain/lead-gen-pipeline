import { groundTruthDataset, GroundTruthEntry } from "./ground-truth";
import { scoreToPriority } from "../scoring/score-company";

export interface ConfusionMatrix {
  truePositives: GroundTruthEntry[];
  falsePositives: GroundTruthEntry[];
  falseNegatives: GroundTruthEntry[];
  trueNegatives: GroundTruthEntry[];
}

export interface ScoringEvalResult {
  matrix: ConfusionMatrix;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number;
}

// The system's own prediction: does this company clear the bar to be
// treated as "worth contacting"? Using MEDIUM-or-above as the system's
// positive prediction — a real, named threshold choice, not implicit.
function systemPredictsWorthContacting(entry: GroundTruthEntry): boolean {
  const priorityScore = Math.round(entry.fitScore * 0.5 + entry.intentScore * 0.5);
  const priority = scoreToPriority(priorityScore);
  return priority === "HIGH" || priority === "MEDIUM";
}

export function evaluateScoring(dataset: GroundTruthEntry[] = groundTruthDataset): ScoringEvalResult {
  const matrix: ConfusionMatrix = { truePositives: [], falsePositives: [], falseNegatives: [], trueNegatives: [] };

  for (const entry of dataset) {
    const predicted = systemPredictsWorthContacting(entry);
    const actual = entry.humanWorthContacting;

    if (predicted && actual) matrix.truePositives.push(entry);
    else if (predicted && !actual) matrix.falsePositives.push(entry);
    else if (!predicted && actual) matrix.falseNegatives.push(entry);
    else matrix.trueNegatives.push(entry);
  }

  const tp = matrix.truePositives.length;
  const fp = matrix.falsePositives.length;
  const fn = matrix.falseNegatives.length;
  const tn = matrix.trueNegatives.length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  const accuracy = (tp + tn) / dataset.length;

  return { matrix, precision, recall, f1, accuracy };
}