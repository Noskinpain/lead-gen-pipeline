import { computePipelineMetrics } from "./opportunity-metrics";

async function main() {
  console.log(await computePipelineMetrics());
}

main();