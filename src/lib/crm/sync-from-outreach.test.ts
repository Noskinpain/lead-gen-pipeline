import { syncOpportunityFromOutreach } from "./sync-from-outreach";

async function main() {
  const result = await syncOpportunityFromOutreach("53984b17-457f-4ffc-8ace-8af1888562c7", "9447da65-2633-40bc-900a-11e10f2c15ec");
  console.log(result);

  // Run it again to confirm it doesn't create a duplicate
  const result2 = await syncOpportunityFromOutreach("53984b17-457f-4ffc-8ace-8af1888562c7", "9447da65-2633-40bc-900a-11e10f2c15ec");
  console.log(result2);
}

main();