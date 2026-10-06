import { scoreRealCompany } from "./score-real-company";

async function main() {
  const result = await scoreRealCompany("8bbac66f-4f28-425e-bbae-f1dc84b4c59e"); // your Stripe test company
  console.log(result);
}

main();