import { RawContact } from "./types";
import { scoreContactRole } from "./role-rules";

export interface ScoredCandidate {
  contact: RawContact;
  roleScore: number;
  matchedRule: string | null;
}

export interface SelectionResult {
  selected: ScoredCandidate | null;
  candidatesScored: ScoredCandidate[];
  reason: string;
}

export function selectBestContact(candidates: RawContact[]): SelectionResult {
  if (candidates.length === 0) {
    return { selected: null, candidatesScored: [], reason: "No candidates found for this company." };
  }

  const scored: ScoredCandidate[] = candidates.map((contact) => {
    const { score, matchedRule } = scoreContactRole(contact);
    return { contact, roleScore: score, matchedRule };
  });

  // Highest role score wins; ties broken by "has an email" (a contact
  // we can't reach is less useful even at equal role relevance).
  const sorted = [...scored].sort((a, b) => {
    if (b.roleScore !== a.roleScore) return b.roleScore - a.roleScore;
    const aHasEmail = a.contact.email ? 1 : 0;
    const bHasEmail = b.contact.email ? 1 : 0;
    return bHasEmail - aHasEmail;
  });

  const best = sorted[0];
  const MINIMUM_SELECTABLE_SCORE = 15; // below this, the role isn't relevant enough to act on

  if (best.roleScore === 0) {
    return {
      selected: null,
      candidatesScored: scored,
      reason: `${candidates.length} candidate(s) found, but none had a recognizable, relevant role.`,
    };
  }
  if (best.roleScore < MINIMUM_SELECTABLE_SCORE) {
  return {
    selected: null,
    candidatesScored: scored,
    reason: `${candidates.length} candidate(s) found, but the most relevant role (${best.contact.jobTitle ?? "unknown"}) scored too low (${best.roleScore}) to confidently select.`,
  };
}

  const name = `${best.contact.firstName} ${best.contact.lastName}`;
  const reason = best.contact.email
    ? `${name} was selected because their role (${best.contact.jobTitle}) matched "${best.matchedRule}", and a contact email was available.`
    : `${name} was selected because their role (${best.contact.jobTitle}) matched "${best.matchedRule}", though no email was found for them.`;

  return { selected: best, candidatesScored: scored, reason };
}