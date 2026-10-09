import { WebsiteSignals } from "./website-signals";

export interface WebsiteOpportunityResult {
  score: number;
  maxPossible: number;
  signals: Array<{ name: string; points: number; matched: boolean }>;
  notAvailable: string[];
}

// Only signals computable from real scraped data are scored. social_following,
// social_activity, page_speed, mobile_quality and product_count would need
// new data sources, so they're listed as unavailable instead of faked.
export function scoreWebsiteOpportunity(signals: WebsiteSignals): WebsiteOpportunityResult {
  const rules: Array<{ name: string; points: number; matched: boolean }> = [
    { name: "no_website_at_all", points: 30, matched: !signals.hasWebsite },
    { name: "free_hosted_site", points: 20, matched: signals.looksLikeFreeHostedSite },
    { name: "thin_content", points: 20, matched: signals.contentIsThin },
    { name: "no_meta_description", points: 15, matched: !signals.hasMetaDescription },
    { name: "no_contact_mechanism", points: 15, matched: !signals.hasContactInfo },
  ];

  const score = rules.reduce((sum, r) => sum + (r.matched ? r.points : 0), 0);

  return {
    score,
    maxPossible: 100,
    signals: rules,
    notAvailable: ["social_following", "social_activity", "page_speed", "mobile_quality", "product_count"],
  };
}