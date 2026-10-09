import { scorePersonalization } from "./evaluate-personalization";

const realMessage = {
  subject: "Streamlining lead qualification for B2B financial infrastructure",
  body: "Hi David, As a Marketing Manager at Stripe, you operate within the financial infrastructure and payments space, driving growth for B2B operations...",
  personalization_used: ["Recipient name", "Recipient role", "Company name", "Industry"],
  claims: [
    { text: "Stripe operates in the financial infrastructure and payments industry.", source: "industry" },
    { text: "Stripe utilizes a B2B business model.", source: "business_model" },
  ],
};

const realContext = {
  company: { name: "Stripe", description: "..." },
  contact: { firstName: "David", jobTitle: "Marketing Manager" },
  signals: [
    { name: "business_model", evidence: "B2B" },
    { name: "industry", evidence: "Financial Infrastructure and Payments" },
  ],
  offer: { description: "...", valueProposition: "..." },
};

const score = scorePersonalization(realMessage, realContext, {
  factuallyCorrect: true,
  supportedBySource: true,
  relevant: true,
  natural: false, // YOUR call — the opening sentence reads stiff/awkward
  professional: true,
});

console.log(score);