import styles from "./dashboard.module.css";
import {
  loadDashboardData,
  PIPELINE_STAGES,
  type CostSummary,
  type EvaluationSummary,
  type PipelineCard,
  type ProspectRow,
  type TaskRow,
} from "@/lib/dashboard/load-dashboard-data";
import {
  loadFunnelDetails,
  type FunnelDetails,
  type FunnelStageKey,
} from "@/lib/dashboard/load-funnel-details";
import type { FullFunnel } from "@/lib/analytics/funnel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead Engine Dashboard",
  robots: { index: false, follow: false },
};

const DATA_NOTICE =
  "Demo data: contacts, emails and outreach in this database come from sandbox testing (a mock contact source and sandbox-only sending), not real prospects. Website prospect scores come from real public sites.";

function label(value: string): string {
  return value.replace(/_/g, " ");
}

function pct(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function money(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(2)}`;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

function scoreClass(score: number | null): string {
  if (score === null) return styles.badgeBad;
  if (score >= 50) return styles.badgeHot;
  if (score >= 20) return styles.badgeWarm;
  return styles.badgeCold;
}

// ---------- Funnel ----------

function FunnelSection({ funnel, details }: { funnel: FullFunnel | null; details: FunnelDetails | null }) {
  if (!funnel) return <p className={styles.muted}>Funnel failed to load.</p>;

  const stages: Array<{ key: FunnelStageKey; name: string; value: number }> = [
    { key: "discovered", name: "Discovered", value: funnel.discovered },
    { key: "qualified", name: "Qualified", value: funnel.qualified },
    { key: "contactsFound", name: "Contacts found", value: funnel.contactsFound },
    { key: "verified", name: "Verified", value: funnel.verified },
    { key: "sent", name: "Sent", value: funnel.sent },
    { key: "delivered", name: "Delivered", value: funnel.delivered },
    { key: "replied", name: "Replied", value: funnel.replied },
    { key: "meetings", name: "Meeting requests", value: funnel.meetings },
    { key: "opportunities", name: "Opportunities", value: funnel.opportunities },
    { key: "won", name: "Won", value: funnel.won },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <>
      {stages.map(({ key, name, value }) => {
        const records = details?.[key] ?? [];
        return (
          <div key={key}>
            <div className={styles.barRow}>
              <span>{name}</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(value / max) * 100}%` }} />
              </div>
              <span className={styles.barValue}>{value}</span>
            </div>
            {details && value > 0 && (
              <div style={{ paddingLeft: 160, marginBottom: 8 }}>
                <details className={styles.timeline}>
                  <summary>
                    Show records ({records.length}
                    {records.length < value ? ` of ${value}` : ""})
                  </summary>
                  <ol className={styles.timelineList}>
                    {records.map((r, i) => (
                      <li key={i}>
                        <strong>{r.primary}</strong> - {r.secondary}
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            )}
          </div>
        );
      })}
      <p className={styles.sectionNote}>
        Click a stage to see the newest records behind the number. Counts are current states, not history: a message that
        moved past SENT no longer counts as sent. Qualification does not gate contact discovery in this build, so no
        stage-to-stage percentages are shown.
      </p>
    </>
  );
}

// ---------- Pipeline ----------

