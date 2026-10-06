import { runQualityGate } from "./quality-gate";

const context = {
  company: { name: "Stripe" },
  contact: { firstName: "David", jobTitle: "Marketing Manager" },
  signals: [
    { name: "industry", evidence: "Financial Infrastructure and Payments" },
    { name: "business_model", evidence: "B2B" },
  ],
  offer: { description: "...", valueProposition: "..." },
};

// Case 1: a clean, valid message
const goodMessage = {
  subject: "Quick question about your sales pipeline",
  body: "Hi David, would it make sense to briefly explore this?",
  personalization_used: ["industry"],
  claims: [{ text: "Stripe operates in financial infrastructure.", source: "industry" }],
};

// Case 2: a message with a fabricated claim source
const badMessage = {
  subject: "Quick question",
  body: "Hi David, I saw you're expanding rapidly — would that be worth discussing?",
  personalization_used: ["growth"],
  claims: [{ text: "Stripe is expanding rapidly.", source: "recent_expansion" }], // source doesn't exist in context.signals
};

console.log("--- Good message, first-time contact ---");
console.log(runQualityGate(goodMessage, context, "david@stripe.com", false, false));

console.log("--- Message with fabricated claim source ---");
console.log(runQualityGate(badMessage, context, "david@stripe.com", false, false));

console.log("--- Good message, but already contacted ---");
console.log(runQualityGate(goodMessage, context, "david@stripe.com", true, false));