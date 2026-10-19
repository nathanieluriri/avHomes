/**
 * Styled .xlsx workbooks, a .csv and a .zip, written by hand.
 *
 * An .xlsx is a zip of a few XML files. Titles, wrapped headers, live totals,
 * frozen panes, filters, print setup and links need nothing a spreadsheet
 * library would add but weight. node:zlib does the compression.
 */
import { deflateRawSync } from "node:zlib";
import type { ExportCellKind } from "@avhomes/contracts";

export interface SheetColumn {
  label: string;
  kind: ExportCellKind | "link";
  /** Characters, as Excel measures a column. Sized to the content when left out. */
  width?: number;
  /** False keeps a column, such as a running balance, out of the total row. */
  sum?: boolean;
}

export interface SheetLink {
  link: string;
  text: string;
}

export type SheetCell = string | number | null | SheetLink;

/* ═════════════════════════════════════════════════════════════════════ ZIP ══ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(at: Date): { date: number; time: number } {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((Math.max(at.getFullYear(), 1980) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

export function zip(files: readonly { name: string; data: Uint8Array | string }[], at = new Date()): Buffer {
  const { date, time } = dosDateTime(at);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = typeof file.data === "string" ? Buffer.from(file.data, "utf8") : Buffer.from(file.data);
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/* ═════════════════════════════════════════════════════════════════════ CSV ══ */

