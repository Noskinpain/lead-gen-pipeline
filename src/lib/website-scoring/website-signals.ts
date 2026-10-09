export interface WebsiteSignals {
  hasWebsite: boolean;
  hasMetaDescription: boolean;
  hasContactInfo: boolean;
  looksLikeFreeHostedSite: boolean;
  hasEcommerceSignal: boolean;
  contentIsThin: boolean;
}

const FREE_HOST_PATTERNS = ["wixsite.com", "blogspot.com", "weebly.com", "sites.google.com", "myshopify.com"];
const CONTACT_KEYWORDS = ["contact us", "email us", "call us", "phone:", "whatsapp"];
const ECOMMERCE_KEYWORDS = ["shop", "cart", "buy now", "catalog", "add to cart", "checkout"];

export function extractWebsiteSignals(
  domain: string | null,
  metaDescription: string | null,
  bodyText: string | null,
  hasContactSignal: boolean | null = null // from the full-page check; null = not available
): WebsiteSignals {
  const text = (bodyText ?? "").toLowerCase();

  return {
    hasWebsite: domain !== null,
    hasMetaDescription: metaDescription !== null && metaDescription.trim().length > 0,
    // Prefer the full-page result when we have it. Fall back to the old
    // keyword check on the sample for companies enriched before it existed.
    hasContactInfo: hasContactSignal ?? CONTACT_KEYWORDS.some((kw) => text.includes(kw)),
    looksLikeFreeHostedSite: domain !== null && FREE_HOST_PATTERNS.some((p) => domain.includes(p)),
    hasEcommerceSignal: ECOMMERCE_KEYWORDS.some((kw) => text.includes(kw)),
    contentIsThin: bodyText === null || bodyText.trim().length < 100,
  };
}