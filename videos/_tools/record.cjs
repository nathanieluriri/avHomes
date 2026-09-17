// Records the REAL console UI as footage for the tutorial videos.
//
// Every /api/admin request is answered by an in-memory mock seeded from the local demo
// database, so no session exists and the server's auth is never involved. Public pages
// (/api/public) are served for real by the demo server.
//
//   node videos/_tools/record.cjs <scenario>
//
// Env: PUPPETEER_CORE (path to a puppeteer-core install), CHROME (chrome executable),
// FFMPEG (ffmpeg executable), BASE (demo server, default http://localhost:3300).
const { createRequire } = require("module");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const req = createRequire(path.join(REPO, "package.json"));
const { MongoClient } = req("mongodb");
const puppeteer = require(process.env.PUPPETEER_CORE);
const BASE = process.env.BASE || "http://localhost:3300";
const W = 1536;
const H = 864;
const DPR = 1.25;

// The default stage. A scenario overrides it with `viewport` when it records
// something other than the console, such as the marketer app on a phone.
// width * dpr and height * dpr are the encoder's frame size, so both have to
// come out whole.
const DESKTOP = { width: W, height: H, dpr: DPR, mobile: false };

/** The demo database, or null when no mongod is listening on it. */
async function demoDb() {
  const uri = process.env.DEMO_DB || "mongodb://127.0.0.1:27018";
  try {
    return await new MongoClient(uri, { serverSelectionTimeoutMS: 2000 }).connect();
  } catch {
    // Marketing fixtures are built in code, so those jobs still run without it.
    console.log(`no demo db at ${uri}: listings, posts and enquiries will be empty`);
    return null;
  }
}

