import { evaluateFollowUp } from "./follow-up";

console.log(evaluateFollowUp("DELIVERED", 1, 0)); // false — too soon
console.log(evaluateFollowUp("DELIVERED", 3, 0)); // true — day 3, first follow-up
console.log(evaluateFollowUp("NO_REPLY", 7, 1)); // true — day 7, second follow-up
console.log(evaluateFollowUp("NO_REPLY", 10, 2)); // false — max follow-ups reached
console.log(evaluateFollowUp("REPLIED", 30, 0)); // false — stop state, regardless of time
console.log(evaluateFollowUp("UNSUBSCRIBED", 30, 0)); // false — stop state