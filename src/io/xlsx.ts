import { spawnSync } from "node:child_process";

/**
 * Reads the first worksheet of an .xlsx workbook as rows of strings, using the system
 * `unzip` (as src/io/zip.ts does) and a small parser for the SpreadsheetML cell format.
 * Shared strings, inline strings, plain values and booleans are read; formulas keep
 * their cached value. Styles and dates are not interpreted: a date cell stays the serial
 * number the file stores.
 */
export interface XlsxTable {
  headers: string[];
  rows: Record<string, string>[];
}

function unzipText(file: string, entry: string): string | null {
  const result = spawnSync("unzip", ["-p", file, entry], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) return null;
  return result.stdout;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? "";
  });
}

function textOf(fragment: string): string {
  let out = "";
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += decodeXml(match[1] ?? "");
  return out;
}

export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** The worksheet path of the first sheet listed in the workbook. */
function firstSheetPath(file: string): string {
  const workbook = unzipText(file, "xl/workbook.xml");
  const rels = unzipText(file, "xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return "xl/worksheets/sheet1.xml";
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (!rid) return "xl/worksheets/sheet1.xml";
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? "";
    if (new RegExp(`\\bId="${rid}"`).test(attributes)) {
      const target = /\bTarget="([^"]+)"/.exec(attributes)?.[1];
      if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    }
  }
  return "xl/worksheets/sheet1.xml";
}

export function parseSheetXml(sheet: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? "n";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "b") value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
      else value = raw === undefined ? "" : decodeXml(raw);
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Reads the first worksheet. The first non-empty row is the header row. */
export function readXlsx(file: string): XlsxTable {
  const sharedXml = unzipText(file, "xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1] ?? "")) : [];
  const sheetPath = firstSheetPath(file);
  const sheet = unzipText(file, sheetPath);
  if (sheet === null) throw new Error(`unable to read ${sheetPath} from ${file}`);
  const grid = parseSheetXml(sheet, shared).filter((row) => row.some((cell) => cell.trim() !== ""));
  const headerRow = grid.shift();
  if (!headerRow) throw new Error(`${file} has no header row`);
  // A repeated header gets " (2)", " (3)" and so on, so no column is overwritten.
  const counts = new Map<string, number>();
  const headers = headerRow.map((header) => {
    const name = header.trim();
    const seen = (counts.get(name) ?? 0) + 1;
    counts.set(name, seen);
    return seen === 1 || name === "" ? name : `${name} (${seen})`;
  });
  const rows = grid.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (header !== "") row[header] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}
