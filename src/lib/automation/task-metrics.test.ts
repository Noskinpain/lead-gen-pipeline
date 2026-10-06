import { computeTaskMetrics } from "./task-metrics";

async function main() {
  console.log(await computeTaskMetrics());
}

main();