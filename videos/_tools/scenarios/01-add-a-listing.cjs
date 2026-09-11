// Video 1: add a listing that is ready to market. Values are the seed's own Ikoyi Glass House,
// then the live public pages: that sale listing, and a rent listing (Palm Residence) beside it.
const F = (label, tag = "input") => `::-p-xpath(//label[.//span[normalize-space()='${label}']]//${tag})`;
const BTN = (text) => `::-p-xpath(//button[normalize-space()='${text}'])`;
const DRY = process.env.NO_RECORD === "1";

module.exports = {
  dir: "01-add-a-listing",
  // Compile and cache every route once, so the footage has no dev-server stalls.
  async before(a) {
    await a.goto("/");
    await a.dismissCookies();
    await a.sleep(600);
    for (const p of ["/listings/ikoyi-glass-house", "/listings?status=For+Rent", "/listings/lekki-palm-residence", "/admin/properties"]) await a.goto(p);
  },
  async run(a) {
    const { tab, sleep } = a;

    await a.goto("/admin/properties");
    a.mark("listings");
    await sleep(1800);

    await a.click(BTN("New listing"));
    await a.waitFor('input[aria-label="New listing title"]');
    a.mark("naming");
    await sleep(300);
    await a.type("Ikoyi Glass House", 65);
    await sleep(600);
    await a.click("::-p-xpath(//form//button[@type='submit'])");
    await a.waitFor(F("Tagline"));
    await sleep(1100);
    a.mark("editor");

    await a.click(F("Tagline"));
    await a.type("Timber and glass, wrapped around a courtyard tree", 28);
    await sleep(250);
    await a.click(F("Description", "textarea"));
    await a.typeFast("An architect's own home. Blackened timber cladding, a two storey glazed spine, and living space that folds fully open onto the lawn. Quiet, warm, and unlike anything else on the island.", 70);
    a.mark("copy-done");
    await sleep(900);

    await a.scrollBy(520, 1000);
    a.mark("pricing");
    await a.moveTo(F("Type", "select"), 600);
    await tab.select(F("Type", "select"), "Duplex").catch(() => {});
    await sleep(350);
    await a.click(BTN("Sale"), 500);
    await a.click(F("Price"), 600);
    await a.type("480000000", 80);
    await sleep(700);

    await a.scrollBy(430, 900);
    a.mark("location");
    await a.click(F("City"), 600);
    await a.type("Lagos", 55);
    await a.click(F("Location"), 500);
    await a.type("Old Ikoyi, Lagos", 38);
    await a.click(F("Address"), 600);
    await a.type("4 Bourdillon Road, Old Ikoyi, Lagos", 26);
    await sleep(400);

    await a.scrollBy(380, 900);
    a.mark("specs");
    await a.clearAndType(F("Bedrooms"), "4", 90);
    await a.clearAndType(F("Bathrooms"), "5", 90);
    await a.clearAndType(F("Parking"), "3", 90);
    await sleep(300);
    await a.click("::-p-xpath(//input[@placeholder='Type one and press Enter'])", 600);
    await a.type("Courtyard Garden\n", 38);
    for (const chip of ["Solar with Battery", "Smart Home System"]) {
      await a.click(`::-p-xpath(//button[normalize-space()='${chip}'])`, 500);
      await sleep(200);
    }
    await sleep(400);
    if (DRY) await a.shot("amenities");

    await a.scrollBy(300, 800);
    a.mark("photos");
    await a.click(BTN("Choose from library"), 600);
    await sleep(900);
    for (const img of ["exterior-01", "interior-01", "interior-03", "interior-09"]) {
      await a.click(`::-p-xpath(//button[.//img[contains(@src,'${img}')]])`, 600);
      await sleep(380);
    }
    await sleep(400);
    await a.click("::-p-xpath(//button[@aria-label='Close'])", 600).catch(async () => {
      await tab.keyboard.press("Escape");
    });
    await sleep(700);
    if (DRY) await a.shot("photos");

    a.mark("save");
    await a.click("::-p-xpath(//div[contains(@class,'c-savebar')]//button[normalize-space()='Save'])", 700);
    await sleep(1300);

    await a.scrollBy(-4000, 1300);
    await sleep(300);
    a.mark("publish");
    if (DRY) await a.shot("before-publish");
    await a.click(BTN("Publish"), 800);
    await sleep(1600);
    if (DRY) await a.shot("published");
    a.mark("live");
    await sleep(1400);

    await a.goto("/listings/ikoyi-glass-house");
    a.mark("site-sale");
    await sleep(1800);
    await a.scrollBy(620, 2200);
    await sleep(1400);
    await a.scrollBy(760, 2000);
    await sleep(1600);

    await a.goto("/listings?status=For+Rent");
    a.mark("site-rent");
    await sleep(1400);
    await a.scrollBy(560, 1500);
    await sleep(500);
    await a.moveTo("::-p-xpath(//a[contains(@href,'lekki-palm-residence')])", 900);
    await sleep(1600);
    await a.click("::-p-xpath(//a[contains(@href,'lekki-palm-residence')])", 300);
    await sleep(2400);
    a.mark("site-rent-detail");
    await sleep(2600);
  },
};
