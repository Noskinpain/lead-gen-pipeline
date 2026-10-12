import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { generateDraft } from "@/app/crm/outreach-actions";
import { requireUser } from "@/lib/auth";
import { loadOutreachQueue, type QueueRow } from "@/lib/crm/load-outreach";
import { day, label } from "@/lib/crm/format";

function statusClass(status: string): string {
  if (["SENT", "DELIVERED", "REPLIED", "QUALIFIED", "MEETING_BOOKED", "CONVERTED"].includes(status)) return styles.badgeGood;
  if (["BOUNCED", "UNSUBSCRIBED", "REJECTED"].includes(status)) return styles.badgeBad;
  if (status === "APPROVED") return styles.badgeAccent;
  return styles.badgeWarn;
}

function EmailTable({ rows, empty }: { rows: QueueRow[]; empty: string }) {
  if (rows.length === 0) return <p className={styles.muted}>{empty}</p>;

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Company</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Checks</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/crm/outreach/${r.id}`}>{r.subject}</Link>
              </td>
              <td>
                <Link href={`/crm/companies/${r.companyId}`}>{r.companyName}</Link>
              </td>
              <td>
                {r.contactName}{" "}
                {r.doNotContact && <span className={`${styles.badge} ${styles.badgeBad}`}>do not contact</span>}
              </td>
              <td>
                <span className={`${styles.badge} ${statusClass(r.status)}`}>{label(r.status.toLowerCase())}</span>
              </td>
              <td>
                {r.qualityPassed ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>passed</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeBad}`}>issues</span>
                )}
              </td>
              <td>{day(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireUser();
  const { ok, error } = await searchParams;
  const queue = await loadOutreachQueue();

  return (
    <>
      <h1 className={styles.pageTitle}>Outreach</h1>
      <p className={styles.muted}>
        Every email is reviewed by a person before it can be sent. Sending is sandbox-only: nothing is emailed to a contact.
      </p>

      <Flash ok={ok} error={error} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Ready to draft ({queue.readyToDraft.length})</h2>
        <p className={styles.muted}>
          Open deals at New or Qualified whose contact has an email, isn't marked do not contact, and hasn't been emailed.
          Generating a draft takes a few seconds.
        </p>
        {queue.readyToDraft.length === 0 ? (
          <p className={styles.muted}>No deals are ready. Create a deal from a company page, with a contact that has an email.</p>
        ) : (
          <ul className={styles.list}>
            {queue.readyToDraft.map((d) => (
              <li key={d.dealId} className={styles.listItem}>
                <div>
                  <Link href={`/crm/opportunities/${d.dealId}`}>{d.dealName}</Link>{" "}
                  <span className={styles.badge}>{label(d.stage)}</span>
                </div>
                <div className={styles.muted}>
                  <Link href={`/crm/companies/${d.companyId}`}>{d.companyName}</Link> | {d.contactName}
                  {d.contactTitle ? ` - ${d.contactTitle}` : ""}
                </div>
                <form action={generateDraft} className={styles.formRow}>
                  <input type="hidden" name="opportunityId" value={d.dealId} />
                  <input type="hidden" name="returnTo" value="/crm/outreach" />
                  <button type="submit" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
                    Draft email
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Needs review ({queue.drafts.length})</h2>
        <EmailTable rows={queue.drafts} empty="No drafts waiting." />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Approved, ready to send ({queue.approved.length})</h2>
        <EmailTable rows={queue.approved} empty="Nothing approved and waiting." />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>History</h2>
        <EmailTable rows={queue.history} empty="No sent or rejected emails yet." />
      </section>
    </>
  );
}