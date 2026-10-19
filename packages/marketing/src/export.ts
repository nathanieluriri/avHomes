/**
 * Every partner as one row, for the console's Export button.
 *
 * Commission figures are the same sums `balanceFor` makes per partner (earned,
 * scheduled and paid lines, voids left out), done in one pass so a few thousand
 * partners is three queries rather than three per partner.
 */
import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import {
  MARKETER_EXPORT_FIELD_INFO,
  type MarketerExportField,
} from "@avhomes/contracts";
import type { DealDoc, LedgerDoc, MarketerDoc } from "./schema";
import { toCsv, xlsx, zip, type SheetCell, type SheetColumn } from "./spreadsheet";

export type ExportRow = Record<MarketerExportField, SheetCell>;

/* The console's wording, which says "Banned" where the partner's own screen says "Closed". */
const STATUS_LABEL: Record<MarketerDoc["status"], string> = { active: "Active", paused: "Paused", banned: "Banned" };

/** The last four digits, so a row can be matched to a bank statement without holding the account. */
export function maskAccount(number: string): string {
  const digits = number.trim();
  if (digits.length <= 4) return digits;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** Everyone under each partner, three levels deep, which is as deep as commission reaches. */
export function teamSizes(people: readonly { id: string; parentId: string | null }[]): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const person of people) {
    if (!person.parentId) continue;
    const list = children.get(person.parentId) ?? [];
    list.push(person.id);
    children.set(person.parentId, list);
  }
  const sizes = new Map<string, number>();
  for (const person of people) {
    let total = 0;
    for (const l1 of children.get(person.id) ?? []) {
      total += 1;
      for (const l2 of children.get(l1) ?? []) {
        total += 1 + (children.get(l2)?.length ?? 0);
      }
    }
    sizes.set(person.id, total);
  }
  return sizes;
}

export async function marketerExportRows(db: Db, options: { fullAccountNumbers: boolean }): Promise<ExportRow[]> {
  const [people, dealSums, ledgerSums] = await Promise.all([
    collection<MarketerDoc>(db, COLLECTIONS.marketers).find({}).sort({ seq: 1, createdAt: 1 }).toArray(),
    collection<DealDoc>(db, COLLECTIONS.marketingDeals)
      .aggregate<{ _id: string; deals: number; valueMinor: number }>([
        /* Credited to the CLOSER, like the league: a sale an admin typed in belongs to the partner who made it. */
        { $match: { status: "approved", closerKind: { $in: ["marketer", null] } } },
        { $group: { _id: { $ifNull: ["$closerId", "$reporterId"] }, deals: { $sum: 1 }, valueMinor: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
    collection<LedgerDoc>(db, COLLECTIONS.marketingLedger)
      .aggregate<{ _id: { marketerId: string; status: string }; total: number }>([
        { $match: { status: { $ne: "void" } } },
        { $group: { _id: { marketerId: "$marketerId", status: "$status" }, total: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
  ]);

  const byId = new Map(people.map((doc) => [doc._id, doc]));
  const sizes = teamSizes(people.map((doc) => ({ id: doc._id, parentId: doc.parentId })));
  const invites = new Map<string, number>();
  for (const doc of people) if (doc.parentId) invites.set(doc.parentId, (invites.get(doc.parentId) ?? 0) + 1);
  const dealsBy = new Map(dealSums.map((row) => [row._id, row]));
  const money = new Map<string, { earned: number; scheduled: number; paid: number }>();
  for (const row of ledgerSums) {
    const found = money.get(row._id.marketerId) ?? { earned: 0, scheduled: 0, paid: 0 };
    if (row._id.status === "earned") found.earned += row.total;
    if (row._id.status === "scheduled") found.scheduled += row.total;
    if (row._id.status === "paid") found.paid += row.total;
    money.set(row._id.marketerId, found);
  }
  const major = (minor: number) => Math.round(minor) / 100;

  return people.map((doc) => {
    const parent = doc.parentId ? byId.get(doc.parentId) : undefined;
    const sums = money.get(doc._id) ?? { earned: 0, scheduled: 0, paid: 0 };
    const sold = dealsBy.get(doc._id);
    const account = doc.bank?.accountNumber ?? "";
    return {
      code: doc.code,
      name: doc.displayName,
      email: doc.email,
      phone: doc.phone,
      state: doc.state,
      status: STATUS_LABEL[doc.status] ?? doc.status,
      joined: doc.joinedAt ?? doc.createdAt,
      uplineName: parent?.displayName ?? "",
      uplineCode: parent?.code ?? "",
      teamSize: sizes.get(doc._id) ?? 0,
      directInvites: invites.get(doc._id) ?? 0,
      dealsApproved: sold?.deals ?? 0,
      salesValue: major(sold?.valueMinor ?? 0),
      commissionEarned: major(sums.earned + sums.scheduled + sums.paid),
      commissionPaid: major(sums.paid),
      commissionOwed: major(sums.earned + sums.scheduled),
      bankName: doc.bank?.bankName ?? "",
      accountName: doc.bank?.accountName ?? "",
      accountNumber: options.fullAccountNumbers ? account : maskAccount(account),
    };
  });
}

export function exportColumns(fields: readonly MarketerExportField[], currency: string): SheetColumn[] {
  return fields.map((field) => {
    const info = MARKETER_EXPORT_FIELD_INFO[field];
    return {
      label: info.kind === "money" ? `${info.label} (${currency})` : info.label,
      kind: info.kind,
    };
  });
}

/** The zip the button downloads: the styled workbook and the same rows as CSV. */
export function exportZip(
  fields: readonly MarketerExportField[],
  rows: readonly ExportRow[],
  currency: string,
  stamp: string,
): Buffer {
  const columns = exportColumns(fields, currency);
  const cells = rows.map((row) => fields.map((field) => row[field]));
  return zip([
    { name: `av-partners-${stamp}.xlsx`, data: xlsx("Partners", columns, cells) },
    { name: `av-partners-${stamp}.csv`, data: toCsv(columns, cells) },
  ]);
}
