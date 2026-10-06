import { fetchWebsiteEnrichment } from "./website-source";

async function main() {
  const result = await fetchWebsiteEnrichment("stripe.com");
  console.log(result);
}

main();