async function fixtures() {
  const c = await demoDb();
  const db = c ? c.db("avhomes_demo") : null;
  const strip = ({ _id, ...rest }) => ({ id: _id, ...rest });
  const find = (name, filter, sort) =>
    db ? db.collection(name).find(filter).sort(sort).toArray() : Promise.resolve([]);
  const ownerDoc = db ? await db.collection("users").findOne({ role: "owner" }) : null;
  const ownerId = (ownerDoc && ownerDoc._id) || "usr_demo_owner";
  const S = {
    owner: {
      id: ownerId,
      email: "adaeze@example.com",
      displayName: "Adaeze Vincent",
      role: process.env.ROLE || "owner",
      avatarUrl: "/images/library/person-06.jpg",
      title: "Senior Property Consultant",
      phone: "+234 801 234 5678",
    },
    props: (await find("properties", { deletedAt: null }, { updatedAt: -1 })).map(strip),
    posts: (await find("posts", { deletedAt: null }, { publishedAt: -1 })).map((d) => ({ ...strip(d), author: { name: "Adaeze Vincent" } })),
    enqs: (await find("enquiries", {}, { updatedAt: -1 })).map((d) => {
      const { threadKey, sourceIp, ...e } = strip(d);
      return { ...e, handledByName: null, messages: e.messages.map(({ authorId, ...m }) => m) };
    }),
    notes: [],
    progress: {},
    nudgeDismissedAt: null,
    settings: {
      replyIdentity: "individual",
      teamName: "AV Constructions team",
      teamAvatarUrl: "",
      contactPhone: "+234 801 234 5678",
      contactEmail: "hello@avhomes.com",
      whatsappNumber: "+2348012345678",
      offices: [],
      clientLogos: [],
      social: { linkedin: "", instagram: "", facebook: "", x: "" },
      updatedAt: 0,
      revision: 0,
    },
    library: fs
      .readdirSync(path.join(REPO, "public/images/library"))
      .filter((f) => /^(exterior|interior|av-)/.test(f))
      .map((f, i) => ({
        id: `img_${i}`,
        url: `/images/library/${f}`,
        alt: f.replace(/\.jpg$/, "").replace(/^av-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
        contentType: "image/jpeg",
        width: 1600,
        height: 1067,
        bytes: 240000,
        createdAt: Date.now() - i * 36e5,
        uploadedBy: ownerId,
      })),
  };
  S.marketing = marketingFixtures(ownerId, S.props);
  if (c) await c.close();
  return S;
}

/* ══════════════════════════════════════════════════════════════ MARKETING ══ */

// A fixed clock. Every stored time below hangs off it, so a re-run of the same
// job draws the same screen down to the date in a row.
const T0 = new Date(2026, 8, 12, 9, 0, 0).getTime();
const DAY = 864e5;
const ago = (days, hours = 0) => T0 - days * DAY - hours * 36e5;
/** Naira to kobo, which is what every amount below is stored in. */
const kobo = (naira) => naira * 100;

const BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "50211", name: "Kuda Microfinance Bank" },
  { code: "999992", name: "OPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "033", name: "United Bank for Africa" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

/** The bank's own answer to a NUBAN, which is never what somebody typed. */
function accountNameFor(displayName) {
  return displayName.toUpperCase();
}

/**
 * Marketers, their deals, the money that follows and one month of pay.
 *
 * Built here rather than read from the demo database: the feature ships no seed
 * script, and these jobs have to run on a machine with no local mongod.
 */
function marketingFixtures(ownerId, props) {
  const bank = (code, accountNumber, displayName, verified = true) => {
    const found = BANKS.find((b) => b.code === code);
    return {
      bankCode: code,
      bankName: found ? found.name : "Guaranty Trust Bank",
      accountNumber,
      accountName: accountNameFor(displayName),
      verifiedAt: verified ? ago(200) : null,
    };
  };

  const seed = [
    { id: "mkt_av0001", code: "AV-0001", displayName: "Adaeze Vincent", email: "adaeze@example.com", phone: "+234 801 234 5678", state: "Lagos", parentId: null, joined: 420, status: "active", statusReason: "", isAdmin: true, bank: bank("058", "0123456789", "Adaeze Ngozi Vincent") },
    { id: "mkt_av0002", code: "AV-0002", displayName: "Chidi Okonkwo", email: "chidi@example.com", phone: "+234 801 234 5611", state: "Lagos", parentId: "mkt_av0001", joined: 260, status: "active", statusReason: "", isAdmin: false, bank: bank("057", "0123456702", "Chidi Emmanuel Okonkwo") },
    { id: "mkt_av0003", code: "AV-0003", displayName: "Ngozi Balogun", email: "ngozi@example.com", phone: "+234 801 234 5612", state: "Lagos", parentId: "mkt_av0001", joined: 214, status: "active", statusReason: "", isAdmin: false, bank: bank("044", "0123456703", "Ngozi Aderonke Balogun") },
    { id: "mkt_av0004", code: "AV-0004", displayName: "Emeka Adeyemi", email: "emeka@example.com", phone: "+234 801 234 5613", state: "Abuja", parentId: "mkt_av0001", joined: 175, status: "active", statusReason: "", isAdmin: false, bank: bank("011", "0123456704", "Emeka Samuel Adeyemi", false) },
    { id: "mkt_av0005", code: "AV-0005", displayName: "Yetunde Bello", email: "yetunde@example.com", phone: "+234 801 234 5614", state: "Lagos", parentId: "mkt_av0002", joined: 142, status: "active", statusReason: "", isAdmin: false, bank: bank("070", "0123456705", "Yetunde Modupe Bello") },
    { id: "mkt_av0006", code: "AV-0006", displayName: "Ibrahim Danjuma", email: "ibrahim@example.com", phone: "+234 801 234 5615", state: "Kaduna", parentId: "mkt_av0002", joined: 121, status: "paused", statusReason: "We are waiting on the bank details you were asked for.", isAdmin: false, bank: null },
    { id: "mkt_av0007", code: "AV-0007", displayName: "Funmilayo Eze", email: "funmilayo@example.com", phone: "+234 801 234 5616", state: "Ogun", parentId: "mkt_av0003", joined: 96, status: "active", statusReason: "", isAdmin: false, bank: bank("999992", "0123456706", "Funmilayo Chiamaka Eze") },
    { id: "mkt_av0008", code: "AV-0008", displayName: "Tobi Ajayi", email: "tobi@example.com", phone: "+234 801 234 5617", state: "Lagos", parentId: "mkt_av0005", joined: 58, status: "active", statusReason: "", isAdmin: false, bank: bank("50211", "0123456707", "Tobi Oluwaseun Ajayi") },
    { id: "mkt_av0009", code: "AV-0009", displayName: "Halima Yusuf", email: "halima@example.com", phone: "+234 801 234 5618", state: "Kano", parentId: "mkt_av0007", joined: 37, status: "banned", statusReason: "Two deals reported on a home that was never sold.", isAdmin: false, bank: bank("033", "0123456708", "Halima Aisha Yusuf") },
  ];

  const byId = new Map();
  const marketers = seed.map((row) => {
    const parent = row.parentId ? byId.get(row.parentId) : null;
    const record = {
      id: row.id,
      userId: row.id === "mkt_av0001" ? ownerId : `usr_${row.code.toLowerCase().replace("-", "")}`,
      code: row.code,
      displayName: row.displayName,
      email: row.email,
      phone: row.phone,
      state: row.state,
      status: row.status,
      statusReason: row.statusReason,
      parentId: row.parentId,
      // Nearest first, at most two: the tree pays three levels and no more.
      upline: parent ? [parent.id, ...parent.upline].slice(0, 2) : [],
      bank: row.bank,
      isAdmin: row.isAdmin,
      joinedAt: ago(row.joined),
      createdAt: ago(row.joined),
      updatedAt: ago(row.joined),
    };
    byId.set(record.id, record);
    return record;
  });

  // The listing snapshot on a deal: the demo row when the demo db is up, the
  // same home written out when it is not.
  const home = (slug, title, location) => {
    const live = props.find((p) => p.slug === slug);
    return {
      listingId: live ? live.id : `demo_${slug}`,
      listingTitle: live ? live.title : title,
      listingLocation: live ? [live.location, live.city].filter(Boolean).join(", ") : location,
    };
  };

  const shot = (n) => `/images/library/av-photo-0${n}.jpg`;
  const person = (id) => byId.get(id);
  const rates = { sale: [5, 2, 1], rent: [5, 2, 1] };

  /** Who earns what, the same floor-per-level arithmetic the server does. */
  const split = (amountMinor, kind, reporterId) => {
    const reporter = person(reporterId);
    const chain = [reporter, ...reporter.upline.map(person)];
    const table = kind === "rent" ? rates.rent : rates.sale;
    const out = [];
    for (let i = 0; i < 3; i++) {
      const member = chain[i];
      if (!member || member.status !== "active") continue;
      const rate = table[i] || 0;
      const amount = Math.floor((amountMinor * rate) / 100);
      if (amount <= 0) continue;
      out.push({ marketerId: member.id, marketerName: member.displayName, code: member.code, level: i + 1, rate, amountMinor: amount });
    }
    return out;
  };

  const deal = (row) => {
    const reporter = person(row.reporterId);
    const settled = row.status === "approved";
    return {
      id: row.id,
      ...home(row.slug, row.title, row.location),
      listingType: row.kind,
      listingEstate: row.estate || "",
      unitKey: row.unitKey || "",
      amountMinor: row.amountMinor,
      currency: "NGN",
      buyerName: row.buyerName,
      buyerPhone: row.buyerPhone,
      proof: row.proof,
      note: row.note || "",
      reporterId: reporter.id,
      reporterName: reporter.displayName,
      reporterCode: reporter.code,
      status: row.status,
      reason: row.reason || "",
      reviewedBy: row.status === "pending" ? "" : ownerId,
      reviewedByName: row.status === "pending" ? "" : "Adaeze Vincent",
      reviewedAt: row.status === "pending" ? null : ago(row.at - 1),
      closedOn: ago(row.closed),
      shares: settled ? split(row.amountMinor, row.kind, row.reporterId) : [],
      createdAt: ago(row.at),
      updatedAt: ago(row.status === "pending" ? row.at : row.at - 1),
    };
  };

  const deals = [
    deal({ id: "deal_oniru_let", slug: "oniru-beachfront-apartment", title: "Oniru Beachfront Apartment", location: "Oniru, Victoria Island, Lagos", kind: "rent", amountMinor: kobo(18_000_000), reporterId: "mkt_av0001", buyerName: "Chidinma Okafor", buyerPhone: "0801 234 5601", proof: [shot(1)], note: "Paid in two parts, the second part cleared on Monday.", status: "pending", at: 4, closed: 6 }),
    // Adaeze's own deal sent back, so the app has a "Need more info" to answer.
    deal({ id: "deal_chevron_info", slug: "chevron-drive-townhouse", title: "Chevron Drive Townhouse", location: "Chevron Drive, Lekki, Lagos", kind: "sale", amountMinor: kobo(235_000_000), reporterId: "mkt_av0001", buyerName: "Tunde Bakare", buyerPhone: "0801 234 5602", proof: [shot(3)], note: "The buyer paid the full sum by transfer on Friday.", status: "info", reason: "The transfer slip is cut off. Send one that shows the date and the full amount.", at: 3, closed: 5 }),
    deal({ id: "deal_wuse_loft", slug: "wuse-studio-loft", title: "Wuse Studio Loft", location: "Wuse 2, Abuja", kind: "rent", amountMinor: kobo(3_200_000), reporterId: "mkt_av0003", buyerName: "Sadiq Bello", buyerPhone: "0801 234 5603", proof: [shot(2)], status: "info", reason: "The receipt does not show the buyer's name.", at: 9, closed: 12 }),
    deal({ id: "deal_gwarinpa_home", slug: "gwarinpa-family-home", title: "Gwarinpa Family Home", location: "Gwarinpa, Abuja", kind: "sale", amountMinor: kobo(148_000_000), reporterId: "mkt_av0004", buyerName: "Aisha Mohammed", buyerPhone: "0801 234 5604", proof: [shot(3)], status: "rejected", reason: "The alert is for a different property on the same street.", at: 16, closed: 20 }),
    deal({ id: "deal_ikoyi_glass", slug: "ikoyi-glass-house", title: "Ikoyi Glass House", location: "Old Ikoyi, Lagos", kind: "sale", amountMinor: kobo(480_000_000), reporterId: "mkt_av0001", buyerName: "Olumide Sanni", buyerPhone: "0801 234 5605", proof: [shot(1), shot(2)], status: "approved", at: 7, closed: 11 }),
    deal({ id: "deal_banana_mansion", slug: "banana-island-mansion", title: "The Banana Island Mansion", location: "Banana Island, Ikoyi", kind: "sale", amountMinor: kobo(1_250_000_000), reporterId: "mkt_av0002", buyerName: "Ifeanyi Nwosu", buyerPhone: "0801 234 5606", proof: [shot(2), shot(3)], status: "approved", at: 38, closed: 44 }),
    deal({ id: "deal_asokoro_villa", slug: "asokoro-hillside-villa", title: "Asokoro Hillside Villa", location: "Asokoro, Abuja", kind: "sale", amountMinor: kobo(395_000_000), reporterId: "mkt_av0005", buyerName: "Grace Okoro", buyerPhone: "0801 234 5607", proof: [shot(1)], status: "approved", at: 33, closed: 36 }),
    // Approved before July's cutoff and paid in July's run, which is the payment
    // Adaeze's open problem is about.
    deal({ id: "deal_maitama_let", slug: "maitama-terrace", title: "Maitama Terrace", location: "Maitama, Abuja", kind: "rent", amountMinor: kobo(9_500_000), reporterId: "mkt_av0001", buyerName: "Kelechi Obi", buyerPhone: "0801 234 5608", proof: [shot(2)], status: "approved", at: 53, closed: 56 }),
  ];

  // One line per share of an approved deal. Lines are added, never edited.
  const ledger = [];
  let lineNo = 0;
  const addLines = (row, status, payRunId, at) => {
    for (const share of row.shares) {
      lineNo += 1;
      ledger.push({
        id: `ledg_${String(lineNo).padStart(4, "0")}`,
        marketerId: share.marketerId,
        dealId: row.id,
        level: share.level,
        kind: "earn",
        amountMinor: share.amountMinor,
        currency: "NGN",
        status,
        payRunId,
        reversesId: null,
        note: "",
        dealTitle: row.listingTitle,
        createdAt: at,
        updatedAt: at,
      });
    }
  };

  const RUN_ID = "prun_2026_08";
  const JULY_ID = "prun_2026_07";
  const august = deals.filter((d) => !["deal_ikoyi_glass", "deal_maitama_let"].includes(d.id) && d.status === "approved");
  for (const row of august) addLines(row, "paid", RUN_ID, row.reviewedAt);
  const thisMonth = deals.find((d) => d.id === "deal_ikoyi_glass");
  addLines(thisMonth, "earned", null, thisMonth.reviewedAt);

  // Yetunde is still waiting on her transfer, so her lines sit in the run.
  for (const line of ledger) {
    if (line.marketerId === "mkt_av0005") line.status = "scheduled";
  }

  // Last, so the August line numbers stay what they were before July existed.
  const july = deals.find((d) => d.id === "deal_maitama_let");
  addLines(july, "paid", JULY_ID, july.reviewedAt);

  /* A deal that fell through after the money went out, so the history screen
     has a real Money Out row and the red half of the palette is exercised by
     something rather than only described. Negative, pointing at the line it
     reverses, which is how the ledger takes money back. */
  const reversed = ledger.find((l) => l.marketerId === "mkt_av0001" && l.status === "paid");
  if (reversed) {
    ledger.push({
      id: "ledg_clawback_01",
      marketerId: reversed.marketerId,
      dealId: reversed.dealId,
      level: reversed.level,
      kind: "clawback",
      amountMinor: -Math.abs(reversed.amountMinor),
      currency: "NGN",
      status: "earned",
      payRunId: null,
      reversesId: reversed.id,
      note: "The sale fell through after the buyer's bank pulled the mortgage.",
      dealTitle: reversed.dealTitle,
      createdAt: ago(9),
      updatedAt: ago(9),
    });
  }

  const totalFor = (id, runId = RUN_ID) =>
    ledger.filter((l) => l.payRunId === runId && l.marketerId === id).reduce((sum, l) => sum + l.amountMinor, 0);
  const payItem = (id, status, at, reference) => {
    const who = person(id);
    return {
      marketerId: id,
      code: who.code,
      displayName: who.displayName,
      totalMinor: totalFor(id),
      bank: who.bank,
      status,
      proof: status === "paid" ? [shot(3)] : [],
      reference: reference || "",
      paidAt: status === "paid" ? at : null,
      paidByName: status === "paid" ? "Adaeze Vincent" : "",
      issueId: id === "mkt_av0002" ? "pisu_aug_chidi" : null,
      note: "",
    };
  };

  const items = [
    payItem("mkt_av0002", "paid", ago(3), "AVH-2608-0001"),
    payItem("mkt_av0001", "paid", ago(2), "AVH-2608-0002"),
    payItem("mkt_av0005", "pending", null, ""),
  ];
  // July paid one person, and part of that transfer went missing.
  const julyItem = {
    ...payItem("mkt_av0001", "paid", ago(43), "AVH-2607-0001"),
    totalMinor: totalFor("mkt_av0001", JULY_ID),
    issueId: "pisu_jul_adaeze",
  };
  const payRuns = [
    {
      id: RUN_ID,
      month: "2026-08",
      status: "paying",
      currency: "NGN",
      totalMinor: items.reduce((sum, i) => sum + i.totalMinor, 0),
      paidMinor: items.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.totalMinor, 0),
      items,
      createdByName: "Adaeze Vincent",
      createdAt: ago(4),
      updatedAt: ago(2),
      closedAt: null,
    },
    {
      id: JULY_ID,
      month: "2026-07",
      status: "closed",
      currency: "NGN",
      totalMinor: julyItem.totalMinor,
      paidMinor: julyItem.totalMinor,
      items: [julyItem],
      createdByName: "Adaeze Vincent",
      createdAt: ago(45),
      updatedAt: ago(43),
      closedAt: ago(42),
    },
  ];

  const issues = [
    {
      id: "pisu_aug_chidi",
      payRunId: RUN_ID,
      month: "2026-08",
      marketerId: "mkt_av0002",
      marketerName: "Chidi Okonkwo",
      code: "AV-0002",
      amountMinor: totalFor("mkt_av0002"),
      currency: "NGN",
      status: "open",
      messages: [
        { at: ago(2, 6), byName: "Chidi Okonkwo", bySide: "marketer", text: "Nothing came into my Zenith account on that date. I checked with the bank this morning and they see no credit.", proof: [] },
        { at: ago(1, 3), byName: "Adaeze Vincent", bySide: "admin", text: "We have the transfer on our side with reference AVH-2608-0001. Sending you the slip now, please check again this afternoon.", proof: [shot(3)] },
      ],
      createdAt: ago(2, 6),
      updatedAt: ago(1, 3),
      resolvedAt: null,
    },
    // Adaeze's own, with the console's answer last: the app's "AV Homes replied" alert.
    {
      id: "pisu_jul_adaeze",
      payRunId: JULY_ID,
      month: "2026-07",
      marketerId: "mkt_av0001",
      marketerName: "Adaeze Vincent",
      code: "AV-0001",
      amountMinor: totalFor("mkt_av0001", JULY_ID),
      currency: "NGN",
      status: "open",
      messages: [
        { at: ago(41, 5), byName: "Adaeze Vincent", bySide: "marketer", text: "Only ₦250,000 of this reached my GTBank account. The other ₦225,000 never came in.", proof: [] },
        { at: ago(1, 4), byName: "Folake Adisa", bySide: "admin", text: "Our bank held the second part of the transfer. It went out again this morning with reference AVH-2607-0001B. Tell us here if it has not landed by tomorrow.", proof: [shot(3)] },
      ],
      createdAt: ago(41, 5),
      updatedAt: ago(1, 4),
      resolvedAt: null,
    },
  ];

  /*
   * Two live cards with photographs and a draft, so the console list shows every
   * status. Neither live card has an end date: the feed is read against the real
   * clock, and a fixture that expires on a calendar date stops being the same
   * screen the week after it was written.
   */
  const updates = [
    {
      id: "upd_saturday_visits",
      title: "Saturday site visits at Tropical Oasis",
      body: "Bring your buyers to the Lekki show home at 10am. Our team runs the tour, and the deal is still yours.",
      imageUrl: "/images/library/av-render-02.jpg",
      linkLabel: "See the homes",
      linkHref: "/m/listings",
      tone: "gold",
      pinned: true,
      status: "live",
      startsAt: ago(5),
      endsAt: null,
      createdByName: "Adaeze Vincent",
      createdAt: ago(5, 2),
      updatedAt: ago(5, 2),
      source: "admin",
    },
    {
      id: "upd_top_seller",
      title: "August's top seller: Chidi Okonkwo",
      body: "He sold The Banana Island Mansion in August. Your next deal could be on this card.",
      imageUrl: "/images/library/team-02.jpg",
      linkLabel: "Report a deal",
      linkHref: "/m/deals/new",
      tone: "wine",
      pinned: false,
      status: "live",
      startsAt: ago(9),
      endsAt: null,
      createdByName: "Adaeze Vincent",
      createdAt: ago(9, 1),
      updatedAt: ago(9, 1),
      source: "admin",
    },
    {
      id: "upd_payday_october",
      title: "Pay day moves to the 28th in October",
      body: "The bank closes early on the 30th. Everything approved by the 25th still goes out that month.",
      imageUrl: "",
      linkLabel: "",
      linkHref: "",
      tone: "plum",
      pinned: false,
      status: "draft",
      // Local midnights, the way the console's date fields store them.
      startsAt: new Date(2026, 9, 1).getTime(),
      endsAt: new Date(2026, 9, 29).getTime(),
      createdByName: "Adaeze Vincent",
      createdAt: ago(1, 6),
      updatedAt: ago(1, 6),
      source: "admin",
    },
  ];

  /*
   * The three newest live listings for the feed's own cards: the demo rows when
   * the demo db is up, the same homes written out when it is not. Times hang off
   * the fixed clock either way, so the cards read the same on every run.
   */
  const fallbackListings = [
    { id: "demo_kuje-garden-estate", title: "Kuje Garden Estate", city: "Abuja", images: ["/images/library/av-render-03.jpg"] },
    { id: "demo_tropical-oasis-lekki", title: "Tropical Oasis", city: "Lagos", images: ["/images/library/av-render-01.jpg"] },
    { id: "demo_baraks-road-bungalow", title: "Baraks Road Bungalow", city: "Calabar", images: ["/images/library/av-photo-01.jpg"] },
  ];
  const liveProps = props
    .filter((p) => p.status === "live")
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0) || String(a.id).localeCompare(String(b.id)));
  const newListings = (liveProps.length > 0 ? liveProps : fallbackListings).slice(0, 3).map((p, i) => ({
    id: p.id,
    title: p.title,
    city: p.city || "",
    imageUrl: (p.images || []).find((url) => !/\.(mp4|mov|m4v|webm)$/iu.test(url)) || "",
    publishedAt: ago(2 + i * 4),
  }));

  /* One buyer per state, so both surfaces have a real row for every tab and the
     timeline has more than one entry to draw. Adaeze (the root) logged them,
     because she is who the app signs in as. */
  const lead = ({ id, name, phone, listingId = null, listingTitle = "", area = "", budget = 0, kind = "sale", state, at, events }) => ({
    id,
    buyerName: name,
    buyerPhone: phone,
    listingId,
    listingTitle,
    wantKind: kind,
    wantArea: area,
    wantBudgetMinor: budget,
    currency: "NGN",
    brief: events[0].note,
    reporterId: "mkt_av0001",
    reporterName: "Adaeze Vincent",
    reporterCode: "AV-0001",
    state,
    events,
    dealId: state === "won" ? "deal_ikoyi_won" : null,
    createdAt: ago(at),
    updatedAt: events[events.length - 1].at,
  });
  const ev = (from, to, side, byName, reason, note, at) => ({ at: ago(at), from, to, bySide: side, byName, reason, note });

  const leads = [
    lead({ id: "lead_ifeoma", name: "Ifeoma Nwosu", phone: "0803 114 2277", area: "Lekki Phase 1", budget: kobo(85_000_000), state: "new", at: 1,
      events: [ev("new", "new", "marketer", "Adaeze Vincent", "Logged by marketer", "My cousin. Relocating from Abuja in March, has the cash ready.", 1)] }),
    lead({ id: "lead_seyi", name: "Seyi Adeleke", phone: "0805 662 1190", area: "Ikoyi", budget: kobo(210_000_000), state: "contacted", at: 6,
      events: [
        ev("new", "new", "marketer", "Adaeze Vincent", "Logged by marketer", "Works at a bank on the island. Wants something close to the office.", 6),
        ev("new", "contacted", "admin", "Tunde Balogun", "Reached them", "Spoke to him this morning. Sending three Ikoyi options tonight.", 4),
      ] }),
    lead({ id: "lead_grace", name: "Grace Obi", phone: "0806 445 7781", listingId: "prop_chevron", listingTitle: "Chevron Drive Townhouse", state: "meeting", at: 11,
      events: [
        ev("new", "new", "marketer", "Adaeze Vincent", "Logged by marketer", "She saw the Chevron Drive townhouse on the site and asked me about it.", 11),
        ev("new", "contacted", "admin", "Tunde Balogun", "Reached them", "Called her, she is serious. Asked about the payment plan.", 9),
        ev("contacted", "meeting", "admin", "Tunde Balogun", "They picked a date", "Viewing booked for Saturday at 11. She is bringing her husband.", 3),
      ] }),
    lead({ id: "lead_musa", name: "Musa Bello", phone: "0807 220 4412", listingId: "prop_oniru", listingTitle: "Oniru Beachfront Apartment", kind: "rent", state: "offer", at: 21,
      events: [
        ev("new", "new", "marketer", "Adaeze Vincent", "Logged by marketer", "Old colleague. His lease ends in April and he wants Oniru.", 21),
        ev("new", "contacted", "admin", "Tunde Balogun", "Reached them", "Reached him on WhatsApp. Sent the Oniru listing.", 19),
        ev("contacted", "meeting", "admin", "Tunde Balogun", "We offered dates", "He picked Thursday evening.", 15),
        ev("meeting", "viewed", "admin", "Tunde Balogun", "Inspection done", "Came with his wife. They liked it, asked about the service charge.", 12),
        ev("viewed", "offer", "admin", "Tunde Balogun", "They made an offer", "Offered sixteen million for the year. Waiting on the landlord.", 5),
      ] }),
    lead({ id: "lead_amaka", name: "Amaka Eze", phone: "0808 337 9021", listingId: "prop_ikoyi", listingTitle: "Ikoyi Glass House", state: "won", at: 54,
      events: [
        ev("new", "new", "marketer", "Adaeze Vincent", "Logged by marketer", "She runs a logistics company and has been looking in Ikoyi for months.", 54),
        ev("new", "contacted", "admin", "Tunde Balogun", "Reached them", "Very keen. Booked her in for the Ikoyi house.", 50),
        ev("contacted", "meeting", "admin", "Tunde Balogun", "They picked a date", "Saturday morning viewing.", 44),
        ev("meeting", "viewed", "admin", "Tunde Balogun", "Inspection done", "Loved it. Asked us to hold it for a week.", 40),
        ev("viewed", "offer", "admin", "Tunde Balogun", "They made an offer", "Full asking price, wants to close this month.", 30),
        ev("offer", "won", "admin", "Tunde Balogun", "Paid in full", "Payment cleared this morning. Papers signed at the office.", 21),
      ] }),
    lead({ id: "lead_dele", name: "Dele Fashola", phone: "0809 551 3308", area: "Ajah", budget: kobo(45_000_000), state: "lost", at: 38,
      events: [
        ev("new", "new", "marketer", "Adaeze Vincent", "Logged by marketer", "Friend from church. Looking around Ajah, budget is tight.", 38),
        ev("new", "contacted", "admin", "Tunde Balogun", "Left a message", "Called twice, no answer. Left a voice note.", 33),
        ev("contacted", "lost", "marketer", "Adaeze Vincent", "Not ready yet", "I saw him on Sunday. He has put off buying until next year.", 26),
      ] }),
  ];

  return {
    marketers,
    deals,
    leads,
    ledger,
    payRuns,
    issues,
    updates,
    newListings,
    banks: BANKS,
    rootId: "mkt_av0001",
    settings: {
      saleRates: rates.sale,
      rentRates: rates.rent,
      rentBasis: "upfront",
      issueWindowDays: 14,
      payCutoffDay: 25,
      requireApproval: false,
      joinOpen: true,
      blockSelfDeals: true,
      minPayoutMinor: 0,
      currency: "NGN",
      supportPhone: "+234 801 234 5678",
      accountProvider: "kora",
      updatedAt: ago(30),
    },
  };
}

