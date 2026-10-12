import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { requireUser } from "@/lib/auth";
import { runSearch } from "@/lib/crm/load-search";
import { label } from "@/lib/crm/format";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;

  const term = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const results = await runSearch(term);
  const total = results.companies.length + results.contacts.length + results.deals.length;

  return (
    <>
      <h1 className={styles.pageTitle}>Search</h1>

      <form method="get" className={styles.searchBox}>
        <input
          name="q"
          defaultValue={term}
          placeholder="Company, website, contact, email, or deal"
          className={styles.input}
        />
        <button type="submit" className={styles.buttonSecondary}>
          Search
        </button>
      </form>

      {term.length < 2 ? (
        <p className={styles.muted}>Type at least 2 characters.</p>
      ) : total === 0 ? (
        <p className={styles.muted}>Nothing matches "{term}".</p>
      ) : (
        <>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Companies ({results.companies.length})</h2>
            {results.companies.length === 0 ? (
              <p className={styles.muted}>None.</p>
            ) : (
              <ul className={styles.list}>
                {results.companies.map((c) => (
                  <li key={c.id} className={styles.listItem}>
                    <Link href={`/crm/companies/${c.id}`}>{c.name}</Link>
                    <div className={styles.muted}>{[c.domain, c.industry].filter(Boolean).join(" | ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Contacts ({results.contacts.length})</h2>
            {results.contacts.length === 0 ? (
              <p className={styles.muted}>None.</p>
            ) : (
              <ul className={styles.list}>
                {results.contacts.map((c) => (
                  <li key={c.id} className={styles.listItem}>
                    <Link href={`/crm/companies/${c.companyId}#contact-${c.id}`}>{c.name}</Link>
                    <div className={styles.muted}>
                      {c.title ? `${c.title} at ` : ""}
                      {c.companyName}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Deals ({results.deals.length})</h2>
            {results.deals.length === 0 ? (
              <p className={styles.muted}>None.</p>
            ) : (
              <ul className={styles.list}>
                {results.deals.map((d) => (
                  <li key={d.id} className={styles.listItem}>
                    <Link href={`/crm/opportunities/${d.id}`}>{d.name}</Link>{" "}
                    <span className={styles.badge}>{label(d.stage)}</span>
                    <div className={styles.muted}>{d.companyName}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}