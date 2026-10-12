import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { enrichProspects } from "@/app/crm/prospect-actions";
import { ImportForm } from "./import-form";
import { requireUser } from "@/lib/auth";
import { loadProspectTable, PROSPECT_WINDOW } from "@/lib/crm/load-prospects";
import { day, label } from "@/lib/crm/format";

function scoreClass(score: number): string {
  if (score >= 50) return styles.badgeGood;
  if (score >= 20) return styles.badgeWarn;
  return "";
}

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireUser();
  const { ok, error } = await searchParams;
  const table = await loadProspectTable();

  return (
    <>
      <h1 className={styles.pageTitle}>Website prospects</h1>
      <p className={styles.muted}>
        Import businesses, enrich their websites, and rank them by how much their site needs. A higher score means a bigger
        gap, so a stronger prospect for a website service.
      </p>

      <Flash ok={ok} error={error} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Import companies from a CSV</h2>
        <p className={styles.muted}>
          The header row needs a company name column (company_name, company or name). Website, industry, location and
          employees are optional. Duplicates are skipped and listed. Maximum 2,000 rows and 1 MB.
        </p>
        <ImportForm />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          Enrich websites ({table.waiting.length} waiting, {table.failed.length} couldn't be fetched)
        </h2>
        <p className={styles.muted}>
          Fetches each waiting company's website and stores what it finds, 5 at a time, newest first. A dead or blocking
          site can take about a minute to give up on, so a batch may take a while. Sites that can't be fetched are retried
          after a week.
        </p>
        <form action={enrichProspects} className={styles.formRow}>
          <select name="source" defaultValue="" className={styles.select} style={{ width: "auto" }}>
            <option value="">Any import</option>
            {table.waitingSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" disabled={table.waiting.length === 0} className={styles.buttonSecondary}>
            Enrich next 5
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Ranked ({table.scored.length})</h2>
        {table.scored.length === 0 ? (
          <p className={styles.muted}>Nothing scored yet. Import companies with websites, then enrich them.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Business</th>
                  <th>Website</th>
                  <th>Score</th>
                  <th>Contact signals found</th>
                  <th>Gaps found</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {table.scored.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>
                      <Link href={`/crm/companies/${p.id}`}>{p.name}</Link>
                    </td>
                    <td>{p.domain}</td>
                    <td>
                      <span className={`${styles.badge} ${scoreClass(p.score)}`}>{p.score}/100</span>
                    </td>
                    <td>{p.contact}</td>
                    <td>{p.gaps.length > 0 ? p.gaps.map(label).join(", ") : "none"}</td>
                    <td>{p.source ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.muted}>
          Only signals readable from the scraped page are scored: there is no social, page-speed or mobile data. The scorer
          hasn't been validated against human labels, and it can only see businesses that already have a website.
          {table.limited ? ` Showing the newest ${PROSPECT_WINDOW} companies with a website.` : ""}
        </p>
      </section>

      {table.failed.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Couldn't be fetched ({table.failed.length})</h2>
          <p className={styles.muted}>The site was down, blocked the request, or had nothing readable. Open one in a browser to check.</p>
          <ul className={styles.list}>
            {table.failed.map((f) => (
              <li key={f.id} className={styles.listItem}>
                <Link href={`/crm/companies/${f.id}`}>{f.name}</Link> | {f.domain} | tried {day(f.attemptedAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Exports</h2>
        <ul className={styles.list}>
          {[
            ["prospects", "Prospect ranking (scored, failed and waiting)"],
            ["companies", "All companies"],
            ["contacts", "All contacts (includes email addresses)"],
            ["deals", "All deals"],
            ["tasks", "All tasks"],
          ].map(([kind, text]) => (
            <li key={kind} className={styles.listItem}>
              <a href={`/crm/export/${kind}`}>{text}</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}