import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { setTaskStatus } from "@/app/crm/actions";
import { requireUser } from "@/lib/auth";
import { loadTasks, type TaskScope, type TaskView } from "@/lib/crm/load-tasks";
import { day, label } from "@/lib/crm/format";

function priorityClass(priority: string): string {
  if (priority === "high") return styles.badgeBad;
  if (priority === "low") return "";
  return styles.badgeWarn;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; view?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { scope: rawScope, view: rawView, ok, error } = await searchParams;

  const scope: TaskScope = rawScope === "all" ? "all" : "mine";
  const view: TaskView = rawView === "closed" ? "closed" : "open";

  const rows = await loadTasks(scope, view, user.id);
  const returnTo = `/crm/tasks?scope=${scope}&view=${view}`;
  const overdueCount = rows.filter((r) => r.overdue).length;

  const link = (nextScope: TaskScope, nextView: TaskView) => `/crm/tasks?scope=${nextScope}&view=${nextView}`;

  return (
    <>
      <h1 className={styles.pageTitle}>Tasks</h1>
      <p className={styles.muted}>
        {rows.length} {view === "open" ? "open" : "closed"} task{rows.length === 1 ? "" : "s"}
        {view === "open" && overdueCount > 0 ? `, ${overdueCount} overdue` : ""}.
      </p>

      <Flash ok={ok} error={error} />

      <div className={styles.formRow} style={{ marginBottom: 14 }}>
        <Link
          href={link("mine", view)}
          className={`${styles.badge} ${scope === "mine" ? styles.badgeAccent : ""}`}
          style={{ textDecoration: "none" }}
        >
          Mine
        </Link>
        <Link
          href={link("all", view)}
          className={`${styles.badge} ${scope === "all" ? styles.badgeAccent : ""}`}
          style={{ textDecoration: "none" }}
        >
          Everyone
        </Link>
        <span className={styles.muted}>|</span>
        <Link
          href={link(scope, "open")}
          className={`${styles.badge} ${view === "open" ? styles.badgeAccent : ""}`}
          style={{ textDecoration: "none" }}
        >
          Open
        </Link>
        <Link
          href={link(scope, "closed")}
          className={`${styles.badge} ${view === "closed" ? styles.badgeAccent : ""}`}
          style={{ textDecoration: "none" }}
        >
          Done or cancelled
        </Link>
      </div>

      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.muted}>Nothing here.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Deal</th>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const isOpen = t.status === "pending" || t.status === "in_progress";
                  return (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>
                        {t.opportunityId ? (
                          <Link href={`/crm/opportunities/${t.opportunityId}`}>{t.opportunityName ?? "Open deal"}</Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        {t.companyId ? <Link href={`/crm/companies/${t.companyId}`}>{t.companyName ?? "Company"}</Link> : ""}
                      </td>
                      <td>{label(t.type)}</td>
                      <td>
                        <span className={`${styles.badge} ${priorityClass(t.priority)}`}>{t.priority}</span>
                      </td>
                      <td>{t.assigneeName ?? "unassigned"}</td>
                      <td>
                        {t.dueAt ? day(t.dueAt) : "no date"}{" "}
                        {t.overdue && <span className={`${styles.badge} ${styles.badgeBad}`}>overdue</span>}
                      </td>
                      <td>
                        <form action={setTaskStatus} className={styles.formRow} style={{ marginTop: 0 }}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          {isOpen ? (
                            <>
                              <button
                                type="submit"
                                name="status"
                                value="completed"
                                className={`${styles.buttonSecondary} ${styles.buttonSmall}`}
                              >
                                Done
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="cancelled"
                                className={`${styles.buttonSecondary} ${styles.buttonSmall}`}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="submit"
                              name="status"
                              value="pending"
                              className={`${styles.buttonSecondary} ${styles.buttonSmall}`}
                            >
                              Reopen
                            </button>
                          )}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}