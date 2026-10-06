// Common legal-suffix abbreviations to expand. Add more as you encounter them in real data.
const SUFFIX_MAP: Record<string, string> = {
  LTD: "Limited",
  INC: "Incorporated",
  CORP: "Corporation",
  CO: "Company",
  LLC: "LLC", // already standard, kept for clarity
  GMBH: "GmbH",
  PLC: "PLC",
  BV: "BV",
};

export function normalizeCompanyName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/\.$/, "");

  // Title-case each letter-run separately — hyphens now correctly split words
  name = name.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

  // Suffix expansion runs AFTER title-casing, so it has the final say
  for (const [abbr, full] of Object.entries(SUFFIX_MAP)) {
    const pattern = new RegExp(`\\b${abbr}\\b\\.?`, "gi");
    name = name.replace(pattern, full);
  }

  return name.trim();
}

export function normalizeDomain(raw: string): string | null {
  let url = raw.trim().toLowerCase();
  if (!url) return null;

  if (!/^https?:\/\//.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null; // couldn't parse — caller decides how to handle
  }
}

export function normalizeIndustry(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
  // Room to grow: map synonyms later (e.g. "Tech" -> "Technology")
  // once you see which variants actually show up in real data.
}

export function normalizeLocation(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
  // Room to grow: map to standardized country/city codes later.
}