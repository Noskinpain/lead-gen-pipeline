import { scoreToPriority } from "../scoring/score-company";
import { canTransitionStage } from "../crm/opportunity-state-machine";
import { canTransition } from "../outreach/state-machine";
import { normalizeDomain, normalizeCompanyName } from "../normalize";
import { evaluateFollowUp } from "../outreach/follow-up";

export interface RegressionCase {
  name: string;
  run: () => boolean;
}

// Each case encodes a real, previously-verified fact about the system —
// most pulled directly from bugs found and fixed earlier in this build.
// If any of these ever fail after a future change, something that used
// to work has broken.
export const regressionCases: RegressionCase[] = [
  { name: "Threshold boundary: score 79 is MEDIUM, not HIGH", run: () => scoreToPriority(79) === "MEDIUM" },
  { name: "Threshold boundary: score 80 is HIGH", run: () => scoreToPriority(80) === "HIGH" },
  { name: "Opportunity state machine: NEW cannot jump directly to WON", run: () => canTransitionStage("new", "won") === false },
  { name: "Opportunity state machine: WON is terminal", run: () => canTransitionStage("won", "qualified") === false },
  { name: "Outreach state machine: BOUNCED is terminal", run: () => canTransition("BOUNCED", "SENT") === false },
  { name: "Domain normalization: www./https:// variants collapse to the same domain", run: () => normalizeDomain("https://www.shepard.biz/") === normalizeDomain("shepard.biz") },
  { name: "Name normalization: hyphenated names preserve correct casing", run: () => normalizeCompanyName("terry-arnold inc.") === "Terry-Arnold Incorporated" },
  { name: "Follow-up: REPLIED is a stop state regardless of elapsed time", run: () => evaluateFollowUp("REPLIED", 999, 0).shouldFollowUp === false },
];

export function runRegressionSuite() {
  const results = regressionCases.map((c) => {
    let passed: boolean;
    try {
      passed = c.run();
    } catch {
      passed = false;
    }
    return { name: c.name, passed };
  });

  const failedCount = results.filter((r) => !r.passed).length;
  return { results, allPassed: failedCount === 0, failedCount };
}