import { fetchWithRetry } from "./http";

async function testPermanentFailure() {
  console.log("--- Testing permanent failure (404) ---");
  try {
    await fetchWithRetry("https://api.github.com/this-does-not-exist");
    console.log("Unexpected: should have thrown");
  } catch (err) {
    console.log("Correctly threw immediately:", (err as Error).message);
  }
}

async function testSuccess() {
  console.log("--- Testing a normal successful request ---");
  const response = await fetchWithRetry("https://api.github.com/repos/facebook/react");
  console.log("Success, status:", response.status);
}

async function testTransientFailure() {
  console.log("--- Testing transient failure (simulated 503) ---");
  try {
    await fetchWithRetry("https://httpstat.us/503");
  } catch (err) {
    console.log("Gave up after retries:", (err as Error).message);
  }
}
async function main() {
  await testPermanentFailure();
  await testSuccess();
  await testTransientFailure();
}

main();