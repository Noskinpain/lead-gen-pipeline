import { scoreToPriority } from "./score-company";

const cases = [
  { score: 0, expected: "REJECT" },
  { score: 39, expected: "REJECT" },
  { score: 40, expected: "LOW" },
  { score: 59, expected: "LOW" },
  { score: 60, expected: "MEDIUM" },
  { score: 79, expected: "MEDIUM" },
  { score: 80, expected: "HIGH" },
  { score: 100, expected: "HIGH" },
];

for (const { score, expected } of cases) {
  const actual = scoreToPriority(score);
  const pass = actual === expected;
  console.log(`${pass ? "✅" : "❌"} score=${score} → ${actual} (expected ${expected})`);
}