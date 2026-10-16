import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import {
  addSuppressionEntry,
  markMockContactsAsTestData,
  recordLawfulBasis,
  removeSuppressionEntry,
} from "@/app/crm/compliance-actions";
import { requireUser } from "@/lib/auth";
import { loadComplianceOverview } from "@/lib/crm/load-compliance";
import { BASIS_HELP, LAWFUL_BASES, MANUAL_SUPPRESSION_REASONS } from "@/lib/compliance/constants";
import { buildFooter } from "@/lib/compliance/footer";
import { getSenderIdentity, senderSettingStatus } from "@/lib/compliance/sender-identity";
import { day, label } from "@/lib/crm/format";

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireUser();
  const { ok, error } = await searchParams;

  const overview = await loadComplianceOverview();
  const settings = senderSettingStatus();
  const sender = getSenderIdentity();
  const hasMockContacts = overview.needingBasis.some((c) => c.source === "mock_contact_source");

  return (
    <>
      <h1 className={styles.pageTitle}>Compliance</h1>
      <p className={styles.muted}>
        Who may be contacted, why, and how people opt out. These are record-keeping tools and are not legal advice.
      </p>

      <Flash ok={ok} error={error} />

      {/* ---------- Sender identity ---------- */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Sender identity</h2>
        <p className={styles.muted}>
          Every email carries this, plus an unsubscribe link, and nothing is sent without it. Set these in .env.local.
        </p>
        <ul className={styles.list}>
          {settings.map((s) => (
            <li key={s.name} className={styles.listItem}>
              <span className={`${styles.badge} ${s.ok ? styles.badgeGood : styles.badgeBad}`}>{s.ok ? "set" : "missing"}</span>{" "}
              {s.name}
              {s.problem ? <span className={styles.muted}> ({s.problem})</span> : null}
            </li>
          ))}
        </ul>

        {sender.ok ? (
          <>
            <h3 className={styles.panelTitle} style={{ marginTop: 14 }}>
              Footer preview
            </h3>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }} className={styles.muted}>
              {buildFooter(sender.identity, `${sender.identity.baseUrl.replace(/\/+$/, "")}/unsubscribe/<signed-link>`, "the page where you found them")}
            </pre>
          </>
        ) : (
          <p className={styles.muted}>Fix the settings above to see the footer.</p>
        )}
      </section>

      {/* ---------- Contacts needing a basis ---------- */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Contacts with no recorded basis ({overview.needingBasisTotal})</h2>
        <p className={styles.muted}>
          A contact can't be drafted for until you record why you may contact them and where their details came from.
        </p>

        <details style={{ marginBottom: 12 }}>
          <summary className={styles.clickable}>What each basis means</summary>
          <ul className={styles.list}>
            {LAWFUL_BASES.map((b) => (
              <li key={b} className={styles.listItem}>
                <strong>{label(b)}</strong>: {BASIS_HELP[b]}
              </li>
            ))}
          </ul>
        </details>

        <div className={styles.formRow} style={{ marginBottom: 12 }}>
          {overview.basisCounts.map((c) => (
            <span key={c.basis} className={styles.badge}>
              {label(c.basis)}: {c.count}
            </span>
          ))}
        </div>

        {hasMockContacts && (
          <form action={markMockContactsAsTestData} className={styles.formRow}>
            <button type="submit" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
              Mark all mock-source contacts as test data
            </button>
          </form>
        )}

        {overview.needingBasis.length === 0 ? (
          <p className={styles.muted}>Every contact has a recorded basis.</p>
        ) : (
          <ul className={styles.list}>
            {overview.needingBasis.map((c) => (
              <li key={c.id} className={styles.listItem}>
                <div>
                  <strong>{c.name}</strong>
                  {c.title ? ` - ${c.title}` : ""} at <Link href={`/crm/companies/${c.companyId}`}>{c.companyName}</Link>{" "}
                  <span className={styles.muted}>
                    | source: {c.source}
                    {c.hasEmail ? "" : " | no email"}
                  </span>
                </div>
                <form action={recordLawfulBasis}>
                  <input type="hidden" name="contactId" value={c.id} />
                  <div className={styles.formGrid}>
                    <label className={styles.label}>
                      Basis
                      <select name="basis" defaultValue="" required className={styles.select}>
                        <option value="" disabled>
                          Choose one
                        </option>
                        {LAWFUL_BASES.map((b) => (
                          <option key={b} value={b}>
                            {label(b)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.label}>
                      Note (how you know)
                      <input name="note" maxLength={500} className={styles.input} />
                    </label>
                    <label className={styles.label}>
                      Where their details came from
                      <input name="collectedFrom" maxLength={300} placeholder="a page, directory or referral" className={styles.input} />
                    </label>
                  </div>
                  <button type="submit" className={`${styles.buttonPrimary} ${styles.buttonSmall}`} style={{ marginTop: 8 }}>
                    Record basis
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {overview.needingBasisTotal > overview.needingBasis.length && (
          <p className={styles.muted}>Showing the newest {overview.needingBasis.length}.</p>
        )}
      </section>

      {/* ---------- Do not contact ---------- */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Marked do not contact ({overview.flagged.length})</h2>
        {overview.flagged.length === 0 ? (
          <p className={styles.muted}>Nobody is marked do not contact.</p>
        ) : (
          <ul className={styles.list}>
            {overview.flagged.map((c) => (
              <li key={c.id} className={styles.listItem}>
                <Link href={`/crm/companies/${c.companyId}#contact-${c.id}`}>{c.name}</Link> at {c.companyName}
                <div className={styles.muted}>
                  {c.reason ?? "no reason recorded"}
                  {c.at ? ` | ${day(c.at)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>
          An address flagged here is blocked everywhere it appears, at any company. To allow contact again, use the deal page
          and record why. If they also unsubscribed through an email link, remove their suppression entry below too.
        </p>
      </section>

      {/* ---------- Suppression list ---------- */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Suppression list ({overview.suppressions.length})</h2>
        <p className={styles.muted}>
          Addresses and domains that must never be emailed. Addresses are stored as hashes, so an erased person stays
          suppressed without us keeping their email.
        </p>

        <form action={addSuppressionEntry} className={styles.formRow}>
          <select name="kind" defaultValue="email" className={styles.select} style={{ width: "auto" }}>
            <option value="email">Email address</option>
            <option value="domain">Whole domain</option>
          </select>
          <input name="value" required maxLength={254} placeholder="name@example.com or example.com" className={styles.input} style={{ width: 260 }} />
          <select name="reason" defaultValue="manual" className={styles.select} style={{ width: "auto" }}>
            {MANUAL_SUPPRESSION_REASONS.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
          <button type="submit" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
            Add
          </button>
        </form>

        {overview.suppressions.length > 0 && (
          <div className={styles.scroll} style={{ marginTop: 12 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Reason</th>
                  <th>Source</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {overview.suppressions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.target}</td>
                    <td>{label(s.reason)}</td>
                    <td>{label(s.source)}</td>
                    <td>{day(s.createdAt)}</td>
                    <td>
                      <form action={removeSuppressionEntry} className={styles.formRow} style={{ marginTop: 0 }}>
                        <input type="hidden" name="id" value={s.id} />
                        <input name="reason" required minLength={5} maxLength={300} placeholder="Why remove it?" className={styles.input} style={{ width: 180 }} />
                        <button type="submit" className={`${styles.buttonDanger} ${styles.buttonSmall}`}>
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}