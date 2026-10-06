import { githubAdapter } from "./github-adapter";

async function main() {
  const page1 = await githubAdapter.fetchPage(null);
  console.log(`Fetched ${page1.records.length} records`);
  console.log(page1.records[0]);
  console.log("Next cursor:", page1.nextCursor);
}

main();