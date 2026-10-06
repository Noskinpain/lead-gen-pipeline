import { buildOutreachContext } from "./build-context";

async function main() {
  const context = await buildOutreachContext(
    "8bbac66f-4f28-425e-bbae-f1dc84b4c59e", // Stripe
    "a191ea3f-a913-47c2-8080-e1d0d92255e2"
  );
  console.log(JSON.stringify(context, null, 2));
}

main();