function mockApi(S) {
  const now = () => Date.now();
  const page = (items) => ({ items, nextCursor: null, total: items.length });
  const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const bump = (o, patch) => Object.assign(o, patch, { updatedAt: now(), revision: (o.revision || 1) + 1 });
  // PATCH bodies arrive as { patch, baseRevision } (listings, posts) or flat (enquiries).
  const without = (b) => {
    const { revision, baseRevision, patch, ...rest } = b || {};
    return patch || rest;
  };
  return [
    ["GET", /^\/api\/auth\/me$/, () => ({ user: S.owner })],
    ["GET", /^\/api\/admin\/health$/, () => ({ alerts: [], checks: [] })],
    ["GET", /^\/api\/admin\/dashboard$/, () => {
      const count = (arr) => arr.reduce((o, x) => ({ ...o, [x.status]: (o[x.status] || 0) + 1 }), {});
      const e = count(S.enqs);
      const series = Array.from({ length: 30 }, (_, i) => ({ day: new Date(now() - (29 - i) * 864e5).toISOString().slice(0, 10), sessions: 20 + ((i * 7) % 13) }));
      return {
        listings: count(S.props),
        posts: count(S.posts),
        enquiries: { new: e.new || 0, open: e.open || 0, closed: e.closed || 0, spam: e.spam || 0 },
        recentEnquiries: S.enqs.slice(0, 5).map(({ id, name, status, createdAt }) => ({ id, name, status, createdAt })),
        pulse: { live: 2, sessions: series.reduce((n, d) => n + d.sessions, 0), previousSessions: 640, series, views: 2100 },
      };
    }],
    ["GET", /^\/api\/admin\/settings$/, () => ({ settings: S.settings })],
    ["GET", /^\/api\/admin\/users$/, () => ({ items: [{ ...S.owner, createdAt: now() - 864e7, disabledAt: null, listingCount: S.props.length, postCount: S.posts.length }] })],
    ["GET", /^\/api\/admin\/images$/, () => ({ items: S.library, nextCursor: null })],
    ["GET", /^\/api\/admin\/(stats|categories|revisions\/.+)$/, () => ({ items: [] })],
    ["GET", /^\/api\/admin\/properties\/([^/]+)\/history$/, () => ({ items: [] })],
    ["GET", /^\/api\/admin\/properties\/([^/?]+)$/, (m) => ({ property: byId(S.props, m[1]) })],
    ["GET", /^\/api\/admin\/properties$/, (m, u) => {
      const s = u.searchParams.get("status");
      return page(s ? S.props.filter((p) => p.status === s) : S.props);
    }],
    ["POST", /^\/api\/admin\/properties$/, (m, u, b) => {
      const t = S.props.find((p) => p.slug === "ikoyi-glass-house");
      const p = {
        ...JSON.parse(JSON.stringify(t)),
        id: "prop_new_" + now().toString(36),
        title: b.title,
        slug: null,
        tagline: "",
        description: "",
        address: "",
        city: "",
        location: "",
        type: "",
        amenities: [],
        images: [],
        priceMinor: 0,
        bedrooms: 0,
        bathrooms: 0,
        parkingSpaces: 0,
        areaSqft: 0,
        yearBuilt: new Date().getFullYear(),
        status: "draft",
        featured: false,
        publishedAt: null,
        priceHistory: [],
        createdAt: now(),
        updatedAt: now(),
        revision: 1,
        agent: { ...t.agent, name: S.owner.displayName, avatarUrl: S.owner.avatarUrl },
      };
      S.props.unshift(p);
      return { property: p };
    }],
    ["PATCH", /^\/api\/admin\/properties\/([^/?]+)$/, (m, u, b) => ({ property: bump(byId(S.props, m[1]), without(b)) })],
    ["POST", /^\/api\/admin\/properties\/([^/]+)\/(\w+)$/, (m) => {
      const p = byId(S.props, m[1]);
      if (m[2] === "publish") bump(p, { status: "live", slug: p.slug || slugify(p.title), publishedAt: now() });
      return { property: p };
    }],
    ["GET", /^\/api\/admin\/enquiries\/([^/?]+)$/, (m) => ({ enquiry: byId(S.enqs, m[1]) })],
    ["GET", /^\/api\/admin\/enquiries$/, (m, u) => {
      const s = u.searchParams.get("status");
      return page(s ? S.enqs.filter((e) => e.status === s) : S.enqs);
    }],
    ["POST", /^\/api\/admin\/enquiries\/([^/]+)\/reply$/, (m, u, b) => {
      const e = byId(S.enqs, m[1]);
      e.messages.push({ id: "msg_" + now().toString(36), from: "agent", body: (b && (b.body ?? b.message)) || "", createdAt: now(), authorName: S.owner.displayName });
      bump(e, { lastAgentAt: now(), status: "open", handledBy: S.owner.id, handledByName: S.owner.displayName });
      return { enquiry: e };
    }],
    ["PATCH", /^\/api\/admin\/enquiries\/([^/?]+)$/, (m, u, b) => ({ enquiry: bump(byId(S.enqs, m[1]), without(b)) })],
    ["GET", /^\/api\/admin\/notes$/, () => ({ items: S.notes })],
    ["POST", /^\/api\/admin\/notes$/, (m, u, b) => {
      const n = {
        id: "note_" + now().toString(36),
        path: (b && b.path) || "/",
        kind: (b && b.kind) || "markup",
        comment: (b && b.comment) || "",
        copyBefore: (b && b.copyBefore) ?? null,
        copyAfter: (b && b.copyAfter) ?? null,
        shotUrl: (b && (b.shotUrl || b.shot)) || "",
        shotWidth: (b && b.shotWidth) || W,
        shotHeight: (b && b.shotHeight) || H,
        marks: (b && b.marks) || [],
        attachments: (b && b.attachments) || [],
        status: "open",
        createdAt: now(),
        updatedAt: now(),
        createdBy: S.owner.id,
        createdByName: S.owner.displayName,
        events: [],
        revision: 1,
      };
      S.notes.unshift(n);
      return { note: n };
    }],
    ["GET", /^\/api\/admin\/tutorials\/progress$/, () => ({ items: Object.values(S.progress), nudgeDismissedAt: S.nudgeDismissedAt })],
    ["PUT", /^\/api\/admin\/tutorials\/progress\/([^/?]+)$/, (m, u, b) => {
      const cur = S.progress[m[1]] || { tutorialId: m[1], watchedAt: null, completedAt: null };
      if (b && b.watched) cur.watchedAt = cur.watchedAt || now();
      if (b && b.completed) cur.completedAt = cur.completedAt || now();
      S.progress[m[1]] = cur;
      return { item: cur };
    }],
    ["PUT", /^\/api\/admin\/tutorials\/nudge$/, () => {
      S.nudgeDismissedAt = S.nudgeDismissedAt || now();
      return { nudgeDismissedAt: S.nudgeDismissedAt };
    }],
    ["GET", /^\/api\/admin\/posts\/([^/?]+)$/, (m) => ({ post: byId(S.posts, m[1]) })],
    ["GET", /^\/api\/admin\/posts$/, () => page(S.posts)],
    ["POST", /^\/api\/admin\/posts$/, (m, u, b) => {
      const t = S.posts[0];
      const p = {
        ...JSON.parse(JSON.stringify(t)),
        id: "post_new_" + now().toString(36),
        title: (b && b.title) || "",
        subtitle: "",
        excerpt: "",
        tags: [],
        coverImage: null,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        contentText: "",
        wordCount: 0,
        readingTime: 0,
        slug: null,
        status: "draft",
        publishedAt: null,
        createdAt: now(),
        updatedAt: now(),
        revision: 1,
      };
      S.posts.unshift(p);
      return { post: p };
    }],
    ["PATCH", /^\/api\/admin\/posts\/([^/?]+)$/, (m, u, b) => ({ post: bump(byId(S.posts, m[1]), without(b)) })],
    ["POST", /^\/api\/admin\/posts\/([^/]+)\/(\w+)$/, (m) => {
      const p = byId(S.posts, m[1]);
      if (m[2] === "publish") bump(p, { status: "published", slug: p.slug || slugify(p.title), publishedAt: now() });
      return { post: p };
    }],
    ...marketingApi(S),
  ];
}

