import Link from "next/link";
import styles from "@/app/crm/crm.module.css";
import { Flash } from "@/app/crm/flash";
import { moveStage } from "@/app/crm/actions";
import { requireUser } from "@/lib/auth";
import { loadBoard, type BoardCard, type OwnerFilter } from "@/lib/crm/load-pipeline";
import { STAGES, isStage, nextStages } from "@/lib/crm/opportunity-state-machine";
import { label, money } from "@/lib/crm/format";

const FILTERS: Array<{ key: OwnerFilter; text: string; href: string }> = [
  { key: "all", text: "All deals", href: "/crm/pipeline" },
  { key: "mine", text: "Mine", href: "/crm/pipeline?owner=mine" },
  { key: "unassigned", text: "Unassigned", href: "/crm/pipeline?owner=unassigned" },
];

function DealCard({ card, returnTo }: { card: BoardCard; returnTo: string }) {
  // Won and lost need extra details (a value, a reason), so they're handled
  // on the deal's own page. The board only offers the plain forward moves.
  const options = isStage(card.stage) ? nextStages(card.stage).filter((s) => s !== "won" && s !== "lost") : [];

  return (
    <div className={styles.boardCard}>
      <Link href={`/crm/opportunities/${card.id}`} className={styles.cardTitle}>
        {card.name}
      </Link>
      <div className={styles.cardMeta}>{card.companyName}</div>
      <div className={styles.cardMeta}>
        {card.contactName ? `${card.contactName}${card.contactTitle ? ` - ${card.contactTitle}` : ""}` : "No contact"}
      </div>
      <div className={styles.cardMeta}>
        Value: {money(card.estimatedValue)} | {card.ownerName ?? "Unassigned"}
      </div>

      {card.openTasks > 0 && (
        <div className={styles.formRow}>
          <span className={styles.badge}>
            {card.openTasks} open task{card.openTasks === 1 ? "" : "s"}
          </span>
          {card.overdueTasks > 0 && <span className={`${styles.badge} ${styles.badgeBad}`}>{card.overdueTasks} overdue</span>}
        </div>
      )}

      {options.length > 0 && (
        <form action={moveStage} className={styles.formRow}>
          <input type="hidden" name="opportunityId" value={card.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <select name="toStage" className={styles.select} defaultValue={options[0]}>
            {options.map((stage) => (
              <option key={stage} value={stage}>
                {label(stage)}
              </option>
            ))}
          </select>
          <button type="submit" className={`${styles.buttonSecondary} ${styles.buttonSmall}`}>
            Move
          </button>
        </form>
      )}
    </div>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { owner, ok, error } = await searchParams;

  const filter: OwnerFilter = owner === "mine" || owner === "unassigned" ? owner : "all";
  const cards = await loadBoard(filter, user.id);
  const returnTo = filter === "all" ? "/crm/pipeline" : `/crm/pipeline?owner=${filter}`;
  const openCount = cards.filter((c) => c.stage !== "won" && c.stage !== "lost").length;

  return (
    <>
      <h1 className={styles.pageTitle}>Pipeline</h1>
      <p className={styles.muted}>
        {openCount} open deal{openCount === 1 ? "" : "s"}, {cards.length} in total.
      </p>

      <Flash ok={ok} error={error} />

      <div className={styles.formRow} style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`${styles.badge} ${f.key === filter ? styles.badgeAccent : ""}`}
            style={{ textDecoration: "none" }}
          >
            {f.text}
          </Link>
        ))}
      </div>

      <div className={styles.boardScroll}>
        <div className={styles.board}>
          {STAGES.map((stage) => {
            const inStage = cards.filter((c) => c.stage === stage);
            return (
              <div key={stage} className={styles.boardColumn}>
                <h2 className={styles.boardColumnHead}>
                  <span>{label(stage)}</span>
                  <span>{inStage.length}</span>
                </h2>
                {inStage.length === 0 ? (
                  <div className={styles.muted}>None</div>
                ) : (
                  inStage.map((card) => <DealCard key={card.id} card={card} returnTo={returnTo} />)
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}