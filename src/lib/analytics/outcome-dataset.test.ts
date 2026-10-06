import { buildOutcomeDataset } from "./outcome-dataset";

async function main() {
  const dataset = await buildOutcomeDataset();
  console.table(dataset);
}

main();