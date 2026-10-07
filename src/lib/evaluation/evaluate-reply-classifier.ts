import { classifyReply } from "../crm/classify-reply";

export interface ReplyTestCase {
  text: string;
  expectedIntent: string;
}

// Deliberately imbalanced, matching your notes' warning scenario:
// most real replies ARE "not_interested" in practice, so a naive
// classifier could score well on raw accuracy by just guessing that
// every time. This set is built to actually expose that if it happens.
const replyTestCases: ReplyTestCase[] = [
  { text: "Not interested, thanks.", expectedIntent: "not_interested" },
  { text: "Please stop emailing me.", expectedIntent: "not_interested" },
  { text: "We're all set with our current provider.", expectedIntent: "not_interested" },
  { text: "No thanks, not a fit right now.", expectedIntent: "not_interested" },
  { text: "Sounds interesting. Can we talk?", expectedIntent: "interested" }, // the rare, valuable class
  { text: "Please remove me from your list.", expectedIntent: "unsubscribe" },
  { text: "I'm not the right person — talk to Sarah.", expectedIntent: "redirect" },
  { text: "Who is this?", expectedIntent: "unclear" },
];

export async function evaluateReplyClassifier(cases: ReplyTestCase[] = replyTestCases) {
  const results: Array<{ text: string; expected: string; actual: string; correct: boolean }> = [];
  for (const c of cases) {
    const classification = await classifyReply(c.text);
    results.push({ text: c.text, expected: c.expectedIntent, actual: classification?.intent ?? "FAILED", correct: classification?.intent === c.expectedIntent });
  }

  const overallAccuracy = results.filter((r) => r.correct).length / results.length;

  // Per-class: for each intent, how did the classifier do specifically
  // on examples of THAT class? This is what catches a "always guess
  // the majority class" failure mode that overall accuracy would hide.
  const classes = [...new Set(cases.map((c) => c.expectedIntent))];
  const perClass = classes.map((cls) => {
    const classCases = results.filter((r) => r.expected === cls);
    const classAccuracy = classCases.filter((r) => r.correct).length / classCases.length;
    return { class: cls, count: classCases.length, accuracy: classAccuracy };
  });

  return { overallAccuracy, perClass, results };
}