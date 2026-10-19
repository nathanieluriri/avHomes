/*
 * The partner leaderboard, analytics and upline card.
 *
 * The pure parts always run. The database parts need MONGODB_URI (a throwaway
 * server; each run uses its own database and drops it) or they are skipped.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import {
  normalizeLeaderboardSettings,
  rankBoard,
  resolveBoardPeriod,
  type Marketer,
} from "@avhomes/contracts";
import { insightsFor, leaderboardFor, monthsBack, uplineFor } from "./insights";
import { toMarketer, type MarketerDoc } from "./schema";
import { writeMarketingSettings } from "./settings";

const NOW = Date.UTC(2026, 9, 19, 12);

describe("leaderboard rules", () => {
  test("calendar windows resolve to whole months, quarters and years", () => {
    assert.deepEqual(resolveBoardPeriod("month", NOW), {
      key: "month",
      label: "This month",
      from: Date.UTC(2026, 9, 1),
      to: Date.UTC(2026, 10, 1),
    });
    const last = resolveBoardPeriod("last-month", NOW);
    assert.equal(last.from, Date.UTC(2026, 8, 1));
    assert.equal(last.to, Date.UTC(2026, 9, 1));
    const jan = resolveBoardPeriod("last-month", Date.UTC(2026, 0, 5));
    assert.equal(jan.from, Date.UTC(2025, 11, 1));
    const quarter = resolveBoardPeriod("quarter", NOW);
    assert.equal(quarter.from, Date.UTC(2026, 9, 1));
    assert.equal(quarter.to, Date.UTC(2027, 0, 1));
    assert.equal(resolveBoardPeriod("year", NOW).from, Date.UTC(2026, 0, 1));
  });

  test("ties share a rank and the order is stable", () => {
    const ranked = rankBoard([
      { name: "Bayo", value: 10, deals: 1 },
      { name: "Ada", value: 10, deals: 1 },
      { name: "Chidi", value: 30, deals: 2 },
      { name: "Dayo", value: 5, deals: 3 },
    ]);
    assert.deepEqual(
      ranked.map((row) => [row.name, row.rank]),
      [
        ["Chidi", 1],
        ["Ada", 2],
        ["Bayo", 2],
        ["Dayo", 4],
      ],
    );
  });

  test("settings drop unknown values, never leave a list empty, and keep commission off by default", () => {
    const d = normalizeLeaderboardSettings(undefined);
    assert.equal(d.metrics.includes("commission"), false);
    const s = normalizeLeaderboardSettings({ metrics: ["bogus"], periods: ["year"], defaultPeriod: "month", defaultMetric: "value" });
    assert.deepEqual(s.metrics, d.metrics);
    assert.deepEqual(s.periods, ["year"]);
    assert.equal(s.defaultPeriod, "year", "a default that is turned off falls to the first allowed");
    assert.equal(s.defaultMetric, "value");
  });

  test("months back runs oldest first and crosses the year", () => {
    const months = monthsBack(12, NOW);
    assert.equal(months.length, 12);
    assert.equal(months[0]!.month, "2025-11");
    assert.equal(months[11]!.month, "2026-10");
  });
});

const uri = process.env.MONGODB_URI;
let client: MongoClient;
let db: Db;
let seq = 0;

async function addPartner(name: string, extra: Partial<MarketerDoc> = {}): Promise<Marketer> {
  seq += 1;
  const doc: MarketerDoc = {
    _id: `mkt_${seq}`,
    userId: `usr_${seq}`,
    code: `AV-${String(seq).padStart(4, "0")}`,
    seq,
    displayName: name,
    email: `${name.toLowerCase().replace(/\s+/gu, ".")}@test.local`,
    phone: "+2348000000000",
    state: "Lagos",
    status: "active",
    statusReason: "",
    statusAt: null,
    parentId: null,
    upline: [],
    bank: null,
    isAdmin: false,
    joinedAt: NOW - 86_400_000,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW,
    ...extra,
  };
  await db.collection("marketers").insertOne(doc as never);
  return toMarketer(doc);
}

async function addDeal(closer: Marketer, amountMinor: number, extra: Record<string, unknown> = {}) {
  seq += 1;
  await db.collection("marketing_deals").insertOne({
    _id: `deal_${seq}`,
    status: "approved",
    closerKind: "marketer",
    closerId: closer.id,
    reporterId: closer.id,
    amountMinor,
    closedOn: NOW - 3_600_000,
    createdAt: NOW - 3_600_000,
    ...extra,
  } as never);
}

describe("leaderboard, insights and upline", { skip: uri ? false : "set MONGODB_URI to run" }, () => {
  before(async () => {
    client = await MongoClient.connect(uri!);
  });
  after(async () => {
    await client?.close();
  });
  beforeEach(async () => {
    db = client.db(`avhomes_test_board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  });

  test("ranks closers by value, keeps the reader's own row, and hides metrics an admin turned off", async () => {
    const root = await addPartner("Founder");
    const ada = await addPartner("Ada Obi", { parentId: root.id });
    const bayo = await addPartner("Bayo Ade", { parentId: root.id, state: "Abuja" });
    const quiet = await addPartner("Quiet One", { parentId: ada.id });
    await addDeal(ada, 500_000);
    await addDeal(bayo, 900_000);
    await addDeal(bayo, 100_000, { closedOn: Date.UTC(2026, 8, 3) });

    const board = await leaderboardFor(db, quiet, { metric: "value", period: "month" }, NOW);
    assert.deepEqual(board.rows.map((row) => [row.name, row.value]), [
      ["Bayo Ade", 900_000],
      ["Ada Obi", 500_000],
    ]);
    assert.equal(board.me?.rank, 0, "nothing closed, so not ranked");
    assert.equal(board.me?.name, "Quiet One");

    const blocked = await leaderboardFor(db, quiet, { metric: "commission" }, NOW);
    assert.equal(blocked.metric, "deals", "commission is off by default");

    const abuja = await leaderboardFor(db, bayo, { metric: "deals", state: "abuja" }, NOW);
    assert.deepEqual(abuja.rows.map((row) => row.name), ["Bayo Ade"]);

    const team = await leaderboardFor(db, ada, { metric: "value", scope: "team" }, NOW);
    assert.deepEqual(team.rows.map((row) => row.name), ["Ada Obi"]);

    await writeMarketingSettings(db, { leaderboard: { ...board.settings, enabled: false } });
    const off = await leaderboardFor(db, ada, {}, NOW);
    assert.equal(off.enabled, false);
    assert.equal(off.rows.length, 0);
    await db.dropDatabase();
  });

  test("insights count invites, deals, buyers and earnings for the reader only", async () => {
    const root = await addPartner("Founder");
    const ada = await addPartner("Ada Obi", { parentId: root.id });
    const kid = await addPartner("Kid One", { parentId: ada.id, joinedAt: NOW - 1000 });
    await addPartner("Grandkid", { parentId: kid.id, joinedAt: NOW - 1000 });
    await addPartner("Old Kid", { parentId: ada.id, joinedAt: Date.UTC(2025, 0, 1) });
    await addDeal(ada, 400_000);
    await addDeal(ada, 0, { status: "pending" });
    await addDeal(kid, 200_000, { reporterId: kid.id });
    await db.collection("marketing_ledger").insertMany([
      { _id: "l1", marketerId: ada.id, kind: "earn", level: 1, status: "earned", amountMinor: 20_000, createdAt: NOW - 100 },
      { _id: "l2", marketerId: ada.id, kind: "earn", level: 2, status: "earned", amountMinor: 4_000, createdAt: NOW - 100 },
      { _id: "l3", marketerId: ada.id, kind: "earn", level: 1, status: "void", amountMinor: 99_000, createdAt: NOW - 100 },
    ] as never);
    await db.collection("marketing_leads").insertMany([
      { _id: "b1", reporterId: ada.id, state: "won", createdAt: NOW - 100 },
      { _id: "b2", reporterId: ada.id, state: "new", createdAt: NOW - 100 },
      { _id: "b3", reporterId: kid.id, state: "won", createdAt: NOW - 100 },
    ] as never);

    const out = await insightsFor(db, ada, "month", NOW);
    assert.deepEqual(out.invites, { direct: 1, team: 2, directAllTime: 2, teamAllTime: 3 });
    assert.equal(out.deals.reported, 2);
    assert.equal(out.deals.approved, 1);
    assert.equal(out.deals.pending, 1);
    assert.equal(out.deals.valueMinor, 400_000);
    assert.equal(out.deals.teamApproved, 1);
    assert.deepEqual(out.earnings, { earnedMinor: 24_000, fromTeamMinor: 4_000 });
    assert.deepEqual(out.buyers, { logged: 2, won: 1, lost: 0, open: 1 });
    assert.equal(out.months.length, 6);
    assert.equal(out.months[5]!.valueMinor, 400_000);
    await db.dropDatabase();
  });

  test("the upline is the inviter, or the office for people who joined without a link", async () => {
    const root = await addPartner("Founder");
    const ada = await addPartner("Ada Obi", { parentId: root.id });
    const kid = await addPartner("Kid One", { parentId: ada.id });
    const office = { email: "office@avhomes.test", phone: "+2348143345307" };

    assert.equal(await uplineFor(db, root, office), null);
    assert.deepEqual(await uplineFor(db, ada, office), {
      kind: "office",
      name: "AV Homes office",
      code: "",
      email: office.email,
      phone: office.phone,
    });
    const up = await uplineFor(db, kid, office);
    assert.equal(up?.kind, "person");
    assert.equal(up?.email, ada.email);
    assert.equal(up?.phone, ada.phone);

    await db.collection<MarketerDoc>("marketers").updateOne({ _id: ada.id }, { $set: { showPhoneToTeam: false } });
    assert.equal((await uplineFor(db, kid, office))?.phone, "");
    await db.dropDatabase();
  });
});