function OpportunityCard({ card }: { card: PipelineCard }) {
  const contactLine = card.contactName
    ? card.contactName + (card.contactTitle ? " - " + card.contactTitle : "")
    : "No contact yet";

  return (
    <div className={styles.card}>
      <div className={styles.cardName}>{card.name}</div>
      <div className={styles.cardMeta}>{contactLine}</div>
      <div className={styles.cardMeta}>
        Email: {card.emailStatus ?? "n/a"} | Value: {card.estimatedValue === null ? "not set" : money(card.estimatedValue)}
        {card.owner ? ` | Owner: ${card.owner}` : ""}
      </div>
      <details className={styles.timeline}>
        <summary>Timeline ({card.events.length})</summary>
        <ol className={styles.timelineList}>
          {card.events.map((e, i) => (
            <li key={i}>
              {day(e.createdAt)}: {label(e.eventType)}
              {e.fromStage && e.toStage ? ` (${label(e.fromStage)} to ${label(e.toStage)})` : ""}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function PipelineSection({ cards }: { cards: PipelineCard[] }) {
  if (cards.length === 0) return <p className={styles.muted}>No opportunities yet.</p>;

  const known: string[] = [...PIPELINE_STAGES];
  const extra = [...new Set(cards.map((c) => c.stage))].filter((s) => !known.includes(s));
  const stageNames = [...known, ...extra];

  return (
    <div className={styles.scroll}>
      <div className={styles.columns}>
        {stageNames.map((stage) => {
          const inStage = cards.filter((c) => c.stage === stage);
          return (
            <div key={stage} className={styles.column}>
              <h3 className={styles.columnHead}>
                <span>{label(stage)}</span>
                <span>{inStage.length}</span>
              </h3>
              {inStage.length === 0 ? (
                <div className={styles.empty}>None</div>
              ) : (
                inStage.map((card) => <OpportunityCard key={card.id} card={card} />)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Tasks ----------

function TasksSection({ tasks }: { tasks: TaskRow[] }) {
  if (tasks.length === 0) return <p className={styles.muted}>No open tasks.</p>;

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Task</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Due</th>
            <th>Opportunity</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{t.title}</td>
              <td>{label(t.type)}</td>
              <td>{t.priority}</td>
              <td>{label(t.status)}</td>
              <td>
                {t.dueAt ? day(t.dueAt) : "no due date"}{" "}
                {t.overdue && <span className={`${styles.badge} ${styles.badgeBad}`}>overdue</span>}
              </td>
              <td>{t.opportunityName ?? "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Website prospects ----------

function ProspectsSection({ rows }: { rows: ProspectRow[] }) {
  if (rows.length === 0) {
    return <p className={styles.muted}>No website prospects yet. Run run-prospect-batch.ts to add some.</p>;
  }

  return (
    <>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Business</th>
              <th>Domain</th>
              <th>Score</th>
              <th>Contact signals found</th>
              <th>Gaps found</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.domain || r.name}>
                <td>{r.score === null ? "-" : i + 1}</td>
                <td>{r.name}</td>
                <td>{r.domain}</td>
                <td>
                  <span className={`${styles.badge} ${scoreClass(r.score)}`}>
                    {r.score === null ? "UNSCORED" : `${r.score}/100`}
                  </span>
                </td>
                <td>{r.contact}</td>
                <td>
                  {r.score === null
                    ? "fetch failed, blocked, or nothing parseable"
                    : r.gaps.length > 0
                      ? r.gaps.map(label).join(", ")
                      : "none"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.sectionNote}>
        A higher score means a bigger gap on the site, so a stronger prospect for a website service. Only signals that
        can be read from the scraped page are scored: there is no social, page-speed or mobile data. This scorer has not
        been validated against human labels yet, and it can only see sites that already have a domain.
      </p>
    </>
  );
}

// ---------- Costs and evaluation ----------

function CostsCard({ costs }: { costs: CostSummary | null }) {
  if (!costs) return <p className={styles.muted}>Costs failed to load.</p>;
  const e = costs.economics;

  return (
    <>
      <div className={styles.metricRow}><span>Total cost</span><span>{money(e.totalCost)}</span></div>
      <div className={styles.metricRow}><span>LLM calls logged</span><span>{costs.llmCalls}</span></div>
      <div className={styles.metricRow}><span>Per qualified lead</span><span>{money(e.costPerQualifiedLead)}</span></div>
      <div className={styles.metricRow}><span>Per meeting request</span><span>{money(e.costPerMeeting)}</span></div>
      <div className={styles.metricRow}><span>Per customer</span><span>{money(e.costPerCustomer)}</span></div>
      <p className={styles.sectionNote}>
        All $0 because everything runs on free tiers. n/a means there is nothing to divide by yet, not that it is free.
      </p>
    </>
  );
}

function EvaluationCard({ evaluation }: { evaluation: EvaluationSummary | null }) {
  if (!evaluation) return <p className={styles.muted}>Evaluation failed to load.</p>;
  const s = evaluation.scoring;

  return (
    <>
      <div className={styles.metricRow}><span>Lead scoring precision</span><span>{pct(s.precision)}</span></div>
      <div className={styles.metricRow}><span>Lead scoring recall</span><span>{pct(s.recall)}</span></div>
      <div className={styles.metricRow}><span>Lead scoring F1</span><span>{pct(s.f1)}</span></div>
      <div className={styles.metricRow}><span>Lead scoring accuracy</span><span>{pct(s.accuracy)}</span></div>
      <div className={styles.metricRow}>
        <span>Contact selection accuracy</span>
        <span>{pct(evaluation.contactAccuracy)}</span>
      </div>
      <div className={styles.metricRow}>
        <span>Regression suite</span>
        <span>{evaluation.regression.passed}/{evaluation.regression.total} passing</span>
      </div>
      <p className={styles.sectionNote}>
        Scoring is measured on {s.samples} labelled examples ({s.constructed} constructed); contact selection on{" "}
        {evaluation.contactCases} constructed cases. These show the evaluation mechanism works, not production accuracy.
      </p>
    </>
  );
}

// ---------- Page ----------

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string | string[] }>;
}) {
  const { key } = await searchParams;

  // Fails closed: with no DASHBOARD_KEY configured, nobody gets in.
  if (!process.env.DASHBOARD_KEY || key !== process.env.DASHBOARD_KEY) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Not authorized</h1>
      </main>
    );
  }

  const [data, funnelDetails] = await Promise.all([loadDashboardData(), loadFunnelDetails()]);
  const errors = funnelDetails.error ? [...data.errors, funnelDetails.error] : data.errors;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Lead Engine Dashboard</h1>
        <p className={styles.subtitle}>Loaded {data.loadedAt.slice(0, 16).replace("T", " ")} UTC</p>
      </header>

      <div className={styles.notice}>{DATA_NOTICE}</div>

      {errors.length > 0 && (
        <div className={styles.errorBox}>
          <strong>Some sections failed to load:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Funnel</h2>
        <FunnelSection funnel={data.funnel} details={funnelDetails.details} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sales pipeline</h2>
        <PipelineSection cards={data.pipeline} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Open tasks</h2>
        <TasksSection tasks={data.tasks} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Website prospects, ranked</h2>
        <ProspectsSection rows={data.prospects} />
      </section>

      <div className={styles.grid2}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Costs</h2>
          <CostsCard costs={data.costs} />
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Evaluation</h2>
          <EvaluationCard evaluation={data.evaluation} />
        </section>
      </div>

      <p className={styles.footer}>Contact email addresses are intentionally never shown on this page.</p>
    </main>
  );
}