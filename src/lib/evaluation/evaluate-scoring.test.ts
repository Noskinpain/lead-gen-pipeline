import { evaluateScoring } from "./evaluate-scoring";

const result = evaluateScoring();
console.log("Precision:", result.precision);
console.log("Recall:", result.recall);
console.log("F1:", result.f1);
console.log("Accuracy:", result.accuracy);
console.log("True Positives:", result.matrix.truePositives.map(e => e.label));
console.log("False Positives:", result.matrix.falsePositives.map(e => e.label));
console.log("False Negatives:", result.matrix.falseNegatives.map(e => e.label));
console.log("True Negatives:", result.matrix.trueNegatives.map(e => e.label));