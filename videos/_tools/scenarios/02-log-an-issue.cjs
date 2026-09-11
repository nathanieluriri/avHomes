// Video 2: log a change for the developer from the customize studio. Freeze the live homepage
// at the featured homes, ring them, say what should be different, save the note.
const BTN = (text) => `::-p-xpath(//button[normalize-space()='${text}'])`;
const DRY = process.env.NO_RECORD === "1";

module.exports = {
  dir: "02-log-an-issue",
  async before(a) {
    await a.goto("/");
    await a.dismissCookies();
    await a.sleep(500);
    await a.goto("/admin/customize");
    await a.sleep(2500);
  },
  async run(a) {
    const { sleep } = a;
    await a.goto("/admin/properties");
    a.mark("console");
    await sleep(1500);
    await a.click("::-p-xpath(//nav//a[normalize-space()='Customize'])", 900);
    await a.waitFor(BTN("Mark up"));
    await sleep(1200);
    await a.cleanFrames();
    await sleep(1400);
    a.mark("studio");
    if (DRY) await a.shot("studio");

    await a.click(BTN("Mark up"), 900);
    await sleep(900);
    a.mark("markup");
    await a.cursorTo(760, 520, 700);
    await a.scrollFrame(820, 1800);
    await sleep(1200);
    if (DRY) await a.shot("scrolled");

    await a.click(BTN("Freeze this screen"), 900);
    a.mark("freezing");
    await a.waitFor("::-p-xpath(//div[@role='group' and @aria-label='Tool'])", 60000);
    await sleep(1200);
    a.mark("frozen");
    if (DRY) await a.shot("frozen");

    // Box, to frame the whole row of featured homes the note is about.
    await a.click(BTN("Box"), 700);
    await sleep(300);
    const pic = await a.box("::-p-xpath(//img[starts-with(@src,'blob:')])");
    const x = (fx) => pic.x + pic.width * fx;
    const y = (fy) => pic.y + pic.height * fy;
    await a.drag(x(0.03), y(0.305), x(0.97), y(0.94), 1500);
    a.mark("ringed");
    await sleep(700);
    if (DRY) await a.shot("ringed");

    await a.click("::-p-xpath(//textarea)", 800);
    await a.type("Can we show eight featured homes here instead of six? We have two new Lekki listings we want to push this month.", 26);
    a.mark("commented");
    await sleep(900);
    if (DRY) await a.shot("commented");

    await a.click(BTN("Save note"), 900);
    await sleep(2400);
    a.mark("saved");
    if (DRY) await a.shot("saved");
    await sleep(2600);
  },
};
