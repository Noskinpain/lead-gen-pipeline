import { canTransition, assertTransition } from "./state-machine";

console.log(canTransition("DRAFT", "APPROVED")); // expect true
console.log(canTransition("DRAFT", "SENT")); // expect false — must go through APPROVED first
console.log(canTransition("BOUNCED", "SENT")); // expect false — terminal state
console.log(canTransition("SENT", "DELIVERED")); // expect true

try {
  assertTransition("BOUNCED", "SENT");
} catch (err) {
  console.log("Correctly threw:", (err as Error).message);
}