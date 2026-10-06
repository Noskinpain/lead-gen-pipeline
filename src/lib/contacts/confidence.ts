import { EmailStatus } from "./verify-email";

export function calculateContactConfidence(roleScore: number, emailStatus: EmailStatus): number {
  // Role relevance contributes up to 0.5, email trustworthiness up to 0.5 —
  // a contact is only as good as BOTH being reasonably solid.
  const roleComponent = Math.min(roleScore / 30, 1) * 0.5; // 30 = max role score

  const emailComponent = (() => {
    switch (emailStatus) {
      case "verified": return 0.5;
      case "risky": return 0.3;
      case "unknown": return 0.1;
      case "invalid": return 0;
    }
  })();

  return Math.round((roleComponent + emailComponent) * 100) / 100;
}