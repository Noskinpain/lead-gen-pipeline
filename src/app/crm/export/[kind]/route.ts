import { getAuthState } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toCsv, type CsvColumn } from "@/lib/crm/csv";
import { fetchAll } from "@/lib/crm/fetch-all";
import { loadProspectTable } from "@/lib/crm/load-prospects";
import { personLabel } from "@/lib/crm/format";

type Row = Record<string, unknown>;

interface ExportSpec {
  columns: CsvColumn[];
  load: () => Promise<Row[]>;
}

const col = (key: string, header = key): CsvColumn => ({ key, header });

async function companyNames(): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; company_name: string }>(
    (from, to) => supabase.from("companies").select("id, company_name").order("id").range(from, to),
    "companies"
  );
  return new Map(rows.map((r): [string, string] => [r.id, r.company_name]));
}

async function contactNames(): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; first_name: string; last_name: string }>(
    (from, to) => supabase.from("contacts").select("id, first_name, last_name").order("id").range(from, to),
    "contacts"
  );
  return new Map(rows.map((r): [string, string] => [r.id, `${r.first_name} ${r.last_name}`]));
}

async function peopleNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("profiles").select("id, email, full_name").eq("approved", true);
  if (error) throw new Error(`profiles: ${error.message}`);
  return new Map((data ?? []).map((p): [string, string] => [p.id, personLabel(p)]));
}

const EXPORTS: Record<string, ExportSpec> = {
  companies: {
    columns: [
      col("id"),
      col("company_name", "name"),
      col("website"),
      col("domain"),
      col("industry"),
      col("location"),
      col("employee_count", "employees"),
      col("source"),
      col("status"),
      col("created_at"),
    ],
    load: () =>
      fetchAll<Row>(
        (from, to) =>
          supabase
            .from("companies")
            .select("id, company_name, website, domain, industry, location, employee_count, source, status, created_at")
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        "companies"
      ),
  },

  contacts: {
    columns: [
      col("id"),
      col("company"),
      col("first_name"),
      col("last_name"),
      col("job_title"),
      col("department"),
      col("seniority"),
      col("email"),
      col("email_status"),
      col("do_not_contact"),
      col("contact_source"),
      col("created_at"),
    ],
    load: async () => {
      const [rows, companies] = await Promise.all([
        fetchAll<Row>(
          (from, to) =>
            supabase
              .from("contacts")
              .select(
                "id, company_id, first_name, last_name, job_title, department, seniority, email, email_status, do_not_contact, contact_source, created_at"
              )
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
          "contacts"
        ),
        companyNames(),
      ]);
      return rows.map((r) => ({ ...r, company: companies.get(String(r.company_id)) ?? "" }));
    },
  },

  deals: {
    columns: [
      col("id"),
      col("name"),
      col("stage"),
      col("company"),
      col("contact"),
      col("owner"),
      col("estimated_value"),
      col("actual_value"),
      col("probability"),
      col("lost_reason"),
      col("created_at"),
      col("closed_at"),
    ],
    load: async () => {
      const [rows, companies, contacts, people] = await Promise.all([
        fetchAll<Row>(
          (from, to) =>
            supabase
              .from("opportunities")
              .select(
                "id, name, stage, company_id, contact_id, owner_id, estimated_value, actual_value, probability, lost_reason, created_at, closed_at"
              )
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
          "deals"
        ),
        companyNames(),
        contactNames(),
        peopleNames(),
      ]);
      return rows.map((r) => ({
        ...r,
        company: companies.get(String(r.company_id)) ?? "",
        contact: contacts.get(String(r.contact_id)) ?? "",
        owner: people.get(String(r.owner_id)) ?? "",
      }));
    },
  },

  tasks: {
    columns: [
      col("id"),
      col("title"),
      col("type"),
      col("priority"),
      col("status"),
      col("due_at"),
      col("assigned_to"),
      col("deal"),
      col("company"),
      col("created_at"),
      col("completed_at"),
    ],
    load: async () => {
      const [rows, companies, deals, people] = await Promise.all([
        fetchAll<Row>(
          (from, to) =>
            supabase
              .from("tasks")
              .select("id, title, type, priority, status, due_at, assigned_to_id, opportunity_id, company_id, created_at, completed_at")
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
          "tasks"
        ),
        companyNames(),
        fetchAll<{ id: string; name: string }>(
          (from, to) => supabase.from("opportunities").select("id, name").order("id").range(from, to),
          "deals"
        ),
        peopleNames(),
      ]);
      const dealNames = new Map(deals.map((d): [string, string] => [d.id, d.name]));
      return rows.map((r) => ({
        ...r,
        assigned_to: people.get(String(r.assigned_to_id)) ?? "",
        deal: dealNames.get(String(r.opportunity_id)) ?? "",
        company: companies.get(String(r.company_id)) ?? "",
      }));
    },
  },

  prospects: {
    columns: [
      col("status"),
      col("rank"),
      col("name"),
      col("domain"),
      col("score"),
      col("gaps"),
      col("contact_signals"),
      col("source"),
      col("last_checked"),
    ],
    load: async () => {
      const table = await loadProspectTable();
      return [
        ...table.scored.map((p, i) => ({
          status: "scored",
          rank: i + 1,
          name: p.name,
          domain: p.domain,
          score: p.score,
          gaps: p.gaps.join("; "),
          contact_signals: p.contact,
          source: p.source,
          last_checked: p.enrichedAt,
        })),
        ...table.failed.map((p) => ({
          status: "could not fetch",
          name: p.name,
          domain: p.domain,
          source: p.source,
          last_checked: p.attemptedAt,
        })),
        ...table.waiting.map((p) => ({
          status: "waiting",
          name: p.name,
          domain: p.domain,
          source: p.source,
        })),
      ];
    },
  },
};

export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  const state = await getAuthState();
  if (state.status !== "ok") return new Response("Not authorized", { status: 401 });

  const { kind } = await context.params;
  const spec = Object.prototype.hasOwnProperty.call(EXPORTS, kind) ? EXPORTS[kind] : undefined;
  if (!spec) return new Response("Unknown export", { status: 404 });

  try {
    const rows = await spec.load();
    logger.info("CSV export", { kind, rows: rows.length, userId: state.user.id });

    // The byte order mark makes Excel read the file as UTF-8.
    const body = "\uFEFF" + toCsv(spec.columns, rows);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("CSV export failed", { kind, error: err instanceof Error ? err.message : "unknown" });
    return new Response("Export failed", { status: 500 });
  }
}