import { runRegressionSuite } from "./regression-suite";

const result = runRegressionSuite();
console.log(`${result.results.length - result.failedCount}/${result.results.length} passed`);
console.table(result.results);