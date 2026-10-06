import { canTransitionStage, assertStageTransition } from "./opportunity-state-machine";

console.log(canTransitionStage("new", "qualified")); // true
console.log(canTransitionStage("new", "won")); // false — must go through intermediate stages
console.log(canTransitionStage("won", "qualified")); // false — terminal
console.log(canTransitionStage("contacted", "lost")); // true — lost reachable from most stages

try {
  assertStageTransition("new", "won");
} catch (err) {
  console.log("Correctly threw:", (err as Error).message);
}