export interface WebsiteSignals {
  hasWebsite: boolean;
  hasMetaDescription: boolean;
  hasContactInfo: boolean; // email/phone/contact keyword found in scraped text
  looksLikeFreeHostedSite: boolean; // wixsite.com, blogspot, etc. — weaker credibility
  hasEcommerceSignal: boolean; // shop/cart/buy/catalog keywords
  contentIsThin: boolean; // very little scraped text — likely a weak/bare site
}

const FREE_HOST_PATTERNS = ["wixsite.com", "blogspot.com", "weebly.com", "sites.google.com", "myshopify.com"];
const CONTACT_KEYWORDS = ["contact us", "email us", "call us", "phone:", "whatsapp"];
const ECOMMERCE_KEYWORDS = ["shop", "cart", "buy now", "catalog", "add to cart", "checkout"];

export function extractWebsiteSignals(domain: string | null, metaDescription: string | null, bodyText: string | null): WebsiteSignals {
  const text = (bodyText ?? "").toLowerCase();

  return {
    hasWebsite: domain !== null,
    hasMetaDescription: metaDescription !== null && metaDescription.trim().length > 0,
    hasContactInfo: CONTACT_KEYWORDS.some((kw) => text.includes(kw)),
    looksLikeFreeHostedSite: domain !== null && FREE_HOST_PATTERNS.some((p) => domain.includes(p)),
    hasEcommerceSignal: ECOMMERCE_KEYWORDS.some((kw) => text.includes(kw)),
    contentIsThin: bodyText === null || bodyText.trim().length < 100,
  };
}