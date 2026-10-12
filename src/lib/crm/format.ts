export function label(value: string): string {
  return value.replace(/_/g, " ");
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not set";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function isOverdue(dueAt: string | null, status: string): boolean {
  return dueAt !== null && (status === "pending" || status === "in_progress") && new Date(dueAt).getTime() < Date.now();
}

export function personLabel(person: { full_name: string | null; email: string }): string {
  return person.full_name?.trim() || person.email;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function describeEvent(
  eventType: string,
  fromStage: string | null,
  toStage: string | null,
  metadata: Record<string, unknown> | null
): string {
  const meta = metadata ?? {};
  const stagePart = fromStage && toStage ? ` (${label(fromStage)} to ${label(toStage)})` : "";

  switch (eventType) {
    case "stage_changed": {
      const reason = typeof meta.lost_reason === "string" ? `. Reason: ${meta.lost_reason}` : "";
      return `Moved from ${fromStage ? label(fromStage) : "?"} to ${toStage ? label(toStage) : "?"}${reason}`;
    }
    case "opportunity_created":
      return "Deal created";
    case "opportunity_updated": {
      const changes = meta.changes;
      const fields = changes && typeof changes === "object" ? Object.keys(changes).map(label).join(", ") : "details";
      return `Updated ${fields}`;
    }
    case "note_added":
      return "Added a note";
    case "task_created":
      return `Created task "${String(meta.title ?? "")}"`;
    case "task_status_changed":
      return `Task "${String(meta.title ?? "")}" marked ${label(String(meta.to ?? ""))}`;
    case "reply_logged": {
      const intent = typeof meta.intent === "string" ? label(meta.intent) : "not classified";
      const confidence = typeof meta.confidence === "number" ? ` (${Math.round(meta.confidence * 100)}% confidence)` : "";
      return `Logged a reply: ${intent}${confidence}`;
    }
    case "reply_classified": {
      const intent = typeof meta.intent === "string" ? label(meta.intent) : "unknown";
      return `Reply classified as ${intent}${stagePart}`;
    }
    case "do_not_contact_changed": {
      const reason = typeof meta.reason === "string" && meta.reason ? `. ${meta.reason}` : "";
      return meta.flag === true ? `Marked the contact do not contact${reason}` : `Cleared do not contact${reason}`;
    }
    default:
      return `${label(eventType)}${stagePart}`;
  }
}