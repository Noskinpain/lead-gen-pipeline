import { supabase } from "../supabase";

export interface TaskMetrics {
  avgResponseTimeHours: number | null;
  overdueTasks: Array<{ id: string; title: string; dueAt: string; hoursOverdue: number }>;
}

export async function computeTaskMetrics(): Promise<TaskMetrics> {
  const { data: completed } = await supabase
    .from("tasks")
    .select("created_at, completed_at")
    .not("completed_at", "is", null);

  const responseTimes = (completed ?? [])
    .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60))
    .filter((hours) => hours >= 0); // guard against any clock-skew weirdness producing negative durations

  const avgResponseTimeHours =
    responseTimes.length > 0 ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10 : null;

  const { data: overdue } = await supabase
    .from("tasks")
    .select("id, title, due_at")
    .eq("status", "pending")
    .lt("due_at", new Date().toISOString())
    .not("due_at", "is", null);

  const overdueTasks = (overdue ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    dueAt: t.due_at!,
    hoursOverdue: Math.round((Date.now() - new Date(t.due_at!).getTime()) / (1000 * 60 * 60)),
  }));

  return { avgResponseTimeHours, overdueTasks };
}