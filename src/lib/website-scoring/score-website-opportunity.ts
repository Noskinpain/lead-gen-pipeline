import { WebsiteSignals } from "./website-signals";

export interface WebsiteOpportunityResult {
  score: number;
  maxPossible: number;
  signals: Array<{ name: string; points: number; matched: boolean }>;
  notAvailable: string[]; // signals from the original spec we can't compute yet
}

// Weights adapted from the original spec, but scoped to only what's
// actually computable from real scraped data. social_following,
// social_activity, page_speed, mobile_quality are NOT included — they'd
// need Instagram/Facebook APIs or a performance-testing service, neither
// built. Naming that gap directly beats faking a plausible-looking score.
export function scoreWebsiteOpportunity(signals: WebsiteSignals): WebsiteOpportunityResult {
  const rules: Array<{ name: string; points: number; matched: boolean }> = [
    { name: "no_website_at_all", points: 30, matched: !signals.hasWebsite },
    { name: "free_hosted_site", points: 20, matched: signals.looksLikeFreeHostedSite },
    { name: "thin_content", points: 20, matched: signals.contentIsThin && signals.hasWebsite },
    { name: "no_meta_description", points: 15, matched: !signals.hasMetaDescription && signals.hasWebsite },
    { name: "no_contact_mechanism", points: 15, matched: !signals.hasContactInfo && signals.hasWebsite },
  ];

  const score = rules.reduce((sum, r) => sum + (r.matched ? r.points : 0), 0);

  return {
    score,
    maxPossible: 100,
    signals: rules,
    notAvailable: ["social_following", "social_activity", "page_speed", "mobile_quality", "product_count"],
  };
}