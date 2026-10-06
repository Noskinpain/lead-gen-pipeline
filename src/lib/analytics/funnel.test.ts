import { computeFullFunnel } from "./funnel";

async function main() {
  console.log("All time:", await computeFullFunnel("all"));
  console.log("Last 7 days:", await computeFullFunnel("7d"));
}

main();