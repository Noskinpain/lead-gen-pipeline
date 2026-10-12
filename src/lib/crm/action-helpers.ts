import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { logger } from "../logger";
import { goWithMessage } from "./form-helpers";

export type Outcome = { ok: true; message: string } | { ok: false; error: string };

// Redirects to `destination` with a success or error banner. Never returns.
export function finish(destination: string, outcome: Outcome): never {
  if (outcome.ok) {
    revalidatePath("/crm", "layout");
    goWithMessage(destination, "ok", outcome.message);
  }
  goWithMessage(destination, "error", outcome.error);
}

export async function isApprovedPerson(id: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("id").eq("id", id).eq("approved", true).maybeSingle();
  return Boolean(data);
}

export async function logEvent(
  opportunityId: string,
  actorId: string,
  eventType: string,
  extra: { fromStage?: string; toStage?: string; metadata?: Record<string, unknown> } = {}
) {
  const { error } = await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId,
    event_type: eventType,
    from_stage: extra.fromStage ?? null,
    to_stage: extra.toStage ?? null,
    metadata: extra.metadata ?? null,
    actor_id: actorId,
  });
  if (error) logger.error("Timeline event failed to save", { opportunityId, eventType, error: error.message });
}