import { extractWebsiteSignals } from "./website-signals";
import { scoreWebsiteOpportunity } from "./score-website-opportunity";

// Case 1: no website at all
console.log(scoreWebsiteOpportunity(extractWebsiteSignals(null, null, null)));

// Case 2: has a site, but thin/no contact info
console.log(scoreWebsiteOpportunity(extractWebsiteSignals("example.com", null, "Welcome to our site.")));

// Case 3: a solid, complete site
console.log(scoreWebsiteOpportunity(extractWebsiteSignals("stripe.com", "Stripe is a payments platform...", "Contact us at support@stripe.com. " + "x".repeat(200))));