import { fetchWithRetry } from "../http";

export interface WebsiteEnrichmentData {
  title: string | null;
  metaDescription: string | null;
  bodyTextSample: string | null; // first ~1000 chars of visible text, for the LLM step
  contactSignals: string[]; // which kinds of contact mechanism were found, checked on the FULL page
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

// Remove everything that isn't real page markup, so patterns can't match
// inside inline JavaScript, CSS or comments.
function removeNonContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const CONTACT_LABEL_PATTERN = /contact|get in touch|talk to (us|sales)|book a (call|demo)|enquir/i;

function detectContactSignals(html: string): string[] {
  const cleanHtml = removeNonContent(html);
  const found: string[] = [];

  // Real links only: these must appear inside an href attribute.
  if (/href=["']\s*mailto:/i.test(cleanHtml)) found.push("mailto");
  if (/href=["']\s*tel:/i.test(cleanHtml)) found.push("tel");
  if (/href=["'][^"']*(wa\.me\/|api\.whatsapp\.com)/i.test(cleanHtml)) found.push("whatsapp");

  // A visible email address in the page text
  const visibleText = stripHtmlTags(cleanHtml);
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(visibleText)) found.push("email_text");

  // A button or link whose label is a contact call-to-action ("Contact sales")
  const clickablePattern = /<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let foundLabel = false;
  while ((match = clickablePattern.exec(cleanHtml)) !== null) {
    if (CONTACT_LABEL_PATTERN.test(stripHtmlTags(match[2]))) {
      foundLabel = true;
      break;
    }
  }
  if (foundLabel) found.push("contact_button_or_link");

  // A link pointing at a contact page, even if its label is just an icon
  if (!foundLabel && /<a\b[^>]*href=["'][^"']*contact[^"']*["']/i.test(cleanHtml)) {
    found.push("contact_page_link");
  }

  return found;
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

  const contactSignals = detectContactSignals(html);

  return { title, metaDescription, bodyTextSample, contactSignals };
}