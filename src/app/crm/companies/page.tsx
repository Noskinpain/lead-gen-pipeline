import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { createCompany } from "@/app/crm/company-actions";
import { requireUser } from "@/lib/auth";
import { loadCompanyList } from "@/lib/crm/load-companies";
import { day } from "@/lib/crm/format";

function priorityClass(priority: string | null): string {
  if (priority === "HIGH") return styles.badgeGood;
  if (priority === "MEDIUM") return styles.badgeWarn;
  if (priority === "REJECT") return styles.badgeBad;
  return "";
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; ok?: string; error?: string }>;
}) {
  await requireUser();
  const { q, archived, ok, error } = await searchParams;

  const search = typeof q === "string" ? q.slice(0, 100) : "";
  const showArchived = archived === "1";
  const { rows, limited } = await loadCompanyList(search, showArchived);

  return (
    <>
      <h1 className={styles.pageTitle}>Companies</h1>
      <p className={styles.muted}>
        {rows.length} shown{limited ? " (the newest 100; search to narrow it down)" : ""}.
      </p>

      <Flash ok={ok} error={error} />

      <section className={styles.panel}>
        <form method="get" className={styles.searchBox}>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name or website"
            className={styles.input}
          />
          <label className={styles.muted} style={{ whiteSpace: "nowrap", margin: 0 }}>
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} /> Show archived
          </label>
          <button type="submit" className={styles.buttonSecondary}>
            Search
          </button>
        </form>

        <details>
          <summary style={{ cursor: "pointer" }}>Add a company</summary>
          <form action={createCompany}>
            <input type="hidden" name="returnTo" value="/crm/companies" />

            <label className={styles.label}>
              Company name
              <input name="name" required maxLength={200} className={styles.input} />
            </label>

            <div className={styles.formGrid}>
              <label className={styles.label}>
                Website
                <input name="website" placeholder="example.com" maxLength={300} className={styles.input} />
              </label>
              <label className={styles.label}>
                Industry
                <input name="industry" maxLength={120} className={styles.input} />
              </label>
              <label className={styles.label}>
                Location
                <input name="location" maxLength={120} className={styles.input} />
              </label>
              <label className={styles.label}>
                Employees
                <input name="employeeCount" type="number" min="0" step="1" className={styles.input} />
              </label>
            </div>

            <label className={styles.muted} style={{ display: "block", marginTop: 10 }}>
              <input type="checkbox" name="confirmDuplicate" /> Create anyway even if it looks like a duplicate
            </label>

            <button type="submit" className={styles.buttonPrimary}>
              Add company
            </button>
          </form>
        </details>
      </section>

      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.muted}>No companies match.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Website</th>
                  <th>Industry</th>
                  <th>Location</th>
                  <th>Contacts</th>
                  <th>Open deals</th>
                  <th>Lead score</th>
                  <th>Source</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/crm/companies/${r.id}`}>{r.name}</Link>{" "}
                      {r.status === "archived" && <span className={`${styles.badge} ${styles.badgeWarn}`}>archived</span>}
                    </td>
                    <td>{r.domain ?? ""}</td>
                    <td>{r.industry ?? ""}</td>
                    <td>{r.location ?? ""}</td>
                    <td>{r.contactCount}</td>
                    <td>{r.openDeals}</td>
                    <td>
                      {r.priority ? (
                        <span className={`${styles.badge} ${priorityClass(r.priority)}`}>{r.priority}</span>
                      ) : (
                        <span className={styles.muted}>not scored</span>
                      )}
                    </td>
                    <td>{r.source ?? ""}</td>
                    <td>{day(r.createdAt)}</td>
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