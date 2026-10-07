import { evaluateReplyClassifier } from "./evaluate-reply-classifier";

async function main() {
  const result = await evaluateReplyClassifier();
  console.log("Overall accuracy:", result.overallAccuracy);
  console.log("Per-class:", result.perClass);
  console.log(result.results);
}

main();