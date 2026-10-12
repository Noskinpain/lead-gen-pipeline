import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import {
  addCompanyNote,
  createContact,
  createDeal,
  setCompanyArchived,
  updateCompany,
  updateContact,
} from "@/app/crm/company-actions";
import { requireUser } from "@/lib/auth";
import { loadCompanyDetail, type CompanyContact } from "@/lib/crm/load-companies";
import { DEAL_START_STAGES, SENIORITIES } from "@/lib/crm/company-constants";
import { day, label, money } from "@/lib/crm/format";

function ContactFields({ contact }: { contact?: CompanyContact }) {
  return (
    <div className={styles.formGrid}>
      <label className={styles.label}>
        First name
        <input name="firstName" required maxLength={100} defaultValue={contact?.firstName ?? ""} className={styles.input} />
      </label>
      <label className={styles.label}>
        Last name
        <input name="lastName" required maxLength={100} defaultValue={contact?.lastName ?? ""} className={styles.input} />
      </label>
      <label className={styles.label}>
        Job title
        <input name="jobTitle" maxLength={150} defaultValue={contact?.jobTitle ?? ""} className={styles.input} />
      </label>
      <label className={styles.label}>
        Department
        <input name="department" maxLength={100} defaultValue={contact?.department ?? ""} className={styles.input} />
      </label>
      <label className={styles.label}>
        Seniority
        <select name="seniority" defaultValue={contact?.seniority ?? ""} className={styles.select}>
          <option value="">Not set</option>
          {SENIORITIES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.label}>
        Email
        <input name="email" type="email" defaultValue={contact?.email ?? ""} className={styles.input} />
      </label>
    </div>
  );
}

