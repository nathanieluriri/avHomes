/**
 * A styled .xlsx, a .csv and a .zip, written by hand.
 *
 * An .xlsx is a zip of a few XML files, and one sheet with a header style, a
 * frozen first row, an autofilter and three number formats needs nothing a
 * spreadsheet library would add but weight. node:zlib does the compression.
 */
import { deflateRawSync } from "node:zlib";
import type { ExportCellKind } from "@avhomes/contracts";

export interface SheetColumn {
  label: string;
  kind: ExportCellKind;
  /** Characters, as Excel measures a column. */
  width: number;
}

export type SheetCell = string | number | null;

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

/* Style indexes into cellXfs below. */
const STYLE = { body: 0, header: 1, date: 2, money: 3, count: 4 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="d mmm yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7A1F3D"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D2DC"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cell(ref: string, value: SheetCell, kind: ExportCellKind): string {
  if (value === null || value === "") return `<c r="${ref}" s="${STYLE.body}"/>`;
  if (typeof value === "number") {
    const style = kind === "date" ? STYLE.date : kind === "money" ? STYLE.money : kind === "count" ? STYLE.count : STYLE.body;
    const number = kind === "date" ? excelDate(value) : value;
    return `<c r="${ref}" s="${style}"><v>${number}</v></c>`;
  }
  return `<c r="${ref}" s="${STYLE.body}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

export function xlsx(sheetName: string, columns: readonly SheetColumn[], rows: readonly SheetCell[][]): Buffer {
  const last = columnName(Math.max(columns.length - 1, 0));
  const header = `<row r="1" ht="22" customHeight="1">${columns
    .map((col, i) => `<c r="${columnName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${xml(col.label)}</t></is></c>`)
    .join("")}</row>`;
  const body = rows
    .map((row, r) => `<row r="${r + 2}">${columns.map((col, i) => cell(`${columnName(i)}${r + 2}`, row[i] ?? null, col.kind)).join("")}</row>`)
    .join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${last}${rows.length + 1}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${columns.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`).join("")}</cols>
<sheetData>${header}${body}</sheetData>
<autoFilter ref="A1:${last}${rows.length + 1}"/>
</worksheet>`;

  const name = xml(sheetName.slice(0, 31));
  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/gu, "''")}'!$A$1:$${last}$${rows.length + 1}</definedName></definedNames></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}
