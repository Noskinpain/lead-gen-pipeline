import { fetchWithRetry } from "./http";

async function testMalformedJson() {
  console.log("--- Testing a response that isn't valid JSON ---");
  try {
    const response = await fetchWithRetry("https://example.com"); // returns HTML, not JSON
    const data = await response.json(); // this should throw — the body isn't JSON
    console.log("Unexpected success:", data);
  } catch (err) {
    console.log("Failed as expected:", (err as Error).message);
  }
}

testMalformedJson();