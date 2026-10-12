import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { requireUser } from "@/lib/auth";
import { loadDashboardData, type CostSummary, type EvaluationSummary } from "@/lib/dashboard/load-dashboard-data";
import { loadFunnelDetails, type FunnelDetails, type FunnelStageKey } from "@/lib/dashboard/load-funnel-details";
import type { FullFunnel } from "@/lib/analytics/funnel";
import type { ProspectTable } from "@/lib/crm/load-prospects";
import { label } from "@/lib/crm/format";

export const metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const DATA_NOTICE =
  "Demo data: contacts, emails and outreach in this database come from sandbox testing (a mock contact source and sandbox-only sending), not real prospects. Website prospect scores come from real public sites.";

const usd = (value: number | null): string => (value === null ? "n/a" : `$${value.toFixed(2)}`);
const pct = (value: number | null): string => (value === null ? "n/a" : `${Math.round(value * 100)}%`);

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
              <details style={{ marginBottom: 8 }}>
                <summary className={`${styles.muted} ${styles.clickable}`} style={{ marginLeft: 160 }}>
                  Show records ({records.length}
                  {records.length < value ? ` of ${value}` : ""})
                </summary>
                <ol className={styles.recordsList}>
                  {records.map((r, i) => (
                    <li key={i}>
                      <strong>{r.primary}</strong> - {r.secondary}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        );
      })}
      <p className={styles.muted}>
        Counts are current states, not history: a message that moved past SENT no longer counts as sent. Qualification does
        not gate contact discovery in this build, so no stage-to-stage percentages are shown.
      </p>
    </>
  );
}

function TopProspects({ prospects }: { prospects: ProspectTable | null }) {
  if (!prospects) return <p className={styles.muted}>Prospects failed to load.</p>;
  const top = prospects.scored.slice(0, 10);

  return (
    <>
      {top.length === 0 ? (
        <p className={styles.muted}>No scored prospects yet.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Business</th>
                <th>Website</th>
                <th>Score</th>
                <th>Gaps found</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>
                    <Link href={`/crm/companies/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.domain}</td>
                  <td>{p.score}/100</td>
                  <td>{p.gaps.length > 0 ? p.gaps.map(label).join(", ") : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.muted}>
        {prospects.scored.length} scored, {prospects.failed.length} couldn't be fetched, {prospects.waiting.length} waiting.{" "}
        <Link href="/crm/prospects">Open the prospects page</Link>
      </p>
    </>
  );
}

function CostsCard({ costs }: { costs: CostSummary | null }) {
  if (!costs) return <p className={styles.muted}>Costs failed to load.</p>;
  const e = costs.economics;

  return (
    <>
      <table className={styles.table}>
        <tbody>
          <tr><td>Total cost</td><td>{usd(e.totalCost)}</td></tr>
          <tr><td>LLM calls logged</td><td>{costs.llmCalls}</td></tr>
          <tr><td>Per qualified lead</td><td>{usd(e.costPerQualifiedLead)}</td></tr>
          <tr><td>Per meeting request</td><td>{usd(e.costPerMeeting)}</td></tr>
          <tr><td>Per customer</td><td>{usd(e.costPerCustomer)}</td></tr>
        </tbody>
      </table>
      <p className={styles.muted}>
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
      <table className={styles.table}>
        <tbody>
          <tr><td>Lead scoring precision</td><td>{pct(s.precision)}</td></tr>
          <tr><td>Lead scoring recall</td><td>{pct(s.recall)}</td></tr>
          <tr><td>Lead scoring F1</td><td>{pct(s.f1)}</td></tr>
          <tr><td>Lead scoring accuracy</td><td>{pct(s.accuracy)}</td></tr>
          <tr><td>Contact selection accuracy</td><td>{pct(evaluation.contactAccuracy)}</td></tr>
          <tr>
            <td>Regression suite</td>
            <td>
              {evaluation.regression.passed}/{evaluation.regression.total} passing
            </td>
          </tr>
        </tbody>
      </table>
      <p className={styles.muted}>
        Scoring is measured on {s.samples} labelled examples ({s.constructed} constructed); contact selection on{" "}
        {evaluation.contactCases} constructed cases. These show the evaluation mechanism works, not production accuracy.
      </p>
    </>
  );
}

export default async function DashboardPage() {
  await requireUser();

  const [data, funnelDetails] = await Promise.all([loadDashboardData(), loadFunnelDetails()]);
  const errors = funnelDetails.error ? [...data.errors, funnelDetails.error] : data.errors;

  return (
    <>
      <h1 className={styles.pageTitle}>Dashboard</h1>
      <p className={styles.muted}>Loaded {data.loadedAt.slice(0, 16).replace("T", " ")} UTC</p>

      <div className={styles.notice}>{DATA_NOTICE}</div>

      {errors.length > 0 && (
        <div className={styles.errorBanner}>
          <strong>Some sections failed to load:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Funnel</h2>
        <FunnelSection funnel={data.funnel} details={funnelDetails.details} />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Top website prospects</h2>
        <TopProspects prospects={data.prospects} />
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Costs</h2>
          <CostsCard costs={data.costs} />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Evaluation</h2>
          <EvaluationCard evaluation={data.evaluation} />
        </section>
      </div>

      <p className={styles.muted}>Contact email addresses are never shown on this page.</p>
    </>
  );
}