// Video 15: list an estate. One listing that holds ten things a buyer can pick, which is what
// makes an estate different from a house: bungalows, duplexes, apartments and bare plots, each
// with its own price, and the estate's own "from" price worked out from them. Ends in the
// Preview sheet, where the real site renders the draft, so the outcome is the page itself.
const F = (label, tag = "input") => `::-p-xpath(//label[.//span[normalize-space()='${label}']]//${tag})`;
const BTN = (text) => `::-p-xpath(//button[normalize-space()='${text}'])`;
const CHIP = (label) => `::-p-xpath(//button[@aria-label='Add ${label} option'])`;
const CHIPS = "::-p-xpath(//div[@role='group'][@aria-label='Add an option'])";
const KIND = (label) => `::-p-xpath(//div[@role='group'][@aria-label='Kind of listing']//button[normalize-space()='${label}'])`;
// Each row is a group named by what it is so far: an unnamed 2 bed row is "2 bedroom",
// and it stops answering to that the moment it is given a name.
const ROW = (label) => `::-p-xpath(//div[@role='group'][@aria-label='${label}'])`;
const CELL = (label, cell) =>
  `::-p-xpath(//div[@role='group'][@aria-label='${label}']//label[.//span[normalize-space()='${cell}']]//input)`;
const PLAN_SWITCH = "::-p-xpath(//label[normalize-space()='Offers a payment plan'])";
const PREVIEW = "::-p-xpath(//button[@role='switch'][.//span[normalize-space()='Preview']])";
const SAVE = "::-p-xpath(//div[contains(@class,'c-savebar')]//button[normalize-space()='Save'])";
const PRICE_LINE = "::-p-xpath(//span[normalize-space()='Price']/following-sibling::p[1])";
const STATUS = 'button[aria-label="Listing status"]';
const STATUS_OPT = (label) => `::-p-xpath(//div[@role='option'][.//span[normalize-space()='${label}']])`;
const DRY = process.env.NO_RECORD === "1";

/**
 * Scrolls `sel` into the clear.
 *
 * The console's save bar is pinned over the bottom of the sheet from the first
 * edit onwards, and the options table grows under it row by row. A tap aimed at
 * a chip sitting behind the bar lands on the bar, which is why the recorder's
 * own `scrollIntoView({ block: "nearest" })` is not enough here.
 */
async function bring(a, sel, at = 0.45) {
  const delta = await a.tab.$eval(
    sel,
    (el, at) => {
      const r = el.getBoundingClientRect();
      if (r.top >= 110 && r.bottom <= innerHeight - 150) return 0;
      return Math.round(r.top - innerHeight * at);
    },
    at,
  );
  if (delta !== 0) await a.scrollBy(delta, Math.min(900, 320 + Math.abs(delta) * 0.5));
  return delta;
}

/** A house option: name it, size it, price it. Enter moves the caret on, as the hint under the table says. */
async function house(a, rowLabel, name, sqm, price, next = true) {
  await bring(a, ROW(rowLabel), 0.42);
  await a.click(CELL(rowLabel, "Name"), 500);
  await a.hideCursor();
  await a.type(name, 30);
  await a.hideCursor(false);
  // Named, so the row stops answering to "2 bedroom" and answers to its name.
  await a.click(CELL(name, "Size (sqm)"), 450);
  await a.hideCursor();
  await a.type(sqm, 90);
  await a.tab.keyboard.press("Enter");
  await a.sleep(160);
  await a.type(price, 80);
  // Enter on the last priced row adds the next one up, ready to type into.
  if (next) await a.tab.keyboard.press("Enter");
  await a.hideCursor(false);
  await a.sleep(340);
}

/** A plot: the chip puts the caret straight in its size, and a plot needs no name. */
async function plot(a, sqm, price) {
  await bring(a, CHIPS, 0.5);
  await a.click(CHIP("plot"), 500);
  await a.hideCursor();
  await a.sleep(260);
  await a.type(sqm, 95);
  await a.tab.keyboard.press("Enter");
  await a.sleep(160);
  await a.type(price, 80);
  await a.hideCursor(false);
  await a.sleep(400);
}

