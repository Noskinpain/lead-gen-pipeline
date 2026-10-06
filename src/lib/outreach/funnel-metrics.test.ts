import { computeFunnelMetrics, printFunnel } from "./funnel-metrics";

async function main() {
  const metrics = await computeFunnelMetrics();
  printFunnel(metrics);
}

main();