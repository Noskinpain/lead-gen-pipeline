import { isStale } from "./freshness";

const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

console.log("body_text_sample, 10 days old:", isStale(tenDaysAgo, "body_text_sample")); // expect true (TTL is 7)
console.log("website_title, 10 days old:", isStale(tenDaysAgo, "website_title"));       // expect false (TTL is 30)
console.log("industry, 60 days old:", isStale(sixtyDaysAgo, "industry"));               // expect false (TTL is 90)