export default async function CompanyPage({
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

  const detail = await loadCompanyDetail(id);
  if (!detail) notFound();

  const { company, contacts, deals, notes, tasks, facts, score, websiteOpportunity, messages } = detail;
  const returnTo = `/crm/companies/${company.id}`;
  const archived = company.status === "archived";
  const siteHref = company.website && /^https?:\/\//i.test(company.website) ? company.website : null;
  const summary = [
    company.industry,
    company.location,
    company.employeeCount !== null ? `${company.employeeCount} employees` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <>
      <p>
        <Link href="/crm/companies" className={styles.muted}>
          Back to companies
        </Link>
      </p>

      <Flash ok={ok} error={error} />

      {/* ---------- Header ---------- */}
      <section className={styles.panel}>
        <h1 className={styles.pageTitle}>
          {company.name}{" "}
          {archived && <span className={`${styles.badge} ${styles.badgeWarn}`}>archived</span>}
        </h1>
        <div className={styles.muted}>
          {siteHref ? (
            <a href={siteHref} target="_blank" rel="noreferrer noopener">
              {company.domain ?? company.website}
            </a>
          ) : (
            (company.domain ?? company.website ?? "No website")
          )}
        </div>
        <div className={styles.muted}>{summary || "No industry, location or size recorded"}</div>
        <div className={styles.muted}>
          Source: {company.source ?? "unknown"} | Added {day(company.createdAt)}
        </div>
      </section>

      <div className={styles.detailGrid}>
        <div>
          {/* ---------- Edit ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Company details</h2>
            <form action={updateCompany}>
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <label className={styles.label}>
                Company name
                <input name="name" required maxLength={200} defaultValue={company.name} className={styles.input} />
              </label>

              <div className={styles.formGrid}>
                <label className={styles.label}>
                  Website
                  <input name="website" maxLength={300} defaultValue={company.website ?? ""} className={styles.input} />
                </label>
                <label className={styles.label}>
                  Industry
                  <input name="industry" maxLength={120} defaultValue={company.industry ?? ""} className={styles.input} />
                </label>
                <label className={styles.label}>
                  Location
                  <input name="location" maxLength={120} defaultValue={company.location ?? ""} className={styles.input} />
                </label>
                <label className={styles.label}>
                  Employees
                  <input
                    name="employeeCount"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={company.employeeCount ?? ""}
                    className={styles.input}
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <button type="submit" className={styles.buttonPrimary} style={{ marginTop: 0 }}>
                  Save company
                </button>
              </div>
            </form>

            <form action={setCompanyArchived} className={styles.formRow}>
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="archived" value={archived ? "0" : "1"} />
              <button type="submit" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
                {archived ? "Restore company" : "Archive company"}
              </button>
            </form>
          </section>

          {/* ---------- Contacts ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Contacts ({contacts.length})</h2>

            {contacts.length === 0 ? (
              <p className={styles.muted}>No contacts yet.</p>
            ) : (
              <ul className={styles.list}>
                {contacts.map((c) => (
                  <li key={c.id} id={`contact-${c.id}`} className={styles.listItem}>
                    <div>
                      <strong>
                        {c.firstName} {c.lastName}
                      </strong>
                      {c.jobTitle ? ` - ${c.jobTitle}` : ""}
                    </div>
                    <div className={styles.muted}>
                      {c.email ?? "no email"} | email check: {c.emailStatus ?? "unknown"} | role score:{" "}
                      {c.contactScore ?? "n/a"} | source: {c.source}
                    </div>
                    <details>
                      <summary style={{ cursor: "pointer" }}>Edit</summary>
                      <form action={updateContact}>
                        <input type="hidden" name="contactId" value={c.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <ContactFields contact={c} />
                        <button type="submit" className={`${styles.buttonPrimary} ${styles.buttonSmall}`}>
                          Save contact
                        </button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            <h3 className={styles.panelTitle} style={{ marginTop: 18 }}>
              Add a contact
            </h3>
            <form action={createContact}>
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <ContactFields />
              <button type="submit" className={styles.buttonPrimary}>
                Add contact
              </button>
            </form>
          </section>

          {/* ---------- Deals ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Deals ({deals.length})</h2>

            {deals.length === 0 ? (
              <p className={styles.muted}>No deals yet.</p>
            ) : (
              <ul className={styles.list}>
                {deals.map((d) => (
                  <li key={d.id} className={styles.listItem}>
                    <Link href={`/crm/opportunities/${d.id}`}>{d.name}</Link>{" "}
                    <span className={styles.badge}>{label(d.stage)}</span>
                    <div className={styles.muted}>
                      {money(d.estimatedValue)} | {d.contactName ?? "no contact"} | updated {day(d.updatedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!archived && (
              <>
                <h3 className={styles.panelTitle} style={{ marginTop: 18 }}>
                  Create a deal
                </h3>
                <form action={createDeal}>
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />

                  <label className={styles.label}>
                    Deal name
                    <input
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={`${company.name} - Opportunity`}
                      className={styles.input}
                    />
                  </label>

                  <div className={styles.formGrid}>
                    <label className={styles.label}>
                      Contact
                      <select name="contactId" defaultValue="" className={styles.select}>
                        <option value="">No contact yet</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.firstName} {c.lastName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.label}>
                      Estimated value
                      <input name="estimatedValue" type="number" min="0" step="0.01" className={styles.input} />
                    </label>
                    <label className={styles.label}>
                      Starting stage
                      <select name="stage" defaultValue="qualified" className={styles.select}>
                        {DEAL_START_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <button type="submit" className={styles.buttonPrimary}>
                    Create deal
                  </button>
                </form>
              </>
            )}
          </section>

          {/* ---------- Notes ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Notes</h2>
            <form action={addCompanyNote}>
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <textarea name="body" required maxLength={5000} placeholder="Add a note" className={styles.textarea} />
              <div className={styles.formRow}>
                <select name="contactId" defaultValue="" className={styles.select} style={{ width: "auto" }}>
                  <option value="">About the company</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      About {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
                <button type="submit" className={styles.buttonPrimary} style={{ marginTop: 0 }}>
                  Add note
                </button>
              </div>
            </form>

            {notes.length > 0 && (
              <ul className={styles.list} style={{ marginTop: 14 }}>
                {notes.map((n) => (
                  <li key={n.id} className={styles.listItem}>
                    <div className={styles.muted}>
                      {n.authorName} | {day(n.createdAt)} | {n.context}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          {/* ---------- Scores ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Scores</h2>

            <div>
              <strong>Lead score</strong>{" "}
              {score ? (
                <>
                  <span className={styles.badge}>{score.priority}</span>
                  <div className={styles.muted}>
                    Fit {score.fit} | Intent {score.intent} | scoring {score.version} | {day(score.createdAt)}
                  </div>
                  <div className={styles.muted}>{score.explanation}</div>
                </>
              ) : (
                <span className={styles.muted}>not scored</span>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <strong>Website opportunity</strong>{" "}
              {websiteOpportunity ? (
                <>
                  <span className={styles.badge}>{websiteOpportunity.score}/100</span>
                  <div className={styles.muted}>
                    Gaps found:{" "}
                    {websiteOpportunity.gaps.length > 0 ? websiteOpportunity.gaps.map(label).join(", ") : "none"}
                  </div>
                  <div className={styles.muted}>Higher means a bigger gap on their site.</div>
                </>
              ) : (
                <span className={styles.muted}>no website data yet</span>
              )}
            </div>
          </section>

          {/* ---------- Tasks ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Tasks</h2>
            {tasks.length === 0 ? (
              <p className={styles.muted}>No tasks. Tasks are created from a deal.</p>
            ) : (
              <ul className={styles.list}>
                {tasks.map((t) => (
                  <li key={t.id} className={styles.listItem}>
                    <div>
                      {t.opportunityId ? <Link href={`/crm/opportunities/${t.opportunityId}`}>{t.title}</Link> : t.title}{" "}
                      <span className={styles.badge}>{label(t.status)}</span>{" "}
                      {t.overdue && <span className={`${styles.badge} ${styles.badgeBad}`}>overdue</span>}
                    </div>
                    <div className={styles.muted}>
                      {label(t.type)} | due {t.dueAt ? day(t.dueAt) : "no date"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- Emails ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Emails</h2>
            {messages.length === 0 ? (
              <p className={styles.muted}>No drafts or emails yet.</p>
            ) : (
              <ul className={styles.list}>
                {messages.map((m) => (
                  <li key={m.id} className={styles.listItem}>
                    <div>{m.subject}</div>
                    <div className={styles.muted}>
                      {m.status} | {m.contactName ?? "no contact"} | {day(m.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- Enrichment ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>What we know ({facts.length})</h2>
            {facts.length === 0 ? (
              <p className={styles.muted}>No enrichment data yet.</p>
            ) : (
              <ul className={styles.list}>
                {facts.map((f) => (
                  <li key={f.field} className={styles.listItem}>
                    <div className={styles.muted}>
                      {label(f.field)} | {f.source}
                      {f.confidence !== null ? ` | confidence ${f.confidence}` : ""} | {day(f.observedAt)}
                    </div>
                    <div style={{ overflowWrap: "anywhere" }}>
                      {f.value.length > 300 ? `${f.value.slice(0, 300)}...` : f.value}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}