import { ScoringRule } from "./types";

const GROWTH_KEYWORDS = ["hiring", "join our team", "we're growing", "expanding", "new office", "recently launched", "now available"];
const ACTIVITY_KEYWORDS = ["blog", "news", "announcement", "press release", "case study"];

export const intentRules: ScoringRule[] = [
  {
    name: "growth_language_detected",
    category: "intent",
    points: 60, // increased from 30 — this is genuinely our strongest intent signal
    evaluate: (c) => {
      const text = (c.body_text_sample ?? "").toLowerCase();
      return GROWTH_KEYWORDS.some((kw) => text.includes(kw));
    },
  },
  {
    name: "active_content_signal",
    category: "intent",
    points: 40, // increased from 20
    evaluate: (c) => {
      const text = (c.body_text_sample ?? "").toLowerCase();
      return ACTIVITY_KEYWORDS.some((kw) => text.includes(kw));
    },
  },
];