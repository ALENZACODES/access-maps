export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): CsvTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const headerRow = rows.shift() ?? [];
  const headers = headerRow.map((header) => header.trim());
  const seen = new Set<string>();
  for (const header of headers) {
    if (header === "") throw new Error("CSV header contains an empty column name");
    if (seen.has(header)) throw new Error(`duplicate CSV header ${header}`);
    seen.add(header);
  }
  const records = rows
    .filter((cells) => cells.some((value) => value.trim() !== ""))
    .map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] ?? "";
      });
      return record;
    });
  return { headers, rows: records };
}

export function cell(row: Record<string, string>, key: string): string {
  return (row[key] ?? "").trim();
}
