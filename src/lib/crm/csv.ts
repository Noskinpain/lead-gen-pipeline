// Reads and writes CSV by hand, so there's no extra package to install.

const DELIMITERS = [",", ";", "\t"];

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

// Excel in some regions saves CSV with semicolons, and some tools use tabs.
function detectDelimiter(firstLine: string): string {
  let best = ",";
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    const count = countOutsideQuotes(firstLine, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

// Returns every non-empty row, including the header row.
export function parseCsv(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      // A quote only opens a quoted field at the very start of the field.
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// Spreadsheets treat a cell starting with = + - or @ as a formula. A company
// named "=HYPERLINK(...)" could run when someone opens an export, so text
// cells starting with those characters get a leading apostrophe. Numbers are
// left alone so negative values stay numbers.
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else {
    text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface CsvColumn {
  key: string;
  header: string;
}

export function toCsv(columns: CsvColumn[], rows: Array<Record<string, unknown>>): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}