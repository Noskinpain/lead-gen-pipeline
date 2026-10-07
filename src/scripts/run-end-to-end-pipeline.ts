import fs from "fs";
import path from "path";
import { normalizeCompanyName, normalizeDomain } from "../lib/normalize";
import { extractWebsiteSignals } from "../lib/website-scoring/website-signals";
import { scoreWebsiteOpportunity } from "../lib/website-scoring/score-website-opportunity";
import { scoreCompany, ScoringResult } from "../lib/scoring/score-company";
import { mockContactSource } from "../lib/contacts/mock-source";
import { selectBestContact } from "../lib/contacts/select-contact";
import { verifyEmail } from "../lib/contacts/verify-email";
import { runQualityGate } from "../lib/outreach/quality-gate";
import { OutreachContext } from "../lib/outreach/types";

interface CsvCompany {
  company_name: string;
  website: string;
  industry: string;
  location: string;
  employee_count: number;
}

function parseCsv(filePath: string, limit = 20): CsvCompany[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const rows: CsvCompany[] = [];

  for (let i = 1; i < lines.length && rows.length < limit; i++) {
    const line = lines[i];
    // CSV regex for quoted fields
    const regex = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      matches.push(match[1] !== undefined ? match[1] : match[2]);
      if (matches.length === 5) break;
    }

    if (matches.length >= 5) {
      rows.push({
        company_name: matches[0].trim(),
        website: matches[1].trim(),
        industry: matches[2].trim(),
        location: matches[3].trim(),
        employee_count: parseInt(matches[4].trim(), 10) || 0,
      });
    }
  }

  return rows;
}

export interface PipelineProspectResult {
  business: string;
  normalizedName: string;
  website: string;
  domain: string;
  websiteOpportunityScore: number;
  websiteSignals: {
    hasWebsite: boolean;
    contentIsThin: boolean;
    noMetaDescription: boolean;
    noContactInfo: boolean;
    looksLikeFreeHostedSite: boolean;
  };
  leadPriority: "HIGH" | "MEDIUM" | "LOW" | "REJECT";
  leadScore: number;
  contactName: string | null;
  decisionMakerRole: string | null;
  contactEmail: string | null;
  emailStatus: string | null;
  outreachDraftStatus: "READY" | "BLOCKED" | "NO_CONTACT";
  qualityIssues: string[];
  reason: string;
}

