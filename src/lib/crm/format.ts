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
  switch (eventType) {
    case "stage_changed": {
      const reason = typeof metadata?.lost_reason === "string" ? `. Reason: ${metadata.lost_reason}` : "";
      return `Moved from ${fromStage ? label(fromStage) : "?"} to ${toStage ? label(toStage) : "?"}${reason}`;
    }
    case "opportunity_updated": {
      const changes = metadata?.changes;
      const fields = changes && typeof changes === "object" ? Object.keys(changes).map(label).join(", ") : "details";
      return `Updated ${fields}`;
    }
    case "note_added":
      return "Added a note";
    case "task_created":
      return `Created task "${String(metadata?.title ?? "")}"`;
    case "task_status_changed":
      return `Task "${String(metadata?.title ?? "")}" marked ${label(String(metadata?.to ?? ""))}`;
    default: {
      const stagePart = fromStage && toStage ? ` (${label(fromStage)} to ${label(toStage)})` : "";
      return `${label(eventType)}${stagePart}`;
    }
  }
}