// Video 16: a marketer sent us somebody who might buy. Pick the first one nobody has called,
// read what the marketer wrote, and move it along the line twice, each move with a reason and
// words. The point of the take is that both are compulsory and both land on the marketer's
// phone: there is no admin-only note anywhere on this screen.
const F = (label, tag = "input") => `::-p-xpath(//label[.//span[normalize-space()='${label}']]//${tag})`;
const BTN = (text) => `::-p-xpath(//button[normalize-space()='${text}'])`;
const CHIP = (text) => `::-p-xpath(//div[@role='group']//button[normalize-space()='${text}'])`;
const ROW = (name) => `::-p-xpath(//tr[.//*[normalize-space()='${name}']])`;
const TAB = (label) => `::-p-xpath(//button[starts-with(normalize-space(),'${label}')])`;
const RAIL = (href) => `::-p-xpath(//*[contains(@class,'c-rail')]//a[@href='${href}'])`;
const TIMELINE = "::-p-xpath(//h2[normalize-space()='What has happened']/ancestor::div[1]/following-sibling::div//ol)";
const NOTE = (text) => `::-p-xpath(//ol//p[normalize-space()='${text}'])`;
const HINT = "::-p-xpath(//p[normalize-space()='Someone has spoken to them'])";
const DRY = process.env.NO_RECORD === "1";

const LEAD = "lead_ifeoma";
const BUYERS = "/admin/marketers/buyers";
const BUYER = `${BUYERS}/${LEAD}`;
const FIRST_NOTE = "My cousin. Relocating from Abuja in March, has the cash ready.";

module.exports = {
  dir: "16-follow-a-buyer",

  /**
   * Two more buyers waiting, so New reads as a queue rather than a single row.
   *
   * Both come from marketers other than Adaeze, because that is what this screen
   * actually is: everybody's introductions in one list. They are spliced in
   * after Ifeoma so she stays the top row, which is the one the take opens.
   */
  prepare(S) {
    const M = S.marketing;
    const at = Date.now();
    const of = (code) => M.marketers.find((p) => p.code === code) || M.marketers[0];
    const extra = (id, name, phone, area, budget, brief, by, hours) => {
      const who = of(by);
      return {
        id,
        buyerName: name,
        buyerPhone: phone,
        listingId: null,
        listingTitle: "",
        wantUnits: [],
        wantKind: "sale",
        wantArea: area,
        wantBudgetMinor: budget * 100,
        currency: "NGN",
        brief,
        reporterId: who.id,
        reporterName: who.displayName,
        reporterCode: who.code,
        state: "new",
        events: [
          {
            at: at - hours * 36e5,
            from: "new",
            to: "new",
            bySide: "marketer",
            byName: who.displayName,
            reason: "Logged by marketer",
            note: brief,
          },
        ],
        dealId: null,
        createdAt: at - hours * 36e5,
        updatedAt: at - hours * 36e5,
      };
    };
    M.leads.splice(
      1,
      0,
      extra("lead_tayo", "Tayo Adeniran", "0803 909 5512", "Gwarinpa, Abuja", 62_000_000,
        "He is posted to Abuja in January and wants four bedrooms near his office.", "AV-0002", 5),
      extra("lead_hauwa", "Hauwa Sani", "0805 441 8830", "Maitama, Abuja", 190_000_000,
        "She asked me about Maitama at a wedding. Paying cash, no mortgage.", "AV-0008", 20),
    );
  },

  // Compile and cache every route once, so the footage has no dev-server stalls.
  async before(a) {
    for (const p of [BUYERS, BUYER, BUYERS]) await a.goto(p);
    await a.sleep(600);
  },

  async run(a) {
    const { sleep, tab } = a;

    await a.goto(BUYERS);
    a.mark("queue");
    await sleep(3200);
    if (DRY) await a.shot("queue");

    await a.moveTo(ROW("Ifeoma Nwosu"), 900, 0.28);
    await sleep(900);
    a.mark("open");
    await a.click(ROW("Ifeoma Nwosu"), 250, 0.28);
    await a.waitFor(TIMELINE);
    await sleep(2000);
    if (DRY) await a.shot("buyer");

    // What the marketer wrote when they logged her. Their words, not a form field.
    a.mark("read");
    await a.moveTo(NOTE(FIRST_NOTE), 900, -0.02, 0.4);
    await sleep(3400);
    if (DRY) await a.shot("read");

    // The commonest next step is already picked, and the line under it says what it means.
    a.mark("move");
    await a.moveTo(F("Move to", "select"), 800);
    await sleep(900);
    await a.moveTo(HINT, 600, 0.3, 0.5);
    await sleep(2200);
    if (DRY) await a.shot("move");

    a.mark("why");
    await a.click(CHIP("Reached them"), 800);
    await sleep(1400);
    if (DRY) await a.shot("why");

    a.mark("words");
    await a.click(F("What happened", "textarea"), 700);
    await a.typeFast(
      "Called her this morning. She is relocating from Abuja in March, the money is ready, and she wants Lekki Phase 1 only.",
      70,
    );
    await sleep(1600);
    if (DRY) await a.shot("words");

    a.mark("save");
    await a.click(BTN("Move to We called them"), 800);
    await a.waitFor(NOTE("Called her this morning. She is relocating from Abuja in March, the money is ready, and she wants Lekki Phase 1 only."));
    await sleep(700);
    a.mark("moved");
    await a.moveTo(TIMELINE, 800, 0.06, 0.06);
    await sleep(3200);
    if (DRY) await a.shot("moved");

    // The second move, chosen from the list this time, so the whole line is on camera.
    a.mark("next");
    await a.moveTo(F("Move to", "select"), 800);
    await sleep(600);
    await tab.select(F("Move to", "select"), "meeting").catch(() => {});
    await sleep(1600);
    await a.click(CHIP("They picked a date"), 700);
    await sleep(900);
    await a.click(F("What happened", "textarea"), 600);
    await a.typeFast(
      "Viewing booked for Saturday at 11. She is bringing her husband and wants to see two more on the same street.",
      70,
    );
    await sleep(1200);
    if (DRY) await a.shot("next");

    a.mark("book");
    await a.click(BTN("Move to Meeting booked"), 800);
    await a.waitFor(NOTE("Viewing booked for Saturday at 11. She is bringing her husband and wants to see two more on the same street."));
    await sleep(800);
    a.mark("booked");
    await a.moveTo(TIMELINE, 700, 0.06, 0.04);
    await sleep(3000);
    if (DRY) await a.shot("booked");

    // Back to the queue: she has left New and is waiting under Meeting.
    a.mark("to-list");
    await a.click(RAIL(BUYERS), 1000);
    await a.waitFor(TAB("New"));
    await sleep(1600);
    await a.click(TAB("Meeting"), 800);
    await a.waitFor(ROW("Ifeoma Nwosu"));
    await sleep(700);
    a.mark("listed");
    await a.moveTo(ROW("Ifeoma Nwosu"), 900, 0.2);
    await sleep(3400);
    if (DRY) await a.shot("listed");
  },
};