export async function runEndToEndPipeline(sampleSize = 20): Promise<PipelineProspectResult[]> {
  const csvPath = path.resolve(process.cwd(), "data/companies.csv");
  const companies = parseCsv(csvPath, sampleSize);

  const results: PipelineProspectResult[] = [];

  for (const c of companies) {
    const domain = normalizeDomain(c.website) ?? "unknown.com";
    const normalizedName = normalizeCompanyName(c.company_name);

    // 1. Website Analysis & Opportunity Scoring
    // Simulated realistic website body/meta sample based on company profile
    const hasExistingMeta = c.employee_count > 1000;
    const metaDescription = hasExistingMeta
      ? `${c.company_name} provides professional ${c.industry} solutions in ${c.location}.`
      : null;
    const bodySample = c.employee_count > 3000
      ? `Welcome to ${c.company_name}. We specialize in ${c.industry}. Contact us at info@${domain}. Overview of our corporate offerings.`
      : `Welcome to ${c.company_name}.`;

    const websiteSignals = extractWebsiteSignals(domain, metaDescription, bodySample);
    const websiteOpp = scoreWebsiteOpportunity(websiteSignals);

    // 2. Lead Qualification & Scoring
    const scoringInput = {
      id: `sim_${domain}`,
      company_name: normalizedName,
      industry: c.industry,
      location: c.location,
      employee_count: c.employee_count,
      enriched_industry: c.industry,
      business_model: "B2B",
      customer_type: "Mid-Market",
      classification_confidence: 0.85,
      meta_description: metaDescription,
      body_text_sample: bodySample,
    };
    const leadScoreResult: ScoringResult = scoreCompany(scoringInput);

    // 3. Contact Discovery & Email Verification
    const rawCandidates = await mockContactSource.findContacts(domain, normalizedName);
    const selection = selectBestContact(rawCandidates);

    let contactName: string | null = null;
    let decisionMakerRole: string | null = null;
    let contactEmail: string | null = null;
    let emailStatus: string | null = null;

    if (selection.selected) {
      const contact = selection.selected.contact;
      contactName = `${contact.firstName} ${contact.lastName}`;
      decisionMakerRole = contact.jobTitle;
      contactEmail = contact.email;

      if (contactEmail) {
        const verification = await verifyEmail(contactEmail);
        emailStatus = verification.status;
      }
    }

    // 4. Outreach Personalization & Quality Gate
    const reasons: string[] = [];
    if (websiteOpp.score >= 50) reasons.push("High website development opportunity");
    if (websiteSignals.contentIsThin) reasons.push("Thin content on current website");
    if (!websiteSignals.hasMetaDescription) reasons.push("Missing SEO meta description");
    if (!websiteSignals.hasContactInfo) reasons.push("No clear contact mechanism found");
    if (reasons.length === 0) reasons.push("Standard digital presence upgrade");

    const qualityGateIssues: string[] = [];
    let draftStatus: "READY" | "BLOCKED" | "NO_CONTACT" = "NO_CONTACT";

    if (selection.selected && contactEmail) {
      const context: OutreachContext = {
        company: {
          name: normalizedName,
          industry: c.industry,
          location: c.location,
          description: metaDescription ?? undefined,
        },
        contact: {
          firstName: selection.selected.contact.firstName,
          jobTitle: decisionMakerRole ?? "Leader",
        },
        signals: [
          { name: "website_opportunity_score", evidence: `${websiteOpp.score}/100` },
          { name: "industry", evidence: c.industry },
        ],
        offer: {
          description: "High-performance website redesign and conversion optimization.",
          valueProposition: "Modernize your digital presence, speed up mobile performance, and capture more high-value inquiries.",
        },
      };

      const mockDraft = {
        subject: `Upgrading the digital presence for ${normalizedName}`,
        body: `Hi ${selection.selected.contact.firstName},\n\nI was looking into ${normalizedName}'s current website in the ${c.industry} space. Noticeable opportunity exists to improve content clarity and streamline incoming inquiries.\n\nWe design high-converting, modern websites that help leaders like you turn digital visitors into qualified conversations.\n\nOpen to a quick 5-minute chat to review some ideas?\n\nBest,\nLead Gen Team`,
        personalization_used: ["industry", "company_name", "first_name"],
        claims: [{ text: `${normalizedName} is in ${c.industry}`, source: "industry" }],
      };

      const qg = runQualityGate(mockDraft, context, contactEmail, false, false);
      if (qg.passed) {
        draftStatus = "READY";
      } else {
        draftStatus = "BLOCKED";
        qualityGateIssues.push(...qg.issues);
      }
    } else {
      qualityGateIssues.push("No verified contact found");
    }

    results.push({
      business: c.company_name,
      normalizedName,
      website: c.website,
      domain,
      websiteOpportunityScore: websiteOpp.score,
      websiteSignals: {
        hasWebsite: websiteSignals.hasWebsite,
        contentIsThin: websiteSignals.contentIsThin,
        noMetaDescription: !websiteSignals.hasMetaDescription,
        noContactInfo: !websiteSignals.hasContactInfo,
        looksLikeFreeHostedSite: websiteSignals.looksLikeFreeHostedSite,
      },
      leadPriority: leadScoreResult.priority,
      leadScore: leadScoreResult.priorityScore,
      contactName,
      decisionMakerRole,
      contactEmail,
      emailStatus,
      outreachDraftStatus: draftStatus,
      qualityIssues: qualityGateIssues,
      reason: reasons.join("; "),
    });
  }

  return results;
}

async function main() {
  console.log("===============================================================");
  console.log("RUNNING END-TO-END PIPELINE: 20 BUSINESS PROSPECT SAMPLE");
  console.log("===============================================================\n");

  const results = await runEndToEndPipeline(20);

  console.table(
    results.map((r) => ({
      Business: r.business.slice(0, 22),
      Domain: r.domain.slice(0, 18),
      "Web Opp Score": `${r.websiteOpportunityScore}/100`,
      "Lead Priority": r.leadPriority,
      "Decision Maker": r.decisionMakerRole ? `${r.contactName} (${r.decisionMakerRole})`.slice(0, 25) : "None",
      "Email Status": r.emailStatus ?? "N/A",
      "Draft Status": r.outreachDraftStatus,
      Reason: r.reason.slice(0, 40),
    }))
  );

  const readyCount = results.filter((r) => r.outreachDraftStatus === "READY").length;
  const avgWebOpp = Math.round(results.reduce((acc, r) => acc + r.websiteOpportunityScore, 0) / results.length);
  const contactsFound = results.filter((r) => r.contactName !== null).length;

  console.log("\n--- SUMMARY OF END-TO-END PIPELINE RUN ---");
  console.log(`Total Businesses Analyzed: ${results.length}`);
  console.log(`Contacts Discovered: ${contactsFound}/${results.length} (${Math.round((contactsFound / results.length) * 100)}%)`);
  console.log(`Drafts Ready for Human Approval: ${readyCount}/${results.length}`);
  console.log(`Average Website Opportunity Score: ${avgWebOpp}/100`);
}

if (require.main === module) {
  main().catch(console.error);
}
