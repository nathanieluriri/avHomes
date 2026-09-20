// Video 17: a house sold. Record it.
//
// ONE PROBLEM: "How do I take a listing off the market once it has sold?"
//
// Opens the listing, picks Record the sale from the status picker, types the real
// figure, names the marketer who closed it, attaches the proof, opens the split to
// see who gets what, and confirms. Ends on the listing reading Closed, which is the
// outcome. It does not tour the analytics section: that is video 18.

const ROW = (name) => `::-p-xpath(//tr[.//*[normalize-space()='${name}']])`;
const STATUS = "button[aria-label='Listing status']";
const OPTION = (text) => `::-p-xpath(//div[@role='option'][.//*[normalize-space()='${text}'] or normalize-space()='${text}'])`;
const SHEET = "::-p-xpath(//h2[normalize-space()='Record the sale'])";
const AMOUNT = "::-p-xpath(//label[.//span[normalize-space()='What it sold for']]//input)";
const BUYER = "::-p-xpath(//label[.//span[normalize-space()='Who bought it']]//input)";
const SEARCH = "::-p-xpath(//input[@placeholder='Their code or their name'])";
const PROOF = "::-p-xpath(//div[@role='dialog']//button[normalize-space()='Choose from library'])";
/* The library's OWN close, not the sheet's behind it. Two dialogs are open and
   an unscoped aria-label='Close' matches the outer one first, which silently
   leaves the library up while the rest of the take clicks through it. */
const LIBRARY_CLOSE =
  "::-p-xpath(//h2[normalize-space()='Media library']/ancestor::div[@role='dialog'][1]//button[@aria-label='Close'])";
const SPLIT = "::-p-xpath(//button[.//span[normalize-space()='What this pays out']])";
const CONFIRM = "::-p-xpath(//button[starts-with(normalize-space(),'Record it and close')])";
const DRY = process.env.NO_RECORD === "1";

const LISTING = "demo_ikeja-gra-family-house";

module.exports = {
  dir: "17-record-a-sale",

  /** The listing has to be live, or the status picker offers no sale to record. */
  prepare(S) {
    const listing = S.props.find((p) => p.id === LISTING);
    if (listing) {
      listing.status = "live";
      listing.closedDealId = null;
      listing.ownership = "av";
    }
  },

  async before(a) {
    /* Warm the routes the take paints, AND the image library: forty full size photos
       the first time the picker opens froze an earlier take for four seconds. */
    for (const p of ["/admin/properties", `/admin/properties/${LISTING}`]) {
      await a.goto(p);
      await a.sleep(400);
    }
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
    await a.sleep(600);
  },

  async run(a) {
    const { sleep } = a;

    await a.goto("/admin/properties");
    a.mark("listings");
    await sleep(2400);
    if (DRY) await a.shot("listings");

    a.mark("open");
    await a.moveTo(ROW("Ikeja GRA Family House"), 900, 0.3);
    await sleep(400);
    await a.click(ROW("Ikeja GRA Family House"), 200, 0.3);
    await a.waitFor(STATUS);
    await sleep(1800);
    if (DRY) await a.shot("listing");

    /* Publishing and closing are both this picker, not a button. BTN("...") is dead
       on this screen: it is a Radix StatusSelect. */
    a.mark("picker");
    await a.moveTo(STATUS, 900);
    await sleep(500);
    await a.click(STATUS, 200);
    await a.waitFor(OPTION("Record the sale"));
    await sleep(1600);
    if (DRY) await a.shot("picker");

    a.mark("sheet");
    await a.click(OPTION("Record the sale"), 200);
    await a.waitFor(SHEET);
    await sleep(2000);
    if (DRY) await a.shot("sheet");

    /* The asking price is already in the box. Retyping it to the real figure is the
       point: what it sold for is rarely what it was listed at. */
    a.mark("amount");
    await a.clearAndType(AMOUNT, "158000000", 60);
    await sleep(1200);
    if (DRY) await a.shot("amount");

    a.mark("closer");
    await a.moveTo(SEARCH, 800);
    await sleep(400);
    await a.clearAndType(SEARCH, "AV-0008", 110);
    await sleep(1400);
    if (DRY) await a.shot("searching");
    await a.click("::-p-xpath(//button[.//span[normalize-space()='Tobi Ajayi']])", 200);
    await sleep(1300);
    if (DRY) await a.shot("closer");

    a.mark("buyer");
    await a.clearAndType(BUYER, "Kemi Adebayo", 70);
    await sleep(1100);

    a.mark("proof");
    await a.moveTo(PROOF, 900);
    await sleep(500);
    await a.click(PROOF, 300);
    await sleep(1800);
    if (DRY) await a.shot("proof-picker");
    /* One photo from the library, standing in for the receipt. The point on camera
       is that the field refuses to be empty, not which image it is. Matched by src
       the way every other scenario picks from this sheet. */
    await a.click("::-p-xpath(//button[.//img[contains(@src,'exterior-01')]])", 600);
    await sleep(1200);
    await a.click(LIBRARY_CLOSE, 600);
    await sleep(1200);
    if (DRY) await a.shot("proof");

    a.mark("split");
    await a.moveTo(SPLIT, 900);
    await sleep(500);
    await a.click(SPLIT, 200);
    await sleep(700);
    /*
     * Scroll the SHEET, not the page.
     *
     * `a.scrollBy` moves the window, and the breakdown lives inside the sheet's own
     * scroll container, so the page scrolled while the five shares stayed under the
     * pinned footer. The first take held four seconds on a caption promising shares
     * nobody could see, which is the failure "show the outcome" exists to catch.
     */
    await a.tab.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const body = dialog
        ? [...dialog.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 40)
        : null;
      if (body) body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
    });
    await sleep(3200);
    if (DRY) await a.shot("split");

    a.mark("confirm");
    await a.moveTo(CONFIRM, 900);
    await sleep(700);
    await a.click(CONFIRM, 200);
    await sleep(2400);
    a.mark("closed");
    await sleep(2600);
    if (DRY) await a.shot("closed");
  },
};