/** RFC 4180, with a leading quote on anything a spreadsheet would run as a formula. */
function csvCell(value: SheetCell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return csvCell(value.link);
  const guarded = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(guarded) || guarded !== value ? `"${guarded.replace(/"/gu, '""')}"` : guarded;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Money as plain decimals and dates as YYYY-MM-DD, which every tool reads the same way. */
export function toCsv(columns: readonly SheetColumn[], rows: readonly SheetCell[][]): string {
  const lines = [columns.map((col) => csvCell(col.label)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((col, i) => {
          const value = row[i] ?? null;
          if (value === null) return "";
          if (col.kind === "date" && typeof value === "number") return isoDay(value);
          if (col.kind === "money" && typeof value === "number") return value.toFixed(2);
          return csvCell(value);
        })
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}


/* ════════════════════════════════════════════════════════════════════ XLSX ══ */

/** A table: optional title lines, one header row, the rows, and an optional total row. */
export interface TableSheet {
  name: string;
  /** Lines above the table. The first is the title. */
  title?: readonly string[];
  columns: readonly SheetColumn[];
  rows: readonly SheetCell[][];
  /** The label of a bold closing row that totals every money and count column with a live formula. */
  total?: string;
  /** Keeps the first column in view when a wide sheet is scrolled sideways. */
  freezeFirstColumn?: boolean;
}

/** One row of a statement laid out like a printed account. */
export interface StatementLine {
  style: "section" | "line" | "less" | "total" | "check" | "note" | "blank";
  label?: string;
  /** Minor units are the caller's business; this is the number shown. A `less` line is already negative. */
  amount?: number | null;
  note?: string;
  /** Names the line, so a total or a check can point at it. */
  key?: string;
  /** A total or a check: the lines it adds up, as a live formula. */
  sumOf?: readonly string[];
  /** A check: the line the sum should equal. Its cell shows the difference, which should be 0. */
  equals?: string;
}

export interface StatementSheet {
  name: string;
  statement: true;
  title: readonly string[];
  lines: readonly StatementLine[];
}

export type Sheet = TableSheet | StatementSheet;

function xml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    // Control characters other than tab and newlines are not allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "");
}

export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Days since 1899-12-30, Excel's epoch once its 1900 leap year bug is accounted for. */
function excelDate(ms: number): number {
  return ms / 86_400_000 + 25569;
}

/* Indexes into cellXfs below. */
const S = {
  body: 0,
  header: 1,
  headerNumber: 2,
  date: 3,
  money: 4,
  count: 5,
  link: 6,
  totalText: 7,
  totalMoney: 8,
  totalCount: 9,
  title: 10,
  subtitle: 11,
  section: 12,
  lineLabel: 13,
  lineMoney: 14,
  statementTotal: 15,
  statementTotalMoney: 16,
  note: 17,
  check: 18,
  checkMoney: 19,
} as const;

const WINE = "FF7A1F3D";
const RULE = "FFE4DCE3";
const QUIET = "FF6B6474";

/* Negative money in red brackets, which is how an accountant reads a deduction. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="d mmm yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00;[Red]\\(#,##0.00\\);0.00"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF5B1730"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="${QUIET}"/><name val="Calibri"/></font>
<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="${QUIET}"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${WINE}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4EEF2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${RULE}"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="${WINE}"/></top><bottom style="double"><color rgb="${WINE}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${WINE}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="20">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="right" vertical="center" wrapText="1" indent="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="165" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="3" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="bottom"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="165" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function moneyText(value: number): string {
  const text = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(${text})` : text;
}

/** How wide a value prints, which is what a column is sized to. */
function printedLength(value: SheetCell, kind: SheetColumn["kind"]): number {
  if (value === null) return 0;
  if (typeof value === "object") return value.text.length;
  if (typeof value === "number") {
    if (kind === "date") return 11;
    if (kind === "money") return moneyText(value).length;
    return value.toLocaleString("en-US").length;
  }
  return value.length;
}

/* A header may wrap onto two lines. A value never does, so the column fits the longest one. */
function columnWidth(column: SheetColumn, rows: readonly SheetCell[][], index: number, total: SheetCell | undefined): number {
  if (column.width) return column.width;
  let longest = printedLength(total ?? null, column.kind);
  for (const row of rows) longest = Math.max(longest, printedLength(row[index] ?? null, column.kind));
  const word = Math.max(...column.label.split(/\s+/u).map((part) => part.length));
  // Three characters over the longest value: the cell padding either side, and air between columns.
  return Math.min(60, Math.max(9, longest + 3, word + 3, Math.ceil(column.label.length / 2) + 3));
}

function headerLines(label: string, width: number): number {
  const room = Math.max(1, width - 1);
  let lines = 1;
  let used = 0;
  for (const word of label.split(/\s+/u)) {
    if (used > 0 && used + 1 + word.length > room) {
      lines += 1;
      used = word.length;
    } else {
      used += (used > 0 ? 1 : 0) + word.length;
    }
  }
  return Math.min(3, lines);
}

function inlineText(ref: string, style: number, text: string): string {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}

function formulaCell(ref: string, style: number, formula: string, cached: number): string {
  return `<c r="${ref}" s="${style}"><f>${xml(formula)}</f><v>${Number.isFinite(cached) ? cached : 0}</v></c>`;
}

/* A link is a HYPERLINK formula, which every spreadsheet follows and needs no relationship parts. */
function linkCell(ref: string, link: SheetLink): string {
  const quoted = (text: string) => `"${text.replace(/"/gu, '""')}"`;
  return `<c r="${ref}" s="${S.link}" t="str"><f>${xml(`HYPERLINK(${quoted(link.link)},${quoted(link.text)})`)}</f><v>${xml(link.text)}</v></c>`;
}

function bodyCell(ref: string, value: SheetCell, kind: SheetColumn["kind"]): string {
  if (value === null || value === "") return `<c r="${ref}" s="${S.body}"/>`;
  if (typeof value === "object") return linkCell(ref, value);
  if (typeof value === "number") {
    const style = kind === "date" ? S.date : kind === "money" ? S.money : kind === "count" ? S.count : S.body;
    return `<c r="${ref}" s="${style}"><v>${kind === "date" ? excelDate(value) : value}</v></c>`;
  }
  return inlineText(ref, S.body, value);
}

function titleRows(title: readonly string[], lastColumn: string): { rows: string; merges: string[]; height: number } {
  if (title.length === 0) return { rows: "", merges: [], height: 0 };
  const rows = title
    .map((line, i) => {
      const r = i + 1;
      const style = i === 0 ? S.title : S.subtitle;
      return `<row r="${r}" ht="${i === 0 ? 24 : 16}" customHeight="1">${inlineText(`A${r}`, style, line)}</row>`;
    })
    .join("");
  const merges = lastColumn === "A" ? [] : title.map((_, i) => `A${i + 1}:${lastColumn}${i + 1}`);
  // A blank row under the title block keeps the header from reading as part of it.
  return { rows, merges, height: title.length + 1 };
}

interface Built {
  xml: string;
  /** For the workbook's defined names. */
  filter: string | null;
  printTitles: string | null;
}

function pageSetup(landscape: boolean, sheetTitle: string): string {
  return [
    `<pageMargins left="0.5" right="0.5" top="0.7" bottom="0.7" header="0.3" footer="0.3"/>`,
    `<pageSetup paperSize="9" orientation="${landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>`,
    `<headerFooter><oddHeader>${xml(`&L&"Calibri,Bold"AV Homes&R${sheetTitle.replace(/&/gu, "&&")}`)}</oddHeader><oddFooter>${xml("&RPage &P of &N")}</oddFooter></headerFooter>`,
  ].join("");
}

function sheetHead(lastRef: string, pane: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="${WINE}"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastRef}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>`;
}

function buildTable(sheet: TableSheet, quotedName: string): Built {
  const { columns, rows } = sheet;
  const last = columnName(Math.max(columns.length - 1, 0));
  const top = titleRows(sheet.title ?? [], last);
  const headerRow = top.height + 1;
  const firstData = headerRow + 1;
  const lastData = headerRow + rows.length;
  const totalRow = sheet.total ? lastData + 1 : null;

  const totals: SheetCell[] = columns.map((column, i) => {
    if (i === 0) return sheet.total ?? null;
    if (column.sum === false || (column.kind !== "money" && column.kind !== "count")) return null;
    return rows.reduce((sum, row) => sum + (typeof row[i] === "number" ? (row[i] as number) : 0), 0);
  });
  const widths = columns.map((column, i) => columnWidth(column, rows, i, sheet.total ? totals[i] : undefined));
  const headerHeight = Math.max(...columns.map((column, i) => headerLines(column.label, widths[i]!)));

  const header = `<row r="${headerRow}" ht="${headerHeight * 15 + 6}" customHeight="1">${columns
    .map((column, i) => {
      const numeric = column.kind === "money" || column.kind === "count";
      return inlineText(`${columnName(i)}${headerRow}`, numeric ? S.headerNumber : S.header, column.label);
    })
    .join("")}</row>`;
  const body = rows
    .map((row, r) => {
      const at = firstData + r;
      return `<row r="${at}">${columns.map((column, i) => bodyCell(`${columnName(i)}${at}`, row[i] ?? null, column.kind)).join("")}</row>`;
    })
    .join("");
  const closing =
    totalRow === null
      ? ""
      : `<row r="${totalRow}" ht="20" customHeight="1">${columns
          .map((column, i) => {
            const ref = `${columnName(i)}${totalRow}`;
            const value = totals[i];
            if (typeof value === "number") {
              const range = `${columnName(i)}${firstData}:${columnName(i)}${Math.max(firstData, lastData)}`;
              // SUBTOTAL rather than SUM, so a filtered sheet totals what is showing.
              return formulaCell(ref, column.kind === "count" ? S.totalCount : S.totalMoney, `SUBTOTAL(9,${range})`, rows.length > 0 ? value : 0);
            }
            return typeof value === "string" ? inlineText(ref, S.totalText, value) : `<c r="${ref}" s="${S.totalText}"/>`;
          })
          .join("")}</row>`;

  const lastRow = totalRow ?? Math.max(headerRow, lastData);
  const x = sheet.freezeFirstColumn ? 1 : 0;
  const topLeft = `${columnName(x)}${headerRow + 1}`;
  const pane = `<pane${x ? ` xSplit="${x}"` : ""} ySplit="${headerRow}" topLeftCell="${topLeft}" activePane="${x ? "bottomRight" : "bottomLeft"}" state="frozen"/><selection pane="${x ? "bottomRight" : "bottomLeft"}" activeCell="${topLeft}" sqref="${topLeft}"/>`;
  const filter = rows.length > 0 ? `A${headerRow}:${last}${lastData}` : null;
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);

  const parts = [
    sheetHead(`${last}${lastRow}`, pane),
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`,
    `<sheetData>${top.rows}${header}${body}${closing}</sheetData>`,
    filter ? `<autoFilter ref="${filter}"/>` : "",
    top.merges.length > 0 ? `<mergeCells count="${top.merges.length}">${top.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "",
    pageSetup(totalWidth > 95, sheet.name),
    `</worksheet>`,
  ];
  return {
    xml: parts.join("\n"),
    filter: filter ? `${quotedName}!$A$${headerRow}:$${last}$${lastData}` : null,
    printTitles: `${quotedName}!$${headerRow}:$${headerRow}${sheet.freezeFirstColumn ? `,${quotedName}!$A:$A` : ""}`,
  };
}

function buildStatement(sheet: StatementSheet): Built {
  const top = titleRows(sheet.title, "C");
  const rowOf = new Map<string, number>();
  sheet.lines.forEach((line, i) => {
    if (line.key) rowOf.set(line.key, top.height + 1 + i);
  });
  const amountOf = new Map<string, number>();
  for (const line of sheet.lines) if (line.key && typeof line.amount === "number") amountOf.set(line.key, line.amount);
  const sumRefs = (keys: readonly string[]) => keys.map((key) => `B${rowOf.get(key) ?? 1}`).join(",");
  const sumValue = (keys: readonly string[]) => keys.reduce((total, key) => total + (amountOf.get(key) ?? 0), 0);

  const merges = [...top.merges];
  const body = sheet.lines
    .map((line, i) => {
      const r = top.height + 1 + i;
      const label = line.label ?? "";
      switch (line.style) {
        case "blank":
          return `<row r="${r}" ht="10" customHeight="1"/>`;
        case "section":
          return `<row r="${r}" ht="24" customHeight="1">${inlineText(`A${r}`, S.section, label)}<c r="B${r}" s="${S.section}"/><c r="C${r}" s="${S.section}"/></row>`;
        case "note":
          merges.push(`A${r}:C${r}`);
          return `<row r="${r}">${inlineText(`A${r}`, S.check, label)}</row>`;
        case "total": {
          const keys = line.sumOf ?? [];
          const amount = keys.length > 0
            ? formulaCell(`B${r}`, S.statementTotalMoney, `SUM(${sumRefs(keys)})`, line.amount ?? sumValue(keys))
            : `<c r="B${r}" s="${S.statementTotalMoney}"><v>${line.amount ?? 0}</v></c>`;
          return `<row r="${r}" ht="20" customHeight="1">${inlineText(`A${r}`, S.statementTotal, label)}${amount}${line.note ? inlineText(`C${r}`, S.statementTotal, line.note) : `<c r="C${r}" s="${S.statementTotal}"/>`}</row>`;
        }
        case "check": {
          const keys = line.sumOf ?? [];
          const target = line.equals ? `B${rowOf.get(line.equals) ?? 1}` : "0";
          const cached = (line.equals ? amountOf.get(line.equals) ?? 0 : 0) - sumValue(keys);
          return `<row r="${r}">${inlineText(`A${r}`, S.check, label)}${formulaCell(`B${r}`, S.checkMoney, `${target}-SUM(${sumRefs(keys)})`, cached)}${line.note ? inlineText(`C${r}`, S.check, line.note) : ""}</row>`;
        }
        default: {
          const amount = typeof line.amount === "number"
            ? `<c r="B${r}" s="${S.lineMoney}"><v>${line.amount}</v></c>`
            : `<c r="B${r}" s="${S.lineMoney}"/>`;
          return `<row r="${r}">${inlineText(`A${r}`, S.lineLabel, label)}${amount}${line.note ? inlineText(`C${r}`, S.note, line.note) : `<c r="C${r}" s="${S.note}"/>`}</row>`;
        }
      }
    })
    .join("");

  const lastRow = top.height + sheet.lines.length;
  const pane = `<selection activeCell="A1" sqref="A1"/>`;
  const parts = [
    sheetHead(`C${Math.max(1, lastRow)}`, pane),
    `<cols><col min="1" max="1" width="52" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="72" customWidth="1"/></cols>`,
    `<sheetData>${top.rows}${body}</sheetData>`,
    merges.length > 0 ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "",
    pageSetup(false, sheet.name),
    `</worksheet>`,
  ];
  return { xml: parts.join("\n"), filter: null, printTitles: null };
}

/** A workbook of one or more sheets, with document properties. */
export function workbook(sheets: readonly Sheet[], props: { title: string; at?: Date } = { title: "AV Homes" }): Buffer {
  const at = props.at ?? new Date();
  const names = sheets.map((sheet) => sheet.name.replace(/[\\/?*[\]:]/gu, " ").slice(0, 31));
  const quoted = names.map((name) => `'${name.replace(/'/gu, "''")}'`);
  const built = sheets.map((sheet, i) => ("statement" in sheet ? buildStatement(sheet) : buildTable(sheet, quoted[i]!)));
  const defined = built
    .flatMap((b, i) => [
      b.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(b.filter)}</definedName>` : "",
      b.printTitles ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xml(b.printTitles)}</definedName>` : "",
    ])
    .join("");
  const stamp = at.toISOString().replace(/\.\d{3}Z$/u, "Z");

  return zip(
    [
      {
        name: "[Content_Types].xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
      },
      {
        name: "_rels/.rels",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
      },
      {
        name: "docProps/core.xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(props.title)}</dc:title><dc:creator>AV Homes</dc:creator><cp:lastModifiedBy>AV Homes</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`,
      },
      {
        name: "docProps/app.xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AV Homes</Application></Properties>`,
      },
      {
        name: "xl/workbook.xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names
          .map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      },
      { name: "xl/styles.xml", data: STYLES },
      ...built.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: b.xml })),
    ],
    at,
  );
}

export function xlsx(sheetName: string, columns: readonly SheetColumn[], rows: readonly SheetCell[][]): Buffer {
  return workbook([{ name: sheetName, columns, rows }], { title: sheetName });
}
