import { fetchWithRetry } from "../http";

export interface WebsiteEnrichmentData {
  title: string | null;
  metaDescription: string | null;
  bodyTextSample: string | null; // first ~1000 chars of visible text, for the LLM step later
}

function extractTag(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchWebsiteEnrichment(domain: string): Promise<WebsiteEnrichmentData> {
  const url = `https://${domain}`;

  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)" },
  });

  const html = await response.text();

  const title = extractTag(html, /<title[^>]*>([^<]*)<\/title>/i);
  const metaDescription = extractTag(
    html,
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i
  );

  const bodyText = stripHtmlTags(html);
  const bodyTextSample = bodyText ? bodyText.slice(0, 1000) : null;

  return { title, metaDescription, bodyTextSample };
}