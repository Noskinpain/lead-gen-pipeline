import { evaluateRules } from "./rules";

// Should match no_reply_follow_up
console.log(evaluateRules("state_check", { opportunityId: "x", opportunityStage: "contacted", daysSinceLastEvent: 4 }));

// Should match high_confidence_interested
console.log(evaluateRules("reply_classified", { opportunityId: "x", opportunityStage: "contacted", daysSinceLastEvent: 0, replyClassification: { intent: "interested", confidence: 0.9 } }));

// Should match low_confidence_reply_needs_review, NOT high_confidence_interested
console.log(evaluateRules("reply_classified", { opportunityId: "x", opportunityStage: "contacted", daysSinceLastEvent: 0, replyClassification: { intent: "interested", confidence: 0.5 } }));

// Should match unsubscribe_stops_automation
console.log(evaluateRules("reply_classified", { opportunityId: "x", opportunityStage: "contacted", daysSinceLastEvent: 0, replyClassification: { intent: "unsubscribe", confidence: 1 } }));