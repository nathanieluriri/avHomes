// Video 4: write a journal post. The quick editor for the details, the advanced studio for
// the body, publish, then the live post. Copy is the seed's own off-plan checklist.
const F = (label, tag = "input") => `::-p-xpath(//label[.//span[normalize-space()='${label}']]//${tag})`;
const BTN = (text) => `::-p-xpath(//button[normalize-space()='${text}'])`;
const DRY = process.env.NO_RECORD === "1";

module.exports = {
  dir: "04-write-a-blog-post",
  async before(a) {
    await a.goto("/");
    await a.dismissCookies();
    await a.sleep(500);
    for (const p of ["/posts/off-plan-risk-checklist", "/admin/posts", `/admin/posts/${a.S.posts[0].id}`, `/admin/posts/${a.S.posts[0].id}/advanced`]) await a.goto(p);
  },
  async run(a) {
    const { tab, sleep } = a;
    await a.goto("/admin/posts");
    a.mark("posts");
    await sleep(2000);

    await a.click(BTN("New post"), 900);
    await a.waitFor(F("Title"));
    await sleep(1200);
    a.mark("quick");
    if (DRY) await a.shot("quick");

    await a.click(F("Title"), 700);
    await a.type("Buying off plan without getting burned: a nine point checklist", 30);
    await sleep(300);
    await a.click(F("Subtitle"), 600);
    await a.type("Off plan can be the best value on the market, or the most expensive mistake", 24);
    await sleep(300);
    const excerpt = await tab.$(F("Excerpt", "textarea")).catch(() => null);
    if (excerpt) {
      await a.click(F("Excerpt", "textarea"), 600);
      await a.typeFast("Off plan can be the best value in the market. It can also be the fastest way to lose a deposit. The difference is nine questions asked before you sign anything.", 65);
    }
    await a.click(F("Tags"), 700);
    await a.type("Off plan, Risk, Buying", 38);
    a.mark("details");
    await sleep(600);
    if (DRY) await a.shot("details");

    a.mark("cover");
    await a.click(BTN("Choose from library"), 800);
    await sleep(900);
    await a.click("::-p-xpath(//button[.//img[contains(@src,'av-render-01')]])", 700);
    await sleep(1100);
    // The studio's pre-publish check asks for this; describing the picture is part of the copy.
    await a.click(F("Cover alt text"), 800);
    await a.type("A render of a development still under construction", 26);
    await sleep(500);
    if (DRY) await a.shot("cover");

    a.mark("save");
    await a.click("::-p-xpath(//div[contains(@class,'c-savebar')]//button[normalize-space()='Save'])", 800);
    await sleep(1500);
    await a.scrollBy(-4000, 900);
    await sleep(400);

    a.mark("to-advanced");
    await a.click("::-p-xpath(//a[normalize-space()='Advanced editor'] | //button[normalize-space()='Advanced editor'])", 900);
    await a.waitFor(".ProseMirror");
    await sleep(1800);
    a.mark("advanced");
    if (DRY) await a.shot("advanced");

    await a.click(".ProseMirror", 800, 0.3, 0.9);
    await tab.keyboard.press("End");
    a.mark("writing");
    await a.typeFast("Off plan is the only way most buyers reach a finished home in a prime Lagos postcode at a price they can carry. It is also the only purchase where you hand over money for something that does not exist yet.", 60);
    await tab.keyboard.press("Enter");
    await a.type("## ", 60);
    await a.type("Before the deposit", 45);
    await tab.keyboard.press("Enter");
    await a.type("1. ", 60);
    await a.typeFast("Whose name is on the title, and is it the same entity you are paying?", 60);
    await tab.keyboard.press("Enter");
    await a.typeFast("Has the development got planning approval, or only an application in progress?", 60);
    await tab.keyboard.press("Enter");
    await a.typeFast("What has this developer finished, and can you visit one of those sites unaccompanied?", 60);
    await sleep(1200);
    if (DRY) await a.shot("written");

    a.mark("publish");
    await a.click("::-p-xpath(//button[starts-with(normalize-space(),'Publish')])", 900);
    await sleep(1300);
    if (DRY) await a.shot("publish-panel");
    const anyway = await tab.$("::-p-xpath(//button[normalize-space()='Publish anyway'])").catch(() => null);
    if (anyway) {
      console.log("NOTE: pre-publish check still flagged something");
      await a.click("::-p-xpath(//button[normalize-space()='Publish anyway'])", 700);
    }
    await sleep(1500);
    a.mark("published");
    if (DRY) await a.shot("published");
    await sleep(1200);

    await a.goto("/posts/off-plan-risk-checklist");
    a.mark("site");
    await sleep(2200);
    await a.scrollBy(700, 2400);
    await sleep(1400);
    await a.scrollBy(700, 2200);
    await sleep(2200);
  },
};
