import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { addNote, createTask, moveStage, setTaskStatus, updateOpportunity } from "@/app/crm/actions";
import { requireUser } from "@/lib/auth";
import { loadOpportunityDetail } from "@/lib/crm/load-opportunity";
import { isOpenStage, isStage, nextStages } from "@/lib/crm/opportunity-state-machine";
import { TASK_PRIORITIES, TASK_TYPES } from "@/lib/crm/task-constants";
import { day, describeEvent, label, money } from "@/lib/crm/format";

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { ok, error } = await searchParams;

  if (!z.uuid().safeParse(id).success) notFound();

  const detail = await loadOpportunityDetail(id);
  if (!detail) notFound();

  const { opportunity, company, contact, people, events, notes, tasks, messages } = detail;
  const returnTo = `/crm/opportunities/${opportunity.id}`;

  const stage = isStage(opportunity.stage) ? opportunity.stage : null;
  const isOpen = stage !== null && isOpenStage(stage);
  const forwardStages = stage ? nextStages(stage).filter((s) => s !== "won" && s !== "lost") : [];
  const canWin = stage ? nextStages(stage).includes("won") : false;
  const ownerName = people.find((p) => p.id === opportunity.ownerId)?.label ?? "Unassigned";

  return (
    <>
      <p>
        <Link href="/crm/pipeline" className={styles.muted}>
          Back to pipeline
        </Link>
      </p>

      <Flash ok={ok} error={error} />

      {/* ---------- Header ---------- */}
      <section className={styles.panel}>
        <h1 className={styles.pageTitle}>
          {opportunity.name}{" "}
          <span className={`${styles.badge} ${stage === "won" ? styles.badgeGood : stage === "lost" ? styles.badgeBad : styles.badgeAccent}`}>
            {label(opportunity.stage)}
          </span>
        </h1>
        <div className={styles.muted}>
          {company.name}
          {company.domain ? ` (${company.domain})` : ""}
        </div>
        <div className={styles.muted}>
          {contact
            ? `${contact.name}${contact.title ? ` - ${contact.title}` : ""} | email: ${contact.emailStatus ?? "unknown"}`
            : "No contact on this deal"}
        </div>
        <div className={styles.muted}>
          Estimated value: {money(opportunity.estimatedValue)}
          {opportunity.actualValue !== null ? ` | Final value: ${money(opportunity.actualValue)}` : ""}
          {opportunity.probability !== null ? ` | Win probability: ${opportunity.probability}%` : ""} | Owner: {ownerName}
        </div>
        <div className={styles.muted}>
          Created {day(opportunity.createdAt)}
          {opportunity.closedAt ? ` | Closed ${day(opportunity.closedAt)}` : ""}
        </div>
        {opportunity.lostReason && <div className={styles.muted}>Lost because: {opportunity.lostReason}</div>}
      </section>

      <div className={styles.detailGrid}>
        <div>
          {/* ---------- Stage actions ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Move this deal</h2>
            {!isOpen ? (
              <p className={styles.muted}>This deal is closed. Closed deals can't be moved.</p>
            ) : (
              <>
                {forwardStages.length > 0 && (
                  <form action={moveStage} className={styles.formRow}>
                    <input type="hidden" name="opportunityId" value={opportunity.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <select name="toStage" className={styles.select} style={{ width: "auto" }} defaultValue={forwardStages[0]}>
                      {forwardStages.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
                      Move
                    </button>
                  </form>
                )}

                {canWin && (
                  <form action={moveStage} className={styles.formRow}>
                    <input type="hidden" name="opportunityId" value={opportunity.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="toStage" value="won" />
                    <input
                      type="number"
                      name="actualValue"
                      min="0"
                      step="0.01"
                      required
                      placeholder="Final deal value"
                      className={styles.input}
                      style={{ width: 180 }}
                    />
                    <button type="submit" className={`${styles.buttonPrimary} ${styles.buttonSmall}`}>
                      Mark won
                    </button>
                  </form>
                )}

                <form action={moveStage} className={styles.formRow}>
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="toStage" value="lost" />
                  <input
                    type="text"
                    name="lostReason"
                    required
                    maxLength={500}
                    placeholder="Why was it lost?"
                    className={styles.input}
                    style={{ width: 260 }}
                  />
                  <button type="submit" className={`${styles.buttonDanger} ${styles.buttonSmall}`}>
                    Mark lost
                  </button>
                </form>
              </>
            )}
          </section>

          {/* ---------- Edit details ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Details</h2>
            <form action={updateOpportunity}>
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <label className={styles.label} htmlFor="name">
                Deal name
              </label>
              <input id="name" name="name" required maxLength={200} defaultValue={opportunity.name} className={styles.input} />

              <div className={styles.formGrid}>
                <div>
                  <label className={styles.label} htmlFor="estimatedValue">
                    Estimated value
                  </label>
                  <input
                    id="estimatedValue"
                    name="estimatedValue"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={opportunity.estimatedValue ?? ""}
                    className={styles.input}
                  />
                </div>

                {stage === "won" && (
                  <div>
                    <label className={styles.label} htmlFor="actualValue">
                      Final value
                    </label>
                    <input
                      id="actualValue"
                      name="actualValue"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={opportunity.actualValue ?? ""}
                      className={styles.input}
                    />
                  </div>
                )}

                <div>
                  <label className={styles.label} htmlFor="probability">
                    Win probability (%)
                  </label>
                  <input
                    id="probability"
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={opportunity.probability ?? ""}
                    className={styles.input}
                  />
                </div>

                <div>
                  <label className={styles.label} htmlFor="ownerId">
                    Owner
                  </label>
                  <select id="ownerId" name="ownerId" defaultValue={opportunity.ownerId ?? ""} className={styles.select}>
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" className={styles.buttonPrimary}>
                Save details
              </button>
            </form>
          </section>

          {/* ---------- Tasks ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Tasks</h2>

            {tasks.length === 0 ? (
              <p className={styles.muted}>No tasks yet.</p>
            ) : (
              <ul className={styles.list}>
                {tasks.map((t) => {
                  const taskIsOpen = t.status === "pending" || t.status === "in_progress";
                  return (
                    <li key={t.id} className={styles.listItem}>
                      <div>
                        <strong>{t.title}</strong>{" "}
                        <span className={styles.badge}>{label(t.status)}</span>{" "}
                        {t.overdue && <span className={`${styles.badge} ${styles.badgeBad}`}>overdue</span>}
                      </div>
                      <div className={styles.muted}>
                        {label(t.type)} | {t.priority} priority | due {t.dueAt ? day(t.dueAt) : "no date"} |{" "}
                        {t.assigneeName ?? "unassigned"}
                      </div>
                      <form action={setTaskStatus} className={styles.formRow}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        {taskIsOpen ? (
                          <>
                            <button type="submit" name="status" value="completed" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
                              Done
                            </button>
                            <button type="submit" name="status" value="cancelled" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="submit" name="status" value="pending" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
                            Reopen
                          </button>
                        )}
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className={styles.panelTitle} style={{ marginTop: 18 }}>
              Add a task
            </h3>
            <form action={createTask}>
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <label className={styles.label} htmlFor="taskTitle">
                What needs doing?
              </label>
              <input id="taskTitle" name="title" required maxLength={200} className={styles.input} />

              <div className={styles.formGrid}>
                <div>
                  <label className={styles.label} htmlFor="taskType">
                    Type
                  </label>
                  <select id="taskType" name="type" defaultValue="follow_up" className={styles.select}>
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {label(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label} htmlFor="taskPriority">
                    Priority
                  </label>
                  <select id="taskPriority" name="priority" defaultValue="normal" className={styles.select}>
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label} htmlFor="taskDue">
                    Due date
                  </label>
                  <input id="taskDue" name="dueDate" type="date" className={styles.input} />
                </div>
                <div>
                  <label className={styles.label} htmlFor="taskAssignee">
                    Assigned to
                  </label>
                  <select id="taskAssignee" name="assignedToId" defaultValue={user.id} className={styles.select}>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" className={styles.buttonPrimary}>
                Add task
              </button>
            </form>
          </section>

          {/* ---------- Notes ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Notes</h2>
            <form action={addNote}>
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <textarea name="body" required maxLength={5000} placeholder="Add a note" className={styles.textarea} />
              <button type="submit" className={styles.buttonPrimary}>
                Add note
              </button>
            </form>

            {notes.length > 0 && (
              <ul className={styles.list} style={{ marginTop: 14 }}>
                {notes.map((n) => (
                  <li key={n.id} className={styles.listItem}>
                    <div className={styles.muted}>
                      {n.authorName} | {day(n.createdAt)}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          {/* ---------- Timeline ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Timeline</h2>
            {events.length === 0 ? (
              <p className={styles.muted}>Nothing has happened yet.</p>
            ) : (
              <ol className={styles.timelineList}>
                {events.map((e) => (
                  <li key={e.id}>
                    {day(e.createdAt)}: {describeEvent(e.eventType, e.fromStage, e.toStage, e.metadata)} ({e.actorName})
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ---------- Messages ---------- */}
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Emails for this company</h2>
            {messages.length === 0 ? (
              <p className={styles.muted}>No drafts or emails yet.</p>
            ) : (
              <ul className={styles.list}>
                {messages.map((m) => (
                  <li key={m.id} className={styles.listItem}>
                    <div>{m.subject}</div>
                    <div className={styles.muted}>
                      {m.status} | {day(m.createdAt)}
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