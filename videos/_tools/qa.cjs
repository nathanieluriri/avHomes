// Visual QA for console screens: the real UI in headless Chrome, /api/admin answered by the
// recorder's mock (seeded from the local demo DB), scripted steps, and screenshots.
//
//   node videos/_tools/qa.cjs <jobs.json> [outDir]
//
// jobs.json: [{ "name": "tutorials-desktop", "path": "/admin/tutorials", "viewport": "desktop" | "phone",
//               "role": "owner", "steps": [ {"click": "<selector>"}, {"type": "text"}, {"key": "Enter"},
//               {"wait": 800}, {"waitFor": "<selector>"}, {"scroll": 600}, {"eval": "js expression"},
//               {"shot": "label"} ] }]
// Selectors are puppeteer selectors, so ::-p-text(New listing) and ::-p-xpath(...) work.
// A shot is taken at the end of every job as well. Console errors and unmocked API calls are
// printed, because a screen that only looks right is not the same as one that works.
const fs = require("fs");
const path = require("path");
const { fixtures, mockApi, CURSOR_JS, BASE } = require("./record.cjs");
const puppeteer = require(process.env.PUPPETEER_CORE);

const VIEWPORTS = {
  desktop: { width: 1536, height: 864, deviceScaleFactor: 1.25 },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function run() {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const out = path.resolve(process.argv[3] || path.join(__dirname, "..", "_captures", "qa"));
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true, args: ["--no-first-run", "--hide-scrollbars"] });
  for (const job of jobs) {
    process.env.ROLE = job.role || "owner";
    const S = await fixtures();
    const routes = mockApi(S);
    const ctx = await browser.createBrowserContext();
    const tab = await ctx.newPage();
    await tab.setViewport(VIEWPORTS[job.viewport || "desktop"]);
    if (job.viewport === "phone") await tab.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36");
    await tab.evaluateOnNewDocument(CURSOR_JS);
    await tab.evaluateOnNewDocument(() => { try { localStorage.setItem("avh-cookie-consent", "rejected"); } catch {} });
    tab.on("pageerror", (e) => console.log(`[${job.name}] PAGEERROR`, String(e.message || e).slice(0, 300)));
    tab.on("console", (m) => { if (m.type() === "error" && !/hydrated but some attributes/.test(m.text())) console.log(`[${job.name}] CONSOLE`, m.text().slice(0, 300)); });
    tab.on("dialog", (d) => d.accept().catch(() => {}));
    await tab.setRequestInterception(true);
    tab.on("request", (rq) => {
      const u = new URL(rq.url());
      if (u.origin !== BASE || !u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/public/")) return rq.continue();
      let body = null;
      try { body = rq.postData() ? JSON.parse(rq.postData()) : null; } catch { body = null; }
      for (const [method, re, fn] of routes) {
        const m = u.pathname.match(re);
        if (m && rq.method() === method) return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fn(m, u, body)) });
      }
      console.log(`[${job.name}] UNMOCKED`, rq.method(), u.pathname + u.search);
      return rq.respond({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
    });
    try {
      await tab.goto(BASE + job.path, { waitUntil: "networkidle2", timeout: 120000 });
      await new Promise((r) => setTimeout(r, 900));
      let n = 0;
      for (const s of job.steps || []) {
        if (s.click) { await tab.waitForSelector(s.click, { timeout: 15000 }); await tab.click(s.click); }
        if (s.type) await tab.keyboard.type(s.type, { delay: 12 });
        if (s.key) await tab.keyboard.press(s.key);
        if (s.waitFor) await tab.waitForSelector(s.waitFor, { timeout: 20000 });
        if (s.scroll) await tab.evaluate((y) => { const m = document.querySelector(".c-main") || document.scrollingElement; m.scrollBy(0, y); }, s.scroll);
        if (s.eval) console.log(`[${job.name}] eval:`, JSON.stringify(await tab.evaluate(s.eval)).slice(0, 500));
        if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
        if (s.shot) await tab.screenshot({ path: path.join(out, `${job.name}-${String(++n).padStart(2, "0")}-${s.shot}.png`) });
      }
      await new Promise((r) => setTimeout(r, 600));
      await tab.screenshot({ path: path.join(out, `${job.name}-end.png`) });
      console.log(`[${job.name}] ok ${tab.url().replace(BASE, "")}`);
    } catch (e) {
      await tab.screenshot({ path: path.join(out, `${job.name}-FAILED.png`) }).catch(() => {});
      console.log(`[${job.name}] STEP FAILED: ${e.message.slice(0, 300)}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log("screenshots in", out);
}

run().catch((e) => { console.error("ERR", e.stack || e); process.exit(1); });