module.exports = {
  dir: "15-list-an-estate",

  // Compile and cache every route once, so the footage has no dev-server stalls.
  async before(a) {
    await a.goto("/");
    await a.dismissCookies();
    await a.sleep(600);
    for (const p of ["/listings/kuje-garden-estate", "/preview/listing", "/admin/properties"]) {
      await a.goto(p);
    }
    /* The library sheet paints forty-odd full size photos the first time it
       opens, which froze the picture for four seconds mid take. Fetching them
       here puts every one in the browser's cache before the camera runs. */
    await a.tab.evaluate(
      (urls) =>
        Promise.all(
          urls.map(
            (url) =>
              new Promise((done) => {
                const img = new Image();
                img.onload = img.onerror = done;
                img.src = url;
              }),
          ),
        ),
      a.S.library.map((row) => row.url),
    );
    await a.sleep(500);
  },

  async run(a) {
    const { tab, sleep } = a;

    await a.goto("/admin/properties");
    a.mark("listings");
    await sleep(1800);

    await a.click(BTN("New listing"));
    await a.waitFor('input[aria-label="New listing title"]');
    a.mark("naming");
    await sleep(800);
    // The fork is here, beside the name: an estate opens a different form.
    await a.click(KIND("Estate"), 650);
    await a.waitFor('input[aria-label="New estate name"]');
    a.mark("kind");
    await sleep(1300);
    if (DRY) await a.shot("kind");
    await a.type("Idu Grove Estate", 65);
    await sleep(600);
    await a.click("::-p-xpath(//form//button[@type='submit'])");
    await a.waitFor(F("Tagline"));
    await sleep(1100);
    a.mark("editor");

    await a.click(F("Tagline"));
    await a.type("Serviced plots and off-plan homes, 25% down", 30);
    await sleep(250);
    await a.click(F("Description", "textarea"));
    await a.typeFast(
      "A gated development on dry, level land off the Idu road, laid out with paved streets, drainage and street lights before the first house goes up. Pick a finished house type or a serviced plot to build on.",
      66,
    );
    await sleep(800);

    // Type came from the choice on the last screen, and it is what decides the
    // rest of the form: no Sale or Rent switch, and no price box to type into.
    await a.scrollBy(500, 950);
    a.mark("type");
    await a.moveTo(F("Type", "select"), 700);
    await sleep(1000);
    await a.moveTo("::-p-xpath(//p[contains(normalize-space(),'An estate is sold, not let')])", 650, 0.3, 0.5);
    await sleep(2400);
    if (DRY) await a.shot("type");

    await a.moveTo(F("Build stage", "select"), 650);
    await tab.select(F("Build stage", "select"), "off-plan").catch(() => {});
    await sleep(450);
    await tab.select(F("Title document", "select"), "r-of-o").catch(() => {});
    a.mark("stage");
    await sleep(1400);
    if (DRY) await a.shot("stage");

    // TEN OPTIONS. Houses and apartments first, then the plots.
    await a.scrollBy(700, 1000);
    a.mark("options");
    await sleep(1400);
    if (DRY) await a.shot("empty-options");

    await bring(a, CHIPS, 0.5);
    await a.click(CHIP("2 bed"), 650);
    await sleep(600);
    a.mark("first");
    await house(a, "2 bedroom", "2 bedroom semi-detached bungalow", "120", "27500000");
    await house(a, "3 bedroom", "3 bedroom detached bungalow", "180", "42000000");
    a.mark("more");
    await house(a, "4 bedroom", "4 bedroom detached duplex", "260", "68000000");
    await house(a, "5 bedroom", "5 bedroom detached duplex", "340", "94000000", false);
    await sleep(600);
    if (DRY) await a.shot("houses");

    a.mark("flats");
    await bring(a, CHIPS, 0.5);
    await a.click(CHIP("2 bed"), 600);
    await sleep(450);
    await house(a, "2 bedroom", "2 bedroom apartment", "96", "31000000");
    await house(a, "3 bedroom", "3 bedroom apartment", "134", "46000000");
    await house(a, "4 bedroom", "4 bedroom terrace", "210", "58000000", false);
    await sleep(800);
    if (DRY) await a.shot("flats");

    a.mark("plots");
    await plot(a, "300", "6800000");
    await plot(a, "500", "11500000");
    await plot(a, "1000", "21000000");
    await sleep(1600);
    if (DRY) await a.shot("plots");

    // The price nobody typed: the estate's own, worked out from the cheapest option.
    await bring(a, PRICE_LINE, 0.3);
    a.mark("from");
    await a.moveTo(PRICE_LINE, 800, 0.2, 0.5);
    await sleep(2800);
    if (DRY) await a.shot("from");

    await bring(a, PLAN_SWITCH, 0.34);
    a.mark("plan");
    await a.click(PLAN_SWITCH, 650, 0.06);
    await a.waitFor(F("Deposit"));
    await sleep(600);
    await bring(a, F("Deposit"), 0.34);
    await a.clearAndType(F("Deposit"), "25", 110);
    await a.clearAndType(F("Spread over"), "12", 110);
    await a.click(F("Note"), 550);
    await a.type("No interest across the twelve months.", 32);
    await sleep(2400);
    if (DRY) await a.shot("plan");

    await bring(a, F("City"), 0.32);
    a.mark("where");
    await a.click(F("City"), 550);
    await a.type("Abuja", 60);
    await a.click(F("Location"), 450);
    await a.type("Idu, Abuja", 45);
    await a.click(F("Address"), 550);
    await a.type("Off Idu Industrial Road, Idu, Abuja", 28);
    await sleep(800);

    await bring(a, BTN("Choose from library"), 0.34);
    a.mark("photos");
    await a.click(BTN("Choose from library"), 650);
    await sleep(900);
    for (const img of ["av-render-03", "av-render-01", "av-render-02"]) {
      await a.click(`::-p-xpath(//button[.//img[contains(@src,'${img}')]])`, 550);
      await sleep(340);
    }
    await sleep(450);
    await a.click("::-p-xpath(//button[@aria-label='Close'])", 550).catch(async () => {
      await tab.keyboard.press("Escape");
    });
    await sleep(700);
    if (DRY) await a.shot("photos");

    a.mark("save");
    await a.click(SAVE, 650);
    await sleep(1500);

    await a.scrollBy(-8000, 1300);
    await sleep(400);
    a.mark("publish");
    await a.click(STATUS, 800);
    await a.waitFor(STATUS_OPT("Publish"));
    await sleep(1200);
    if (DRY) await a.shot("status");
    await a.click(STATUS_OPT("Publish"), 600);
    await sleep(2000);
    a.mark("live");
    await sleep(1400);
    if (DRY) await a.shot("live");

    // The outcome: the real site, rendering this draft in the preview frame.
    a.mark("preview");
    await a.click(PREVIEW, 900, 0.85);
    await a.waitFor("iframe");
    await sleep(2400);
    await a.cleanFrames();
    await a.click(BTN("Listing page"), 750);
    await sleep(2800);
    await a.cleanFrames();
    a.mark("page");
    if (DRY) await a.shot("preview");
    await a.scrollFrame(880, 2200).catch(() => {});
    await sleep(1300);
    await a.scrollFrame(800, 2000).catch(() => {});
    a.mark("options-live");
    await sleep(3400);
    if (DRY) await a.shot("preview-options");
  },
};
