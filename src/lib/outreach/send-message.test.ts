import { sendMessage } from "./send-message";

async function main() {
  const result = await sendMessage("ff92d8ef-8c28-4ed3-8056-ebb68505c0eb");
  console.log(result);
}

main();