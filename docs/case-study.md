# Case Study: Autonomous B2B Lead Generation & Sales Pipeline Engine

## Executive Summary

Manual sales development and prospect qualification is slow, inconsistent, and expensive. Most automated tools are either brittle scraping scripts or black-box CRM automations that spam irrelevant contacts, create duplicate records, and hallucinate claims during outreach.

This project delivers an **end-to-end autonomous prospecting and sales development engine** engineered with Next.js, Supabase, OpenAI/Gemini, and Resend. It transforms raw target company data into qualified opportunities, discovers decision-makers, drafts fact-grounded personalized emails, enforces quality gates, manages the full CRM lifecycle, and tracks per-unit economics.

---

## Architecture & System Overview

```
                        DATA SOURCES
                (CSV, APIs, GitHub, Scrapes)
                             │
                             ▼
                     ┌───────────────┐
                     │   Ingestion   │ ➔ Normalization & Checkpointed Runs
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │  Enrichment   │ ➔ Scraping + LLM Classification
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Qualification │ ➔ Fit + Intent Scoring
                     │   & Scoring   │ ➔ Website Opportunity Scoring (100-pt)
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │    Contact    │ ➔ Role Priority Scoring
                     │   Discovery   │ ➔ Email Deliverability Verification
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Personalize   │ ➔ Fact-checked claims & Signal grounding
                     │    & Draft    │ ➔ Quality Gate (Spam/Hallucination check)
                     └───────┬───────┘
                             │
                             ▼
                      HUMAN APPROVAL
                             │
                             ▼
                     ┌───────────────┐
                     │   Outreach    │ ➔ Resend API Delivery
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │      CRM      │ ➔ Opportunity State Machine
                     └───────┬───────┘
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
           FOLLOW-UPS                ANALYTICS
      (Cadence & Auto-Stop)     (Funnel & Unit Economics)
                 │                       │
                 └───────────┬───────────┘
                             ▼
                         OUTCOMES
                             │
                             ▼
                     EVALUATION SUITE
                (Ground Truth & Regression)
```

---

## Core Engineering Disciplines

### 1. Resilience & API Failure Handling
- **Exponential Backoff**: [http.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/http.ts) intercepts `429` (Rate Limited), `500` (Internal Error), `502`, `503`, and `504` with jittered exponential backoff and timeout abortion (`AbortController`).
- **Fail Fast**: Client errors (`400`, `404`) terminate immediately without wasting retries or blocking pipelines.

### 2. Idempotency & Duplicate Elimination
- **Webhooks**: Idempotent event processing in [route.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/app/api/webhooks/email/route.ts) checking `(message_id, event_type)` compound keys.
- **Deduplication**: Domain normalization collapses `https://`, `http://`, `www.`, and trailing slashes ([normalize.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/normalize.ts)).
- **Database Idempotency**:
  - Contacts are deduplicated per company ([discover-contact.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/contacts/discover-contact.ts)).
  - Outreach drafts deduplicated per campaign & contact ([create-draft.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/outreach/create-draft.ts)).
  - Tasks deduplicated on Postgres unique key `source_event_id:rule_name` ([create-task-from-event.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/automation/create-task-from-event.ts)).

### 3. State Machine Integrity
Two explicit state machines protect operational integrity:
1. **Outreach State Machine**:
   $$\text{DRAFT} \rightarrow \text{APPROVED} \rightarrow \text{SENT} \rightarrow \text{DELIVERED} \rightarrow \{\text{REPLIED}, \text{BOUNCED}, \text{UNSUBSCRIBED}\}$$
2. **Opportunity State Machine**:
   $$\text{new} \rightarrow \text{qualified} \rightarrow \text{contacted} \rightarrow \text{replied} \rightarrow \text{interested} \rightarrow \text{meeting\_booked} \rightarrow \text{proposal} \rightarrow \text{won} / \text{lost}$$
- **State Guards**: Once a message reaches `REPLIED`, `BOUNCED`, or `UNSUBSCRIBED`, automated follow-up sequences are **instantly halted** ([follow-up.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/outreach/follow-up.ts)). If an opportunity is closed (`won` or `lost`), sales outreach tasks will never trigger.

### 4. Security & Prompt Injection Defense
- **Zero Committed Secrets**: All credentials (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `WEBHOOK_SECRET`) reside exclusively in environment configurations.
- **Untrusted Data Boundaries**: External text (scraped web copy, CSV company names, incoming email replies) is encapsulated in XML tags (`<website_text>`, `<reply>`) accompanied by strict defensive system instructions preventing jailbreaks.

### 5. Cost Optimization & Observability
- **Deterministic Pre-filtering**: Raw records pass through zero-cost URL and size regexes before initiating LLM classification or web scraping.
- **Unit Economics Tracking**: [unit-economics.ts](file:///c:/Users/USER/Desktop/projects/lead-gen-pipeline/src/lib/analytics/unit-economics.ts) continuously aggregates total operational expense across Gemini/OpenAI calls, calculating:
  - Cost per Qualified Lead
  - Cost per Meeting Booked
  - Cost per Closed Customer

---

## Website Prospect Application: The Website Opportunity Engine

To serve digital development and redesign services, the qualification engine was tailored to evaluate website deficiencies:

```typescript
// website-scoring/score-website-opportunity.ts
export function scoreWebsiteOpportunity(signals: WebsiteSignals): WebsiteOpportunityResult {
  const rules = [
    { name: "no_website_at_all", points: 30, matched: !signals.hasWebsite },
    { name: "free_hosted_site", points: 20, matched: signals.looksLikeFreeHostedSite },
    { name: "thin_content", points: 20, matched: signals.contentIsThin && signals.hasWebsite },
    { name: "no_meta_description", points: 15, matched: !signals.hasMetaDescription && signals.hasWebsite },
    { name: "no_contact_mechanism", points: 15, matched: !signals.hasContactInfo && signals.hasWebsite },
  ];
  return { score: rules.reduce((acc, r) => acc + (r.matched ? r.points : 0), 0), maxPossible: 100, ... };
}
```

In the end-to-end benchmark across 20 prospective businesses:
- **75% of companies** had decision-makers successfully extracted and emails validated.
- **High-opportunity prospects** (scoring 50/100 due to thin content, no metadata, and no contact mechanism) were automatically routed to personalized outreach drafting emphasizing digital revamp.
- **Low-opportunity companies** (scoring 0/100 with comprehensive existing digital setups) were appropriately de-prioritized.

---

## Empirical Evaluation Summary

| Dimension | Measured Metric |
| :--- | :--- |
| **Lead Scoring Precision** | **100.0%** (Zero junk leads passed to high priority) |
| **Lead Scoring F1** | **80.0%** |
| **Contact Selection Accuracy** | **80.0%** |
| **Reply Classifier Accuracy** | **75.0%** (100% on high-value `interested` & `unsubscribe`) |
| **Regression Suite Pass Rate** | **100.0%** (8/8 invariant checks passing) |

---

## Limitations & Next Iterations
1. **Multi-Channel Outreach**: Current delivery focuses on email via Resend; expanding to LinkedIn InMail and SMS via Twilio.
2. **Third-Party Social APIs**: Automated retrieval of Instagram follower count and Facebook business page activity to complement the heuristic website signals.
3. **Automated LLM-as-a-Judge**: Upgrading manual personalization spot-checks into continuous synthetic review passes with automated confidence gating.
