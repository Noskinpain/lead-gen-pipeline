import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { approveDraft, rejectDraft, saveDraftEdits, sendApproved } from "@/app/crm/outreach-actions";
import { requireUser } from "@/lib/auth";
import { loadDraftDetail } from "@/lib/crm/load-outreach";
import { day, label } from "@/lib/crm/format";

function statusClass(status: string): string {
  if (["SENT", "DELIVERED", "REPLIED", "QUALIFIED", "MEETING_BOOKED", "CONVERTED"].includes(status)) return styles.badgeGood;
  if (["BOUNCED", "UNSUBSCRIBED", "REJECTED"].includes(status)) return styles.badgeBad;
  if (status === "APPROVED") return styles.badgeAccent;
  return styles.badgeWarn;
}

export default async function EmailReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { ok, error } = await searchParams;

  if (!z.uuid().safeParse(id).success) notFound();

  const draft = await loadDraftDetail(id);
  if (!draft) notFound();

  const returnTo = `/crm/outreach/${draft.id}`;
  const isDraft = draft.status === "DRAFT";
  const isApproved = draft.status === "APPROVED";
  const blocked = draft.contact.doNotContact;

  return (
    <>
      <p>
        <Link href="/crm/outreach" className={styles.muted}>
          Back to outreach
        </Link>
      </p>

      <Flash ok={ok} error={error} />

      <div className={styles.notice} style={{ marginBottom: 14 }}>
        Sandbox only: sending goes to a test address, so nothing is emailed to {draft.contact.name}.
      </div>

      {/* ---------- Header ---------- */}
      <section className={styles.panel}>
        <h1 className={styles.pageTitle}>
          {draft.subject}{" "}
          <span className={`${styles.badge} ${statusClass(draft.status)}`}>{label(draft.status.toLowerCase())}</span>
        </h1>
        <div className={styles.muted}>
          To: {draft.contact.name}
          {draft.contact.title ? ` - ${draft.contact.title}` : ""} at{" "}
          <Link href={`/crm/companies/${draft.company.id}`}>{draft.company.name}</Link>
        </div>
        <div className={styles.muted}>
          {draft.contact.email ?? "no email address"} | email check: {draft.contact.emailStatus ?? "unknown"}{" "}
          {blocked && <span className={`${styles.badge} ${styles.badgeBad}`}>do not contact</span>}
        </div>
        {blocked && draft.contact.doNotContactReason && (
          <div className={styles.muted}>Reason: {draft.contact.doNotContactReason}</div>
        )}
        {draft.deal && (
          <div className={styles.muted}>
            Deal: <Link href={`/crm/opportunities/${draft.deal.id}`}>{draft.deal.name}</Link> ({label(draft.deal.stage)})
          </div>
        )}
        <div className={styles.muted}>
          Created {day(draft.createdAt)}
          {draft.sentAt ? ` | Sent ${day(draft.sentAt)}` : ""}
          {draft.reviewedAt ? ` | Reviewed ${day(draft.reviewedAt)}${draft.reviewedByName ? ` by ${draft.reviewedByName}` : ""}` : ""}
        </div>
        {draft.rejectReason && <div className={styles.muted}>Rejected because: {draft.rejectReason}</div>}
      </section>

      <div className={styles.detailGrid}>
        <div>
          {/* ---------- The email ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>The email</h2>

            {draft.editedAt && (
              <p className={styles.muted}>
                Edited by {draft.editedByName ?? "someone"} on {day(draft.editedAt)}. The claim sources below were
                recorded for the original wording and can't verify your edits, so check any facts you changed yourself.
              </p>
            )}

            {isDraft ? (
              <form action={saveDraftEdits}>
                <input type="hidden" name="messageId" value={draft.id} />
                <input type="hidden" name="returnTo" value={returnTo} />

                <label className={styles.label}>
                  Subject
                  <input name="subject" required maxLength={120} defaultValue={draft.subject} className={styles.input} />
                </label>
                <label className={styles.label}>
                  Body
                  <textarea
                    name="body"
                    required
                    maxLength={1500}
                    defaultValue={draft.body}
                    className={styles.textarea}
                    style={{ minHeight: 240 }}
                  />
                </label>

                <button type="submit" className={styles.buttonSecondary} style={{ marginTop: 10 }}>
                  Save edits
                </button>
              </form>
            ) : (
              <div style={{ whiteSpace: "pre-wrap" }}>{draft.body}</div>
            )}
          </section>

          {/* ---------- Actions ---------- */}
          {(isDraft || isApproved) && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>{isDraft ? "Review" : "Ready to send"}</h2>

              {blocked && (
                <p>
                  <span className={`${styles.badge} ${styles.badgeBad}`}>blocked</span> This contact is marked do not
                  contact. This email can't be approved or sent. Reject it.
                </p>
              )}

              {isDraft && !blocked && (
                <form action={approveDraft}>
                  <input type="hidden" name="messageId" value={draft.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {!draft.qualityPassed && (
                    <label className={styles.muted} style={{ display: "block", marginBottom: 8 }}>
                      <input type="checkbox" name="override" /> I've read the quality issues and approve anyway
                    </label>
                  )}
                  <button type="submit" className={styles.buttonPrimary} style={{ marginTop: 0 }}>
                    Approve
                  </button>
                </form>
              )}

              {isApproved && !blocked && (
                <form action={sendApproved}>
                  <input type="hidden" name="messageId" value={draft.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button type="submit" className={styles.buttonPrimary} style={{ marginTop: 0 }}>
                    Send (sandbox)
                  </button>
                </form>
              )}

              <form action={rejectDraft} className={styles.formRow}>
                <input type="hidden" name="messageId" value={draft.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input
                  name="reason"
                  required
                  maxLength={300}
                  placeholder="Why reject it?"
                  className={styles.input}
                  style={{ width: 280 }}
                />
                <button type="submit" className={`${styles.buttonDanger} ${styles.buttonSmall}`}>
                  Reject
                </button>
              </form>
            </section>
          )}
        </div>

        <div>
          {/* ---------- Quality ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Quality check</h2>
            {draft.qualityPassed ? (
              <p>
                <span className={`${styles.badge} ${styles.badgeGood}`}>passed</span>
              </p>
            ) : (
              <>
                <p>
                  <span className={`${styles.badge} ${styles.badgeBad}`}>issues</span>
                </p>
                <ul className={styles.list}>
                  {draft.qualityIssues.map((issue) => (
                    <li key={issue} className={styles.listItem}>
                      {issue}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className={styles.muted}>
              Approving re-runs this check against the company's current data.
            </p>
          </section>

          {/* ---------- Claims ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Claims and where they came from</h2>
            {draft.claims.length === 0 ? (
              <p className={styles.muted}>
                The model made no specific claims about the company, beyond using its name, industry and the contact's role.
              </p>
            ) : (
              <ul className={styles.list}>
                {draft.claims.map((c, i) => (
                  <li key={i} className={styles.listItem}>
                    <div>{c.text}</div>
                    <div className={styles.muted}>source: {label(c.source)}</div>
                  </li>
                ))}
              </ul>
            )}
            {draft.personalizationUsed.length > 0 && (
              <p className={styles.muted}>Personalization used: {draft.personalizationUsed.join(", ")}</p>
            )}
          </section>

          {/* ---------- History ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>History</h2>
            {draft.events.length === 0 ? (
              <p className={styles.muted}>No recorded events yet.</p>
            ) : (
              <ol className={styles.timelineList}>
                {draft.events.map((e) => (
                  <li key={e.id}>
                    {day(e.at)}: {label(e.type)}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}