/**
 * The marketer app and the marketers console screens.
 *
 * Writes mutate the fixture in place, so a recorded flow shows the state change
 * it just made: approving a deal writes its ledger lines, marking a pay item
 * paid flips the lines under it.
 */
function marketingApi(S) {
  const M = S.marketing;
  const now = () => Date.now();
  const payMonth = (at) => {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  /** "September 2026" from "2026-09", as @avhomes/contracts spells it. */
  const payMonthLabel = (month) => {
    const [year, mon] = month.split("-");
    const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${names[Number(mon) - 1] || month} ${year || ""}`.trim();
  };
  const mkt = (id) => M.marketers.find((p) => p.id === id) || null;
  const me = () => mkt(M.rootId);
  const kids = (id) => M.marketers.filter((p) => p.parentId === id);
  const deal = (id) => M.deals.find((d) => d.id === id) || null;
  const run = (id) => M.payRuns.find((r) => r.id === id) || null;
  const issue = (id) => M.issues.find((i) => i.id === id) || null;
  const hit = (row, q) =>
    q === "" ||
    [row.listingTitle, row.reporterName, row.reporterCode, row.buyerName, row.buyerPhone, row.displayName, row.code, row.email]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q.toLowerCase()));

  function teamOf(id) {
    const l1 = kids(id);
    const l2 = l1.flatMap((p) => kids(p.id));
    const l3 = l2.flatMap((p) => kids(p.id));
    const nameById = new Map([...l1, ...l2, ...l3].map((p) => [p.id, p.displayName]));
    const dealCount = (who) => M.deals.filter((d) => d.reporterId === who && d.status === "approved").length;
    const teamCount = (who) => kids(who).length + kids(who).reduce((n, k) => n + kids(k.id).length, 0);
    const row = (p, level, underName) => ({
      id: p.id,
      code: p.code,
      displayName: p.displayName,
      level,
      status: p.status,
      joinedAt: p.joinedAt,
      teamCount: level === 1 ? teamCount(p.id) : 0,
      dealCount: dealCount(p.id),
      underName,
    });
    return {
      levels: [l1.length, l2.length, l3.length],
      members: [
        ...l1.map((p) => row(p, 1, "")),
        ...l2.map((p) => row(p, 2, nameById.get(p.parentId) || "")),
        ...l3.map((p) => row(p, 3, nameById.get(p.parentId) || "")),
      ],
    };
  }

  const chainOf = (id) => {
    const self = mkt(id);
    if (!self) return [null, null, null];
    const member = (p) => (p ? { id: p.id, name: p.displayName, code: p.code, status: p.status } : null);
    return [member(self), member(mkt(self.upline[0])), member(mkt(self.upline[1]))];
  };

  /** Floored per level, and a paused or banned person earns nothing. */
  function split(amountMinor, kind, reporterId) {
    const table = kind === "rent" ? M.settings.rentRates : M.settings.saleRates;
    const chain = chainOf(reporterId);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const member = chain[i];
      if (!member || member.status !== "active") continue;
      const rate = table[i] || 0;
      const amount = Math.floor((amountMinor * rate) / 100);
      if (amount <= 0) continue;
      out.push({ marketerId: member.id, marketerName: member.name, code: member.code, level: i + 1, rate, amountMinor: amount });
    }
    return out;
  }

  function balanceOf(id) {
    const mine = M.ledger.filter((l) => l.marketerId === id && l.status !== "void");
    const sum = (status) => mine.filter((l) => l.status === status).reduce((n, l) => n + l.amountMinor, 0);
    return {
      currency: M.settings.currency,
      waitingMinor: sum("earned"),
      scheduledMinor: sum("scheduled"),
      paidMinor: sum("paid"),
      // The deal's own value, not what it would pay. The screen says so.
      pendingMinor: M.deals.filter((d) => d.reporterId === id && d.status === "pending").reduce((n, d) => n + d.amountMinor, 0),
    };
  }

  const ledgerOf = (id, limit) =>
    M.ledger.filter((l) => l.marketerId === id).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);

  function payHistoryOf(id) {
    return M.payRuns
      .filter((r) => r.items.some((i) => i.marketerId === id))
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((r) => {
        const item = r.items.find((i) => i.marketerId === id);
        return {
          payRunId: r.id,
          month: r.month,
          totalMinor: item.totalMinor,
          currency: r.currency,
          status: item.status,
          paidAt: item.paidAt,
          proof: item.proof,
          reference: item.reference,
          issueId: item.issueId,
          bankLabel: item.bank ? `${item.bank.bankName} ${item.bank.accountNumber.slice(-4)}` : "",
        };
      });
  }

  /* ═══ BUYERS ═══════════════════════════════════════════════════════════ */

  const leadOf = (id) => M.leads.find((l) => l.id === id) || null;

  /** What the marketer earned on a won lead, the way `withShares` works it out. */
  const withShare = (lead) => {
    const row = lead.dealId ? deal(lead.dealId) : null;
    const share = row && row.status === "approved" ? (row.shares || []).find((x) => x.marketerId === lead.reporterId) : null;
    return { ...lead, myShareMinor: share ? share.amountMinor : 0 };
  };

  /** Appends to the timeline and sets state from it, the one write leads.ts allows. */
  function moveLead(lead, to, reason, note, side, byName) {
    lead.events.push({ at: now(), from: lead.state, to, bySide: side, byName, reason: reason || "", note });
    lead.state = to;
    lead.updatedAt = now();
    return lead;
  }

  /** Ledger lines and real payouts merged, newest first, as `statementFor` does. */
  function statementOf(id) {
    const state = { earned: "waiting", scheduled: "sending", paid: "settled", void: "cancelled" };
    const word = { waiting: "Waiting", sending: "On the way", settled: "Paid", cancelled: "Cancelled" };
    const pays = payHistoryOf(id);
    const monthOfRun = new Map(pays.map((p) => [p.payRunId, payMonthLabel(p.month)]));
    const paidRuns = new Set(pays.filter((p) => p.status === "paid").map((p) => p.payRunId));
    const rows = ledgerOf(id, 400).map((l) => ({
      id: l.id,
      at: l.createdAt,
      amountMinor: l.amountMinor,
      currency: l.currency,
      kind: l.kind === "clawback" ? "clawback" : l.kind === "adjust" ? "adjustment" : "earning",
      title: l.dealTitle || (l.kind === "adjust" ? "Adjustment" : "Commission"),
      state: state[l.status],
      status: word[state[l.status]],
      reference: l.id,
      dealId: l.dealId || null,
      payRunId: l.payRunId || null,
      bankLabel: "",
      carriedBy: l.payRunId && paidRuns.has(l.payRunId) ? (monthOfRun.get(l.payRunId) || "") : "",
      note: l.note || "",
    }));
    for (const pay of pays) {
      if (pay.status !== "paid" || !pay.paidAt) continue;
      rows.push({
        id: `${pay.payRunId}:${id}`,
        at: pay.paidAt,
        amountMinor: pay.totalMinor,
        currency: pay.currency,
        kind: "payout",
        title: `${payMonthLabel(pay.month)} payout`,
        state: "settled",
        status: "Paid",
        reference: pay.reference,
        dealId: null,
        payRunId: pay.payRunId,
        bankLabel: pay.bankLabel,
        carriedBy: "",
        note: "",
      });
    }
    return rows.sort((a, b) => b.at - a.at);
  }

  function counts() {
    const month = payMonth(now());
    const owedMinor = M.ledger.filter((l) => l.status === "earned").reduce((n, l) => n + l.amountMinor, 0);
    return {
      dealsWaiting: M.deals.filter((d) => d.status === "pending").length,
      issuesOpen: M.issues.filter((i) => i.status === "open").length,
      marketersActive: M.marketers.filter((p) => p.status === "active").length,
      owedMinor,
      monthDue: !M.payRuns.some((r) => r.month === month) && owedMinor > 0 ? month : "",
    };
  }

  /** Paid ledger against what the pay runs say went out. */
  function reconcile() {
    const problems = [];
    for (const person of M.marketers) {
      const byLedger = M.ledger
        .filter((l) => l.marketerId === person.id && l.status === "paid")
        .reduce((n, l) => n + l.amountMinor, 0);
      const byRuns = M.payRuns
        .flatMap((r) => r.items)
        .filter((i) => i.marketerId === person.id && i.status === "paid")
        .reduce((n, i) => n + i.totalMinor, 0);
      if (byLedger !== byRuns) {
        problems.push(`${person.displayName} (${person.code}): ledger says ${byLedger}, pay runs say ${byRuns}.`);
      }
    }
    return { ok: problems.length === 0, problems };
  }

  const addLines = (row) => {
    for (const share of row.shares) {
      M.ledger.push({
        id: `ledg_new_${M.ledger.length + 1}`,
        marketerId: share.marketerId,
        dealId: row.id,
        level: share.level,
        kind: "earn",
        amountMinor: share.amountMinor,
        currency: "NGN",
        status: "earned",
        payRunId: null,
        reversesId: null,
        note: "",
        dealTitle: row.listingTitle,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  };

  const alsoClaimed = (row) =>
    M.deals.filter(
      (d) => d.id !== row.id && d.listingId === row.listingId && d.unitKey === row.unitKey && ["pending", "approved"].includes(d.status),
    );

  let uploads = 0;

  /* ─────────────────────────────────────────────────────────── alerts ── */

  const money = (minor, currency = "NGN") =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
  const monthLabel = (month) => {
    const [year, mon] = month.split("-").map(Number);
    return `${new Date(year, mon - 1, 1).toLocaleDateString("en-GB", { month: "long" })} ${year}`;
  };
  const ordinal = (day) => {
    const lastTwo = day % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
    return `${day}${["th", "st", "nd", "rd"][day % 10] || "th"}`;
  };
  const TONE_RANK = { act: 0, "heads-up": 1, good: 2 };

  /** The last day of the month whose run takes money approved at `earnedAt`, as the server works it out. */
  const payDayFor = (earnedAt, clock, cutoffDay) => {
    const earned = new Date(earnedAt);
    const today = new Date(clock);
    const month = Math.max(
      earned.getFullYear() * 12 + earned.getMonth() + (earned.getDate() > cutoffDay ? 1 : 0),
      today.getFullYear() * 12 + today.getMonth(),
    );
    return new Date(Math.floor(month / 12), (month % 12) + 1, 0);
  };

  /**
   * `GET /api/marketing/alerts`, worked out from the fixture the way the repo
   * works it out from the database.
   *
   * The "recent" windows are measured from the fixture's fixed clock, not from
   * today, so the list does not age out from under a recording. Anything written
   * during a run is newer than that clock, so it still counts as recent.
   */
  function alertsOf(id) {
    const p = mkt(id);
    const clock = T0;
    const windowMs = M.settings.issueWindowDays * DAY;
    const out = [];

    if (!p.bank) {
      out.push({ id: "bank-missing", tone: "act", icon: "bank", title: "Add your bank account", body: "We cannot pay you until you do.", detail: "", action: { label: "Add bank account", href: "/m/profile#bank" }, at: p.joinedAt });
    } else if (p.bank.verifiedAt === null) {
      out.push({ id: "bank-unchecked", tone: "heads-up", icon: "bank", title: "Check your bank account", body: `Save the account ending ${p.bank.accountNumber.slice(-4)} again so we can check it.`, detail: "", action: { label: "Check bank account", href: "/m/profile#bank" }, at: p.updatedAt });
    }
    if (p.status === "paused") {
      const phone = M.settings.supportPhone.replace(/\s/g, "");
      out.push({ id: "paused", tone: "act", icon: "shield", title: "Your account is paused", body: "Talk to AV Homes to turn it back on.", detail: (p.statusReason || "").trim(), action: phone ? { label: "Call AV Homes", href: `tel:${phone}` } : { label: "Get help", href: "/m/help" }, at: p.updatedAt });
    }
    for (const d of M.deals.filter((row) => row.reporterId === id && row.status === "info")) {
      out.push({ id: `deal-info:${d.id}`, tone: "act", icon: "photo", title: `${d.listingTitle} needs more info`, body: "Send the proof AV Homes asked for.", detail: (d.reason || "").trim(), action: { label: "Send more proof", href: `/m/deals/${d.id}` }, at: d.reviewedAt || d.updatedAt });
    }
    const open = M.issues.filter((row) => row.marketerId === id && row.status === "open");
    for (const row of open) {
      const last = row.messages[row.messages.length - 1];
      if (!last || last.bySide !== "admin") continue;
      out.push({ id: `issue-reply:${row.id}`, tone: "act", icon: "money", title: `AV Homes replied about ${monthLabel(row.month)}`, body: "Read what they said about your pay.", detail: last.text.trim(), action: { label: "Read the reply", href: `/m/money/${row.payRunId}#thread` }, at: last.at });
    }
    for (const r of M.payRuns) {
      const item = r.items.find((i) => i.marketerId === id);
      if (!item || item.status !== "paid" || item.paidAt === null || clock - item.paidAt > windowMs) continue;
      if (item.issueId && open.some((row) => row.id === item.issueId)) continue;
      const where = item.bank ? `the account ending ${item.bank.accountNumber.slice(-4)}` : "your bank account";
      out.push({ id: `payment-sent:${r.id}`, tone: "good", icon: "money", title: `${money(item.totalMinor, r.currency)} was sent to you`, body: `Your ${monthLabel(r.month)} pay went to ${where}.`, detail: "", action: { label: "See the payment", href: `/m/money/${r.id}` }, at: item.paidAt });
    }
    for (const d of M.deals) {
      if (d.reviewedAt === null || d.reviewedAt < clock - 14 * DAY) continue;
      if (d.status === "approved") {
        const share = d.shares.find((s) => s.marketerId === id);
        if (!share) continue;
        const first = d.reporterName.trim().split(/\s+/)[0] || d.reporterName;
        out.push({ id: `deal-approved:${d.id}`, tone: "good", icon: "check", title: `You earned ${money(share.amountMinor, d.currency)}`, body: d.reporterId === id ? `${d.listingTitle} was approved.` : `Your level ${share.level} share of ${first}'s deal.`, detail: "", action: { label: "See the deal", href: `/m/deals/${d.id}` }, at: d.reviewedAt });
      } else if (d.status === "rejected" && d.reporterId === id) {
        out.push({ id: `deal-refused:${d.id}`, tone: "heads-up", icon: "deals", title: `${d.listingTitle} was not approved`, body: "Read why, so your next report goes through.", detail: (d.reason || "").trim(), action: { label: "See why", href: `/m/deals/${d.id}` }, at: d.reviewedAt });
      }
    }
    if (kids(id).length === 0) {
      out.push({ id: "no-team", tone: "heads-up", icon: "team", title: "Invite your first marketer", body: "Earn a share of every deal they close.", detail: "", action: { label: "Invite someone", href: "/m/invite" }, at: p.joinedAt });
    }
    const waiting = M.ledger.filter((l) => l.marketerId === id && l.status === "earned");
    const total = waiting.reduce((n, l) => n + l.amountMinor, 0);
    if (total > 0) {
      const first = Math.min(...waiting.map((l) => l.createdAt));
      const payDay = payDayFor(first, clock, M.settings.payCutoffDay);
      out.push({ id: "pay-day", tone: "heads-up", icon: "payday", title: `Pay day is ${payDay.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`, body: `${money(total, M.settings.currency)} is waiting for you.`, detail: `Anything approved after the ${ordinal(M.settings.payCutoffDay)} goes out the month after.`, action: { label: "See your money", href: "/m/money" }, at: Math.max(...waiting.map((l) => l.createdAt)) });
    }
    return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.at - a.at);
  }

  /* ────────────────────────────────────────────────────────── updates ── */

  const UPDATE_KEYS = ["title", "body", "imageUrl", "linkLabel", "linkHref", "tone", "pinned", "status", "startsAt", "endsAt"];
  const pickUpdate = (b) => Object.fromEntries(UPDATE_KEYS.filter((k) => b && b[k] !== undefined).map((k) => [k, b[k]]));

  /** `GET /api/marketing/updates`: live written cards, pinned first, then a card per new listing. Eight at most. */
  function feed() {
    const at = now();
    const written = M.updates
      .filter((row) => row.status === "live" && row.startsAt <= at && (row.endsAt === null || row.endsAt > at))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.startsAt - a.startsAt || b.id.localeCompare(a.id))
      .slice(0, 8);
    const linked = new Set(written.map((row) => row.linkHref));
    const cards = M.newListings
      .slice(0, Math.max(0, Math.min(3, 8 - written.length)))
      .map((l) => ({
        id: l.id,
        title: (l.title || "").trim() || "New on AV Homes",
        body: (l.city || "").trim() ? `Just listed in ${l.city.trim()}` : "Just listed on AV Homes",
        imageUrl: l.imageUrl,
        linkLabel: "Share it",
        linkHref: `/m/listings?focus=${encodeURIComponent(l.id)}`,
        tone: "gold",
        pinned: false,
        status: "live",
        startsAt: l.publishedAt,
        endsAt: l.publishedAt + 21 * DAY,
        createdByName: "AV Homes",
        createdAt: l.publishedAt,
        updatedAt: l.publishedAt,
        source: "listing",
      }))
      .filter((card) => !linked.has(card.linkHref));
    return [...written, ...cards].slice(0, 8);
  }

  /** A deal this marketer reported or earns from, with somebody else's buyer taken out. */
  const dealView = (row, who) => ({
    deal: row.reporterId === who ? row : { ...row, buyerName: "", buyerPhone: "" },
    myShare: row.shares.find((s) => s.marketerId === who) || null,
  });

  return [
    /* ───────────────────────────────────────────────────── marketer app ── */
    ["GET", /^\/api\/marketing\/me$/, () => ({
      marketer: me(),
      balance: balanceOf(M.rootId),
      levels: teamOf(M.rootId).levels,
      rates: { sale: M.settings.saleRates, rent: M.settings.rentRates },
      supportPhone: M.settings.supportPhone,
      bankCheck: true,
      isAdmin: me().isAdmin,
      alertCount: alertsOf(M.rootId).filter((a) => a.tone === "act").length,
    })],
    ["GET", /^\/api\/marketing\/alerts$/, () => ({ items: alertsOf(M.rootId) })],
    ["GET", /^\/api\/marketing\/updates$/, () => ({ items: feed() })],
    ["GET", /^\/api\/marketing\/deals\/([^/?]+)$/, (m) => {
      const row = deal(m[1]);
      const mine = row && (row.reporterId === M.rootId || row.shares.some((s) => s.marketerId === M.rootId));
      return mine ? dealView(row, M.rootId) : refuse(404, "not_found");
    }],
    ["POST", /^\/api\/marketing\/deals\/([^/]+)\/resubmit$/, (m, u, b) => {
      const row = deal(m[1]);
      if (!row || row.reporterId !== M.rootId) return refuse(404, "not_found");
      if (row.status !== "info") {
        return refuse(409, "precondition_failed", "This deal is not waiting on anything from you, so there is nothing to send.");
      }
      const previous = row.note.trim();
      const added = ((b && b.note) || "").trim();
      Object.assign(row, {
        status: "pending",
        proof: (b && b.proof) || row.proof,
        note: added === "" ? previous : previous === "" ? added : `${previous}\n\n${added}`,
        updatedAt: now(),
      });
      return dealView(row, M.rootId);
    }],
    ["PATCH", /^\/api\/marketing\/me$/, (m, u, b) => {
      const p = me();
      Object.assign(p, { displayName: b.displayName ?? p.displayName, phone: b.phone ?? p.phone, state: b.state ?? p.state, updatedAt: now() });
      return { marketer: p };
    }],
    ["PUT", /^\/api\/marketing\/me\/bank$/, (m, u, b) => {
      const p = me();
      p.bank = { bankCode: b.bankCode, bankName: b.bankName, accountNumber: b.accountNumber, accountName: accountNameFor(p.displayName), verifiedAt: now() };
      p.updatedAt = now();
      return { marketer: p };
    }],
    ["GET", /^\/api\/marketing\/team$/, () => teamOf(M.rootId)],
    ["GET", /^\/api\/marketing\/deals$/, (m, u) => {
      const team = u.searchParams.get("scope") === "team";
      const rows = M.deals.filter((d) => (team ? d.shares.some((s) => s.marketerId === M.rootId) : d.reporterId === M.rootId));
      const items = rows.map((d) => ({
        ...d,
        myShare: d.shares.find((s) => s.marketerId === M.rootId) || null,
        // Somebody else's buyer is not this marketer's business.
        buyerName: d.reporterId === M.rootId ? d.buyerName : "",
        buyerPhone: d.reporterId === M.rootId ? d.buyerPhone : "",
      }));
      return { items, total: items.length };
    }],
    ["POST", /^\/api\/marketing\/deals\/preview$/, (m, u, b) => {
      const table = b.listingType === "rent" ? M.settings.rentRates : M.settings.saleRates;
      return { amountMinor: Math.floor((b.amountMinor * (table[0] || 0)) / 100), rate: table[0] || 0 };
    }],
    ["POST", /^\/api\/marketing\/deals$/, (m, u, b) => {
      const p = me();
      const row = {
        id: `deal_new_${now().toString(36)}`,
        listingId: b.listingId,
        listingTitle: b.listingTitle,
        listingType: b.listingType,
        listingLocation: b.listingLocation || "",
        listingEstate: b.listingEstate || "",
        unitKey: b.unitKey || "",
        amountMinor: b.amountMinor,
        currency: M.settings.currency,
        buyerName: b.buyerName || "",
        buyerPhone: b.buyerPhone || "",
        proof: b.proof || [],
        note: b.note || "",
        reporterId: p.id,
        reporterName: p.displayName,
        reporterCode: p.code,
        status: "pending",
        reason: "",
        reviewedBy: "",
        reviewedByName: "",
        reviewedAt: null,
        closedOn: b.closedOn || 0,
        shares: [],
        createdAt: now(),
        updatedAt: now(),
      };
      M.deals.unshift(row);
      return { deal: row, alsoClaimed: alsoClaimed(row).length > 0 };
    }],
    ["POST", /^\/api\/marketing\/uploads$/, () => {
      uploads += 1;
      return { url: `/images/library/av-photo-0${((uploads - 1) % 3) + 1}.jpg` };
    }],
    ["GET", /^\/api\/marketing\/money$/, () => ({
      balance: balanceOf(M.rootId),
      lines: ledgerOf(M.rootId, 60),
      payments: payHistoryOf(M.rootId),
      bank: me().bank,
      issueWindowDays: M.settings.issueWindowDays,
      month: payMonth(now()),
    })],
    /* ═══ BUYERS ═══════════════════════════════════════════════════════════ */
    ["GET", /^\/api\/marketing\/leads$/, () => {
      const items = M.leads.filter((l) => l.reporterId === M.rootId).map(withShare);
      return { items, total: items.length };
    }],
    ["POST", /^\/api\/marketing\/leads$/, (m, u, b) => {
      const row = {
        id: "lead_new_" + now().toString(36),
        buyerName: b.buyerName,
        buyerPhone: b.buyerPhone,
        listingId: b.listingId || null,
        listingTitle: b.listingTitle || "",
        wantKind: b.wantKind || null,
        wantArea: b.wantArea || "",
        wantBudgetMinor: b.wantBudgetMinor || 0,
        currency: "NGN",
        brief: b.brief || "",
        reporterId: M.rootId,
        reporterName: me().displayName,
        reporterCode: me().code,
        state: "new",
        events: [{ at: now(), from: "new", to: "new", bySide: "marketer", byName: me().displayName, reason: "Logged by marketer", note: b.brief || "Logged a potential buyer." }],
        dealId: null,
        createdAt: now(),
        updatedAt: now(),
      };
      M.leads.unshift(row);
      return withShare(row);
    }],
    ["GET", /^\/api\/marketing\/leads\/([^/?]+)$/, (m) => withShare(leadOf(m[1]))],
    ["POST", /^\/api\/marketing\/leads\/([^/]+)\/state$/, (m, u, b) => withShare(moveLead(leadOf(m[1]), b.to, b.reason, b.note, "marketer", me().displayName))],
    ["POST", /^\/api\/marketing\/leads\/([^/]+)\/note$/, (m, u, b) => withShare(moveLead(leadOf(m[1]), leadOf(m[1]).state, "", b.note, "marketer", me().displayName))],
    ["GET", /^\/api\/marketing\/statement$/, () => ({ items: statementOf(M.rootId), joinedAt: me().joinedAt })],

    ["GET", /^\/api\/marketing\/issues$/, () => ({ items: M.issues.filter((i) => i.marketerId === M.rootId) })],
    ["POST", /^\/api\/marketing\/issues$/, (m, u, b) => {
      const p = me();
      const r = run(b.payRunId);
      const item = r && r.items.find((i) => i.marketerId === p.id);
      const row = {
        id: `pisu_new_${now().toString(36)}`,
        payRunId: b.payRunId,
        month: r ? r.month : payMonth(now()),
        marketerId: p.id,
        marketerName: p.displayName,
        code: p.code,
        amountMinor: item ? item.totalMinor : 0,
        currency: M.settings.currency,
        status: "open",
        messages: [{ at: now(), byName: p.displayName, bySide: "marketer", text: b.text || "I did not get this money.", proof: [] }],
        createdAt: now(),
        updatedAt: now(),
        resolvedAt: null,
      };
      if (item) item.issueId = row.id;
      M.issues.unshift(row);
      return { issue: row };
    }],
    ["POST", /^\/api\/marketing\/issues\/([^/]+)\/reply$/, (m, u, b) => {
      const row = issue(m[1]);
      row.messages.push({ at: now(), byName: me().displayName, bySide: "marketer", text: b.text, proof: [] });
      row.updatedAt = now();
      return { issue: row };
    }],
    ["POST", /^\/api\/marketing\/issues\/([^/]+)\/close$/, (m) => {
      const row = issue(m[1]);
      row.messages.push({ at: now(), byName: me().displayName, bySide: "marketer", text: "Got it now, thank you.", proof: [] });
      Object.assign(row, { status: "resolved", resolvedAt: now(), updatedAt: now() });
      return { issue: row };
    }],

    /* ──────────────────────────────────────────────────────────── public ── */
    ["GET", /^\/api\/public\/marketing\/join$/, (m, u) => {
      const code = u.searchParams.get("code") || "";
      const referrer = M.marketers.find((p) => p.code === code && p.status === "active");
      return {
        open: M.settings.joinOpen,
        supportPhone: M.settings.supportPhone,
        rates: M.settings.saleRates,
        bankCheck: true,
        referrer: referrer ? { code: referrer.code, displayName: referrer.displayName } : null,
      };
    }],
    ["GET", /^\/api\/public\/marketing\/banks$/, () => ({ banks: M.banks, checked: true })],
    ["POST", /^\/api\/public\/marketing\/resolve-account$/, (m, u, b) => {
      const known = M.marketers.find((p) => p.bank && p.bank.accountNumber === b.accountNumber);
      return { accountName: known ? known.bank.accountName : "ADEOLA MARTINS OYEDEPO", checked: true };
    }],
    /*
     * Joining, as the repo does it: under the inviter when they are active, under the root
     * otherwise, with the next code. The route signs the new person in, so the app's own
     * reads answer for them from here on.
     */
    ["POST", /^\/api\/public\/marketing\/join$/, (m, u, b) => {
      const at = now();
      const inviter = M.marketers.find((p) => p.code === String(b.referrerCode || "").toUpperCase() && p.status === "active");
      const parent = inviter || mkt("mkt_av0001");
      const code = `AV-${String(M.marketers.length + 1).padStart(4, "0")}`;
      const known = b.bank ? M.marketers.find((p) => p.bank && p.bank.accountNumber === b.bank.accountNumber) : null;
      const row = {
        id: `mkt_${code.toLowerCase().replace("-", "")}`,
        userId: `usr_${code.toLowerCase().replace("-", "")}`,
        code,
        displayName: String(b.displayName || "").trim(),
        email: String(b.email || "").trim().toLowerCase(),
        phone: String(b.phone || "").trim(),
        state: String(b.state || "").trim(),
        status: "active",
        statusReason: "",
        parentId: parent.id,
        upline: [parent.id, ...parent.upline].slice(0, 2),
        bank: b.bank
          ? { bankCode: b.bank.bankCode, bankName: b.bank.bankName, accountNumber: b.bank.accountNumber, accountName: known ? known.bank.accountName : "ADEOLA MARTINS OYEDEPO", verifiedAt: at }
          : null,
        isAdmin: false,
        joinedAt: at,
        createdAt: at,
        updatedAt: at,
      };
      M.marketers.push(row);
      M.rootId = row.id;
      return { marketer: row };
    }],

    /* ───────────────────────────────────────────────────────────── admin ── */
    ["GET", /^\/api\/admin\/marketing\/counts$/, () => ({ counts: counts() })],
    ["GET", /^\/api\/admin\/marketing\/settings$/, () => ({ settings: M.settings, bankCheck: true, paystackKeySaved: false })],
    /* The console's one-tap account check. Answers the way the real provider
       does: a name back, and whether it looks like the marketer's. */
    ["POST", /^\/api\/admin\/marketing\/marketers\/([^/]+)\/verify-bank$/, (m) => {
      const p = mkt(m[1]);
      if (!p || !p.bank) return { found: false, matches: false, accountName: "", detail: "This marketer has not added a bank account yet." };
      const shares = (a, b) => {
        const w = (v) => new Set(String(v).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((x) => x.length > 1));
        const A = w(a), B = w(b);
        let n = 0;
        for (const x of B) if (A.has(x)) n += 1;
        return n >= Math.min(2, B.size);
      };
      const name = p.bank.accountName || `${p.displayName.toUpperCase()}`;
      p.bank = { ...p.bank, accountName: name, verifiedAt: now() };
      return { marketer: p, found: true, accountName: name, matches: shares(name, p.displayName), detail: "" };
    }],
    ["PATCH", /^\/api\/admin\/marketing\/settings$/, (m, u, b) => {
      Object.assign(M.settings, b, { updatedAt: now() });
      return { settings: M.settings };
    }],
    ["GET", /^\/api\/admin\/marketing\/marketers\/([^/?]+)$/, (m) => {
      const p = mkt(m[1]);
      const team = teamOf(p.id);
      return {
        marketer: p,
        balance: balanceOf(p.id),
        levels: team.levels,
        members: team.members,
        upline: chainOf(p.id).slice(1),
        deals: M.deals.filter((d) => d.reporterId === p.id),
        lines: ledgerOf(p.id, 25),
        payments: payHistoryOf(p.id),
      };
    }],
    ["GET", /^\/api\/admin\/marketing\/marketers$/, (m, u) => {
      const status = u.searchParams.get("status");
      const q = u.searchParams.get("q") || "";
      const items = M.marketers.filter((p) => (!status || p.status === status) && hit(p, q));
      return { items, total: items.length };
    }],
    ["POST", /^\/api\/admin\/marketing\/marketers\/([^/]+)\/status$/, (m, u, b) => {
      const p = mkt(m[1]);
      Object.assign(p, { status: b.status, statusReason: b.reason || "", updatedAt: now() });
      return { marketer: p };
    }],
    ["GET", /^\/api\/admin\/marketing\/deals\/([^/?]+)$/, (m) => {
      const row = deal(m[1]);
      return {
        deal: row,
        shares: row.status === "approved" ? row.shares : split(row.amountMinor, row.listingType, row.reporterId),
        alsoClaimed: alsoClaimed(row),
        rates: M.settings,
      };
    }],
    ["GET", /^\/api\/admin\/marketing\/leads\/([^/?]+)$/, (m) => leadOf(m[1])],
    ["GET", /^\/api\/admin\/marketing\/leads$/, (m, u) => {
      const state = u.searchParams.get("state");
      const q = u.searchParams.get("q") || "";
      const counts = {};
      for (const l of M.leads) counts[l.state] = (counts[l.state] || 0) + 1;
      const items = M.leads.filter((l) => (!state || l.state === state) && hit(l, q));
      return { items, total: items.length, counts };
    }],
    ["POST", /^\/api\/admin\/marketing\/leads\/([^/]+)\/state$/, (m, u, b) => moveLead(leadOf(m[1]), b.to, b.reason, b.note, "admin", S.owner.displayName)],
    ["POST", /^\/api\/admin\/marketing\/leads\/([^/]+)\/convert$/, (m, u, b) => {
      const row = leadOf(m[1]);
      row.dealId = "deal_from_" + row.id;
      return { lead: moveLead(row, "won", b.reason, b.note, "admin", S.owner.displayName), dealId: row.dealId };
    }],
    ["GET", /^\/api\/admin\/marketing\/deals$/, (m, u) => {
      const status = u.searchParams.get("status");
      const q = u.searchParams.get("q") || "";
      const items = M.deals.filter((d) => (!status || d.status === status) && hit(d, q));
      return { items, total: items.length };
    }],
    ["POST", /^\/api\/admin\/marketing\/deals\/([^/]+)\/review$/, (m, u, b) => {
      const row = deal(m[1]);
      if (b.status !== "approved") {
        Object.assign(row, { status: b.status, reason: b.reason || "", reviewedBy: S.owner.id, reviewedByName: S.owner.displayName, reviewedAt: now(), updatedAt: now() });
        return { deal: row };
      }
      const amountMinor = b.amountMinor || row.amountMinor;
      Object.assign(row, {
        status: "approved",
        amountMinor,
        reason: b.reason || "",
        shares: split(amountMinor, row.listingType, row.reporterId),
        reviewedBy: S.owner.id,
        reviewedByName: S.owner.displayName,
        reviewedAt: now(),
        updatedAt: now(),
      });
      addLines(row);
      return { deal: row };
    }],
    ["POST", /^\/api\/admin\/marketing\/deals\/([^/]+)\/cancel$/, (m, u, b) => {
      const row = deal(m[1]);
      Object.assign(row, { status: "cancelled", reason: b.reason || "", reviewedBy: S.owner.id, reviewedByName: S.owner.displayName, reviewedAt: now(), updatedAt: now() });
      for (const line of M.ledger) {
        if (line.dealId === row.id && line.status === "earned") line.status = "void";
      }
      return { deal: row };
    }],
    ["GET", /^\/api\/admin\/marketing\/pay-runs\/([^/?]+)$/, (m) => ({ run: run(m[1]), check: reconcile() })],
    ["GET", /^\/api\/admin\/marketing\/pay-runs$/, () => ({
      items: [...M.payRuns].sort((a, b) => b.month.localeCompare(a.month)),
      counts: counts(),
      settings: M.settings,
    })],
    ["POST", /^\/api\/admin\/marketing\/pay-runs$/, (m, u, b) => {
      const month = (b && b.month) || payMonth(now());
      const open = M.ledger.filter((l) => l.status === "earned");
      const totals = new Map();
      for (const line of open) totals.set(line.marketerId, (totals.get(line.marketerId) || 0) + line.amountMinor);
      const items = [];
      for (const [id, total] of totals) {
        const p = mkt(id);
        if (!p || p.status === "banned" || total <= 0 || total < M.settings.minPayoutMinor) continue;
        items.push({ marketerId: id, code: p.code, displayName: p.displayName, totalMinor: total, bank: p.bank, status: "pending", proof: [], reference: "", paidAt: null, paidByName: "", issueId: null, note: "" });
        for (const line of open) {
          if (line.marketerId !== id) continue;
          line.status = "scheduled";
          line.payRunId = `prun_${month.replace("-", "_")}`;
          line.updatedAt = now();
        }
      }
      items.sort((a, b2) => b2.totalMinor - a.totalMinor);
      const existing = M.payRuns.find((r) => r.month === month);
      const row = {
        id: existing ? existing.id : `prun_${month.replace("-", "_")}`,
        month,
        status: "draft",
        currency: M.settings.currency,
        totalMinor: items.reduce((n, i) => n + i.totalMinor, 0),
        paidMinor: 0,
        items,
        createdByName: S.owner.displayName,
        createdAt: existing ? existing.createdAt : now(),
        updatedAt: now(),
        closedAt: null,
      };
      if (existing) M.payRuns[M.payRuns.indexOf(existing)] = row;
      else M.payRuns.unshift(row);
      return { run: row };
    }],
    ["POST", /^\/api\/admin\/marketing\/pay-runs\/([^/]+)\/pay$/, (m, u, b) => {
      const r = run(m[1]);
      const item = r.items.find((i) => i.marketerId === b.marketerId);
      if (item.status !== "paid") r.paidMinor += item.totalMinor;
      Object.assign(item, { status: "paid", proof: b.proof || [], reference: b.reference || "", paidAt: now(), paidByName: S.owner.displayName });
      if (r.status === "draft") r.status = "paying";
      for (const line of M.ledger) {
        if (line.payRunId === r.id && line.marketerId === b.marketerId && line.status === "scheduled") line.status = "paid";
      }
      r.updatedAt = now();
      return { run: r };
    }],
    ["POST", /^\/api\/admin\/marketing\/pay-runs\/([^/]+)\/hold$/, (m, u, b) => {
      const r = run(m[1]);
      const item = r.items.find((i) => i.marketerId === b.marketerId);
      Object.assign(item, { status: "held", note: b.note || "" });
      // Held money goes back to waiting rather than sitting in a run nobody pays.
      for (const line of M.ledger) {
        if (line.payRunId === r.id && line.marketerId === b.marketerId && line.status === "scheduled") {
          line.status = "earned";
          line.payRunId = null;
        }
      }
      r.updatedAt = now();
      return { run: r };
    }],
    ["POST", /^\/api\/admin\/marketing\/pay-runs\/([^/]+)\/close$/, (m) => {
      const r = run(m[1]);
      Object.assign(r, { status: "closed", closedAt: now(), updatedAt: now() });
      return { run: r };
    }],
    ["GET", /^\/api\/admin\/marketing\/issues$/, (m, u) => {
      const status = u.searchParams.get("status");
      return { items: M.issues.filter((i) => !status || i.status === status) };
    }],
    ["POST", /^\/api\/admin\/marketing\/issues\/([^/]+)\/reply$/, (m, u, b) => {
      const row = issue(m[1]);
      row.messages.push({ at: now(), byName: S.owner.displayName, bySide: "admin", text: b.text, proof: b.proof || [] });
      row.updatedAt = now();
      return { issue: row };
    }],
    ["POST", /^\/api\/admin\/marketing\/issues\/([^/]+)\/resolve$/, (m, u, b) => {
      const row = issue(m[1]);
      row.messages.push({ at: now(), byName: S.owner.displayName, bySide: "admin", text: (b && b.text) || "Sorted.", proof: [] });
      Object.assign(row, { status: "resolved", resolvedAt: now(), updatedAt: now() });
      return { issue: row };
    }],
    ["GET", /^\/api\/admin\/marketing\/updates$/, () => ({
      items: [...M.updates].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)),
    })],
    ["POST", /^\/api\/admin\/marketing\/updates$/, (m, u, b) => {
      const at = now();
      const row = {
        id: `upd_new_${at.toString(36)}`,
        title: "",
        body: "",
        imageUrl: "",
        linkLabel: "",
        linkHref: "",
        tone: "wine",
        pinned: false,
        status: "draft",
        startsAt: 0,
        endsAt: null,
        ...pickUpdate(b),
        createdByName: S.owner.displayName,
        createdAt: at,
        updatedAt: at,
        source: "admin",
      };
      // 0 is "from now", as the route reads it.
      if (!row.startsAt) row.startsAt = at;
      M.updates.unshift(row);
      return { update: row };
    }],
    ["PATCH", /^\/api\/admin\/marketing\/updates\/([^/?]+)$/, (m, u, b) => {
      const row = M.updates.find((x) => x.id === m[1]);
      if (!row) return refuse(404, "not_found");
      Object.assign(row, pickUpdate(b), { updatedAt: now() });
      if (!row.startsAt) row.startsAt = now();
      return { update: row };
    }],
    ["DELETE", /^\/api\/admin\/marketing\/updates\/([^/?]+)$/, (m) => {
      const index = M.updates.findIndex((x) => x.id === m[1]);
      if (index < 0) return refuse(404, "not_found");
      M.updates.splice(index, 1);
      return { ok: true };
    }],
  ];
}

