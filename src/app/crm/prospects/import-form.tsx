"use client";

import { useActionState } from "react";
import styles from "@/app/crm/crm.module.css";
import { importCompaniesCsv } from "@/app/crm/prospect-actions";
import type { ImportState } from "@/lib/crm/import-types";

const initialState: ImportState = { status: "idle" };

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importCompaniesCsv, initialState);

  return (
    <>
      <form action={formAction}>
        <div className={styles.formGrid}>
          <label className={styles.label}>
            CSV file
            <input type="file" name="file" accept=".csv,text/csv" required className={styles.input} />
          </label>
          <label className={styles.label}>
            Label for this batch
            <input name="source" placeholder="csv_import" maxLength={40} className={styles.input} />
          </label>
        </div>
        <button type="submit" disabled={pending} className={styles.buttonPrimary}>
          {pending ? "Importing..." : "Import companies"}
        </button>
      </form>

      {state.status === "error" && (
        <div className={styles.errorBanner} style={{ marginTop: 14 }}>
          {state.message}
        </div>
      )}

      {state.status === "done" && (
        <div style={{ marginTop: 14 }}>
          <div className={state.inserted > 0 ? styles.okBanner : styles.notice}>
            Imported {state.inserted} as "{state.source}". Skipped {state.duplicates} duplicate
            {state.duplicates === 1 ? "" : "s"}, {state.invalid} invalid row{state.invalid === 1 ? "" : "s"}
            {state.failed > 0 ? `, ${state.failed} that couldn't be saved` : ""}.
          </div>

          {state.problems.length > 0 && (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Company</th>
                    <th>Not imported because</th>
                  </tr>
                </thead>
                <tbody>
                  {state.problems.map((p) => (
                    <tr key={`${p.row}-${p.reason}`}>
                      <td>{p.row}</td>
                      <td>{p.name}</td>
                      <td>{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.truncated && <p className={styles.muted}>Showing the first {state.problems.length} problems.</p>}
            </div>
          )}
        </div>
      )}
    </>
  );
}