import { supabase } from "../supabase";

export interface PipelineMetrics {
  pipelineValue: number;
  revenue: number;
  winRate: number | null;
  openCount: number;
  wonCount: number;
  lostCount: number;
}

export async function computePipelineMetrics(): Promise<PipelineMetrics> {
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("stage, estimated_value, actual_value");

  const rows = opportunities ?? [];

  const open = rows.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const won = rows.filter((o) => o.stage === "won");
  const lost = rows.filter((o) => o.stage === "lost");

  // Missing estimated_value shouldn't break the sum — treat it as 0,
  // but this is worth being honest about: it UNDERSTATES pipeline value
  // for opportunities that haven't had a value estimated yet, it doesn't
  // mean those opportunities are worth $0.
  const pipelineValue = open.reduce((sum, o) => sum + (o.estimated_value ?? 0), 0);
  const revenue = won.reduce((sum, o) => sum + (o.actual_value ?? o.estimated_value ?? 0), 0);

  const closedCount = won.length + lost.length;
  const winRate = closedCount > 0 ? won.length / closedCount : null; // null, not 0 — "no data yet" isn't "0% win rate"

  return {
    pipelineValue,
    revenue,
    winRate,
    openCount: open.length,
    wonCount: won.length,
    lostCount: lost.length,
  };
}