/*
 * A handler's refusal, carried as a symbol so it never reaches the JSON body.
 * Without it every mocked route answered 200, and a screen's not-found and
 * already-decided states could not be captured at all.
 */
const STATUS = Symbol("status");

function refuse(status, error, detail) {
  return { [STATUS]: status, error, ...(detail ? { detail } : {}) };
}

/** The status and body to answer a mocked request with. */
function answer(out) {
  return { status: (out && out[STATUS]) || 200, contentType: "application/json", body: JSON.stringify(out) };
}

/**
 * Which requests the mock answers.
 *
 * Public pages are served for real, except the marketer's join and bank
 * lookups: those need fixtures rather than the empty list a site with no
 * Paystack key answers with.
 */
function shouldMock(u, origin = BASE) {
  if (u.origin !== origin || !u.pathname.startsWith("/api/")) return false;
  if (!u.pathname.startsWith("/api/public/")) return true;
  return u.pathname.startsWith("/api/public/marketing/");
}

// A drawn cursor, because a headless capture has none. Driven by the recorder rather than
// by mousemove, so it also tracks over same-origin iframes, where the top document sees none.
// A phone recording sets window.__recPhone first: a fingertip dot instead of an arrow, since
// a phone has no pointer.
const CURSOR_JS = `(() => {
  const phone = window.__recPhone === true;
  let at = { x: -100, y: -100 };
  const place = (scale) => phone
    ? "translate(" + (at.x - 17) + "px," + (at.y - 17) + "px) scale(" + scale + ")"
    : "translate(" + (at.x - 4) + "px," + (at.y - 2) + "px)";
  const install = () => {
    if (document.getElementById("__rec_cursor") || !document.documentElement) return;
    const s = document.createElement("style");
    s.textContent = phone
      ? "#__rec_cursor{position:fixed;left:0;top:0;width:34px;height:34px;box-sizing:border-box;border-radius:999px;background:rgb(255 255 255/.34);border:2.5px solid rgb(255 255 255/.95);filter:drop-shadow(0 0 1px rgb(20 6 10/.6)) drop-shadow(0 3px 8px rgb(20 6 10/.5));z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:opacity .18s ease}#__rec_ring{position:fixed;left:0;top:0;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:999px;border:3px solid rgb(255 255 255/.9);z-index:2147483646;pointer-events:none;opacity:0}nextjs-portal,[data-nextjs-toast]{display:none!important}"
      : "#__rec_cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 4px rgb(28 18 20/.45))}#__rec_ring{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:999px;border:2.5px solid #b45069;z-index:2147483646;pointer-events:none;opacity:0}nextjs-portal,[data-nextjs-toast]{display:none!important}";
    document.documentElement.appendChild(s);
    document.documentElement.setAttribute("spellcheck", "false");
    const c = document.createElement("div");
    c.id = "__rec_cursor";
    if (!phone) c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2.5 4 18.5 8.3 15 10.8 20.6 13.2 19.6 10.7 14.1 16.6 14.1 Z" fill="#1c1214" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const r = document.createElement("div");
    r.id = "__rec_ring";
    document.documentElement.appendChild(r);
    document.documentElement.appendChild(c);
  };
  window.__recSet = (x, y) => { install(); at = { x, y }; const c = document.getElementById("__rec_cursor"); if (c) c.style.transform = place(1); };
  window.__recRing = (x, y) => {
    install();
    const r = document.getElementById("__rec_ring");
    if (!r) return;
    r.style.left = x + "px";
    r.style.top = y + "px";
    r.animate([{ opacity: 0.9, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.15)" }], { duration: 420, easing: "ease-out" });
    const c = document.getElementById("__rec_cursor");
    if (phone && c) c.animate([{ transform: place(1) }, { transform: place(0.78) }, { transform: place(1) }], { duration: 300, easing: "ease-out" });
  };
  window.__recHideCursor = (hide) => { install(); const c = document.getElementById("__rec_cursor"); if (c) c.style.opacity = hide ? "0" : "1"; };
  if (document.readyState !== "loading") install(); else document.addEventListener("DOMContentLoaded", install);
  // Image uploads answer with the uploaded blob itself, so a note's thumbnail is the real capture.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const bare = String(url).split("?")[0];
    const upload = bare.endsWith("/api/admin/images") || (phone && bare.endsWith("/api/marketing/uploads"));
    if (upload && init && init.method === "POST" && init.body instanceof FormData) {
      const file = init.body.get("file");
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      if (bare.endsWith("/api/marketing/uploads")) {
        return new Response(JSON.stringify({ url: dataUrl }), { status: 201, headers: { "content-type": "application/json" } });
      }
      const image = { id: "img_up_" + Date.now().toString(36), url: dataUrl, alt: String(init.body.get("alt") || ""), contentType: file.type || "image/png", width: 1600, height: 900, bytes: file.size || 0, createdAt: Date.now(), uploadedBy: "rec" };
      return new Response(JSON.stringify({ image }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  };
  // A phone's share sheet and WhatsApp are outside the page and cannot be filmed. The message
  // the app hands them is kept for the video instead, and the app stays on screen.
  if (phone) {
    const keep = (kind, data) => { try { if (window.__recShare) window.__recShare(JSON.stringify(Object.assign({ kind, path: location.pathname }, data))); } catch (e) {} };
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      writable: true,
      value: function (data) {
        keep("share", { title: (data && data.title) || "", text: (data && data.text) || "", url: (data && data.url) || "" });
        return new Promise((res) => setTimeout(res, 300));
      },
    });
    const realOpen = window.open.bind(window);
    window.open = function (target, name, features) {
      if (String(target).startsWith("https://wa.me/")) { keep("whatsapp", { url: String(target) }); return null; }
      return realOpen(target, name, features);
    };
  }
})();`;

/**
 * Serves BASE under a public origin, for a scenario whose screen prints its own address
 * (the invite link, a shared listing): the phone app then shows the live host, not
 * localhost. Chrome maps the host to a loopback TLS proxy with a throwaway certificate.
 * The proxy rewrites Host and Origin because the dev server refuses dev assets and its
 * HMR socket from any other origin, and the app does not hydrate without that socket.
 */
async function servePublicOrigin(origin) {
  const https = require("https");
  const http = require("http");
  const net = require("net");
  const os = require("os");
  const { execFileSync } = require("child_process");
  const host = new URL(origin).hostname;
  const local = new URL(BASE);
  // Kept outside the repo: a certificate never belongs in the tree.
  const dir = path.join(os.tmpdir(), `avh-rec-${host}`);
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(process.env.OPENSSL || "openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "30", "-subj", `/CN=${host}`, "-addext", `subjectAltName=DNS:${host}`], { stdio: "ignore" });
  }
  const toLocal = (headers) => {
    const out = { ...headers, host: local.host };
    if (out.origin) out.origin = local.origin;
    if (out.referer) out.referer = out.referer.replace(origin, local.origin);
    return out;
  };
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const up = http.request({ hostname: local.hostname, port: local.port, method: req.method, path: req.url, headers: toLocal(req.headers) }, (reply) => {
      const headers = { ...reply.headers };
      if (headers.location) headers.location = headers.location.replace(local.origin, origin);
      res.writeHead(reply.statusCode, headers);
      reply.pipe(res);
    });
    up.on("error", () => res.destroy());
    req.pipe(up);
  });
  server.on("upgrade", (req, socket, head) => {
    const up = net.connect(Number(local.port), local.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(toLocal(req.headers)).map(([k, v]) => `${k}: ${v}`), "", ""];
      up.write(lines.join("\r\n"));
      if (head && head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin, host, port: server.address().port, close: () => server.close() };
}

async function main() {
  const name = process.argv[2];
  const scenario = require(path.join(__dirname, "scenarios", name + ".cjs"));
  const S = await fixtures();
  if (scenario.prepare) scenario.prepare(S);
  const view = { ...DESKTOP, ...(scenario.viewport || {}) };
  const VW = Math.round(view.width * view.dpr);
  const VH = Math.round(view.height * view.dpr);
  const routes = mockApi(S);
  // `origin` on a scenario: record the app as served from that public address.
  const site = scenario.origin ? await servePublicOrigin(scenario.origin) : null;
  const ORIGIN = site ? site.origin : BASE;
  const args = ["--no-first-run", "--hide-scrollbars", "--disable-features=Translate"];
  if (site) args.push(`--host-resolver-rules=MAP ${site.host} 127.0.0.1:${site.port}`, "--ignore-certificate-errors");
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: true,
    args,
  });
  const tab = await browser.newPage();
  await tab.setViewport({
    width: view.width,
    height: view.height,
    deviceScaleFactor: view.dpr,
    isMobile: view.mobile,
    hasTouch: view.mobile,
  });
  // What the app handed a share sheet or WhatsApp, for the video to show.
  const shared = [];
  // Same phone identity qa.cjs uses, so the app makes the same choices on camera.
  if (view.mobile) {
    await tab.setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
    );
    await tab.exposeFunction("__recShare", (json) => {
      const item = { ...JSON.parse(json), at: +((Date.now() - t0) / 1000).toFixed(2) };
      shared.push(item);
      console.log("shared", item.kind, item.url || "");
    });
    await tab.evaluateOnNewDocument("window.__recPhone = true;");
    // A phone lets the app copy a code; headless refuses unless told, and the Copied tick never shows.
    await browser.defaultBrowserContext().overridePermissions(ORIGIN, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]).catch((e) => console.log("clipboard permission", e.message));
  }
  await tab.evaluateOnNewDocument(CURSOR_JS);
  tab.on("pageerror", (e) => console.log("PAGEERROR", String(e.message || e).slice(0, 300)));
  tab.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
  tab.on("dialog", (d) => { console.log("DIALOG", d.type(), d.message().slice(0, 80)); d.accept().catch(() => {}); });
  await tab.setRequestInterception(true);
  tab.on("request", (rq) => {
    const u = new URL(rq.url());
    // `demoListings`: the live list, cut to the demo's own homes as the seeded demo database
    // holds them, so a test listing in the dev database never reaches the footage.
    if (scenario.demoListings && rq.method() === "GET" && u.origin === ORIGIN && u.pathname === "/api/public/properties") {
      fetch(BASE + u.pathname + u.search)
        .then((r) => r.json())
        .then((list) => rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...list, items: list.items.filter((p) => String(p.id).startsWith("demo_")) }) }))
        .catch(() => rq.continue().catch(() => {}));
      return;
    }
    if (!shouldMock(u, ORIGIN)) return rq.continue();
    let body = null;
    try {
      body = rq.postData() ? JSON.parse(rq.postData()) : null;
    } catch {
      body = null;
    }
    for (const [method, re, fn] of routes) {
      const m = u.pathname.match(re);
      if (m && rq.method() === method) return rq.respond(answer(fn(m, u, body)));
    }
    console.log("UNMOCKED", rq.method(), u.pathname + u.search);
    return rq.respond({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
  });

  let cur = { x: view.width * 0.62, y: view.height * 0.55 };
  let t0 = Date.now();
  const marks = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const findEl = async (sel) => {
    for (const f of tab.frames()) {
      if (f.detached) continue;
      try {
        const h = await f.$(sel);
        if (h) return { f, h };
      } catch {
        // A frame can detach between listing and querying (the studio swaps its iframe).
      }
    }
    return null;
  };
  const setCursor = (x, y) => tab.evaluate((a, b) => window.__recSet && window.__recSet(a, b), x, y).catch(() => {});
  // When the picture should be changing, and the longest frame gap that is still smooth there.
  const busy = [];
  const during = async (gap, work) => {
    const from = (Date.now() - t0) / 1000;
    try {
      return await work();
    } finally {
      busy.push([from, (Date.now() - t0) / 1000, gap]);
    }
  };

  const api = {
    tab,
    S,
    sleep,
    mark: (k) => {
      marks[k] = +((Date.now() - t0) / 1000).toFixed(2);
      console.log("mark", k, marks[k]);
    },
    goto: async (p) => {
      await tab.goto(ORIGIN + p, { waitUntil: "networkidle2", timeout: 120000 });
      await tab.evaluate(async () => { for (const img of Array.from(document.images)) { if (!img.complete) await new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 4000); }); } }).catch(() => {});
      await setCursor(cur.x, cur.y);
    },
    waitFor: async (sel, timeout = 30000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await findEl(sel)) return;
        await sleep(120);
      }
      throw new Error("timed out waiting for " + sel);
    },
    cursorTo: (x, y, ms = 700) => during(0.15, async () => {
      const from = { ...cur };
      const n = Math.max(8, Math.round(ms / 22));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const x1 = from.x + (x - from.x) * e;
        const y1 = from.y + (y - from.y) * e;
        await tab.mouse.move(x1, y1);
        await setCursor(x1, y1);
      }
      cur = { x, y };
    }),
    box: async (sel) => {
      const hit = await findEl(sel);
      if (!hit) throw new Error("not found: " + sel);
      await hit.h.evaluate((el) => el.scrollIntoView({ block: "nearest", behavior: "instant" }));
      return hit.h.boundingBox();
    },
    moveTo: async (sel, ms, dx = 0.5, dy = 0.5) => {
      const b = await api.box(sel);
      await api.cursorTo(b.x + b.width * dx, b.y + b.height * dy, ms);
      return b;
    },
    click: async (sel, ms = 750, dx, dy) => {
      await api.moveTo(sel, ms, dx, dy);
      await sleep(160);
      await tab.evaluate((x, y) => window.__recRing && window.__recRing(x, y), cur.x, cur.y);
      await tab.mouse.down();
      await sleep(70);
      await tab.mouse.up();
      await sleep(240);
    },
    hideCursor: (hide = true) => tab.evaluate((h) => window.__recHideCursor && window.__recHideCursor(h), hide).catch(() => {}),
    type: (text, delay = 40) => during((2.2 * delay + 90) / 1000, async () => {
      for (const ch of text) {
        if (ch === "\n") await tab.keyboard.press("Enter");
        else await tab.keyboard.type(ch);
        await sleep(delay + ((ch.charCodeAt(0) * 7) % 23));
      }
    }),
    // Long copy: a word at a time via insertText, which reads as quick typing without
    // paying a keystroke round trip per character.
    typeFast: (text, perWordMs = 55) => during((2.2 * perWordMs + 90) / 1000, async () => {
      for (const w of text.match(/\S+\s*/g) || []) {
        await tab.keyboard.sendCharacter(w);
        await sleep(perWordMs);
      }
    }),
    clearAndType: async (sel, text, delay) => {
      await api.click(sel);
      await tab.keyboard.down("Control");
      await tab.keyboard.press("KeyA");
      await tab.keyboard.up("Control");
      await tab.keyboard.press("Backspace");
      await api.type(text, delay);
    },
    scrollBy: (dy, ms = 900) => during(0.15, async () => {
      await tab.evaluate(async (d, t) => {
        const m = document.querySelector(".c-main") || document.scrollingElement;
        // The site sets html { scroll-behavior: smooth }, which turns every step below into
        // its own glide that is still moving when the next tap lands. The phone app scrolls
        // the document, so its takes step the position directly.
        const was = m.style.scrollBehavior;
        if (window.__recPhone) m.style.scrollBehavior = "auto";
        const s = m.scrollTop;
        const st = performance.now();
        await new Promise((res) => {
          const f = (n) => {
            const k = Math.min(1, (n - st) / t);
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            m.scrollTop = s + d * e;
            if (k < 1) requestAnimationFrame(f);
            else res();
          };
          requestAnimationFrame(f);
        });
        if (window.__recPhone) m.style.scrollBehavior = was;
      }, dy, ms);
    }),
    drag: async (x1, y1, x2, y2, ms = 900) => {
      await api.cursorTo(x1, y1, 600);
      await sleep(150);
      await tab.mouse.down();
      await api.cursorTo(x2, y2, ms);
      await tab.mouse.up();
      await sleep(250);
    },
    // Scrolls the first same-origin iframe (the customize studio frames the live site).
    scrollFrame: async (dy, ms = 1200) => {
      const f = tab.frames().find((fr) => fr !== tab.mainFrame() && fr.url().startsWith(ORIGIN));
      if (!f) throw new Error("no same-origin frame");
      await f.evaluate(async (d, t) => {
        const m = document.scrollingElement;
        const s = m.scrollTop;
        const st = performance.now();
        await new Promise((res) => {
          const step = (n) => {
            const k = Math.min(1, (n - st) / t);
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            m.scrollTop = s + d * e;
            if (k < 1) requestAnimationFrame(step);
            else res();
          };
          requestAnimationFrame(step);
        });
      }, dy, ms);
    },
    // Hides dev-only chrome inside child frames too; addScriptToEvaluateOnNewDocument misses them.
    cleanFrames: async () => {
      for (const f of tab.frames()) {
        if (f === tab.mainFrame() || f.detached) continue;
        await f.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast]{display:none!important}" }).catch(() => {});
      }
    },
    // The public site's consent banner, answered with Reject. The choice persists for the run.
    dismissCookies: () =>
      tab.$$eval("button", (bs) => {
        const b = bs.find((x) => /^\s*reject\s*$/i.test(x.textContent || ""));
        if (b) b.click();
      }).catch(() => {}),
    shot: (n) => tab.screenshot({ path: path.join(REPO, "videos/_captures", `step-${name}-${n}.png`) }),
  };

  if (scenario.before) await scenario.before(api);
  const outDir = path.join(REPO, "videos", scenario.dir, "assets");
  fs.mkdirSync(outDir, { recursive: true });
  const record = process.env.NO_RECORD !== "1";

  // Straight from the compositor at device pixels (the stage times its scale). Puppeteer's
  // own screencast caps frames at CSS pixels, which would upscale soft text into the video.
  const frameDir = path.join(outDir, ".frames");
  const frames = [];
  let cdp = null;
  let pending = [];
  // A frame can still arrive after the screencast stops, when its folder is already gone.
  let stopped = false;
  if (record) {
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    cdp = await tab.createCDPSession();
    cdp.on("Page.screencastFrame", (f) => {
      if (stopped) return;
      const file = path.join(frameDir, `f${String(frames.length).padStart(6, "0")}.jpg`);
      frames.push({ ts: f.metadata.timestamp, file });
      pending.push(fs.promises.writeFile(file, Buffer.from(f.data, "base64")));
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
    await sleep(300);
  }
  t0 = Date.now();
  // Moves made while warming up are not part of the take.
  busy.length = 0;
  await scenario.run(api);
  api.mark("end");
  const tEnd = Date.now();
  if (record) {
    await sleep(200);
    await cdp.send("Page.stopScreencast");
    stopped = true;
    await Promise.all(pending);
    // Constant 30fps: each tick shows the newest frame at or before it.
    const lines = ["ffconcat version 1.0"];
    const fps = 30;
    const total = Math.round(((tEnd - t0) / 1000) * fps);
    let j = 0;
    for (let k = 0; k < total; k++) {
      const t = t0 / 1000 + k / fps;
      while (j + 1 < frames.length && frames[j + 1].ts <= t) j++;
      lines.push(`file '${path.basename(frames[j].file)}'`, `duration ${(1 / fps).toFixed(6)}`);
    }
    lines.push(`file '${path.basename(frames[j].file)}'`);
    fs.writeFileSync(path.join(frameDir, "list.ffconcat"), lines.join("\n"));
    const out = path.join(outDir, "footage.mp4");
    const { execFileSync } = require("child_process");
    execFileSync(process.env.FFMPEG, ["-hide_banner", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(frameDir, "list.ffconcat"),
      "-vf", `scale=${VW}:${VH}:flags=lanczos,fps=${fps}`, "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
    fs.rmSync(frameDir, { recursive: true, force: true });
    console.log(`wrote ${out} (${frames.length} source frames, ${total} output frames)`);
    // The picture holding still for longer than a move allows, while the cursor, a scroll or
    // typing was moving, is a stall. A still screen before or after a move is not.
    const stalls = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].ts - t0 / 1000;
      const b = frames[i].ts - t0 / 1000;
      const held = Math.max(0, ...busy.map(([s, e]) => Math.min(b, e) - Math.max(a, s)));
      if (busy.some(([s, e, gap]) => Math.min(b, e) - Math.max(a, s) > gap)) {
        stalls.push(`${a.toFixed(2)}s held ${Math.round(held * 1000)}ms`);
      }
    }
    console.log(stalls.length ? `STALLS ${stalls.length}: ${stalls.join(", ")}` : "no stalls while moving");
  }
  fs.writeFileSync(path.join(outDir, "marks.json"), JSON.stringify(marks, null, 2));
  if (shared.length) fs.writeFileSync(path.join(outDir, "shared.json"), JSON.stringify(shared, null, 2));
  await browser.close();
  if (site) site.close();
  if (!record) console.log("dry run done");
}

module.exports = { fixtures, mockApi, shouldMock, answer, CURSOR_JS, BASE };

if (require.main === module) {
  main().catch((e) => {
    console.error("ERR", e.stack || e);
    process.exit(1);
  });
}
