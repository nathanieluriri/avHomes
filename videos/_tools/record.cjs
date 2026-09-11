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

async function fixtures() {
  const c = await new MongoClient(process.env.DEMO_DB || "mongodb://127.0.0.1:27018").connect();
  const db = c.db("avhomes_demo");
  const strip = ({ _id, ...rest }) => ({ id: _id, ...rest });
  const ownerDoc = await db.collection("users").findOne({ role: "owner" });
  const S = {
    owner: {
      id: ownerDoc._id,
      email: "adaeze@avhomes.com",
      displayName: "Adaeze Vincent",
      role: process.env.ROLE || "owner",
      avatarUrl: "/images/library/person-06.jpg",
      title: "Senior Property Consultant",
      phone: "+234 801 234 5678",
    },
    props: (await db.collection("properties").find({ deletedAt: null }).sort({ updatedAt: -1 }).toArray()).map(strip),
    posts: (await db.collection("posts").find({ deletedAt: null }).sort({ publishedAt: -1 }).toArray()).map((d) => ({ ...strip(d), author: { name: "Adaeze Vincent" } })),
    enqs: (await db.collection("enquiries").find({}).sort({ updatedAt: -1 }).toArray()).map((d) => {
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
        uploadedBy: ownerDoc._id,
      })),
  };
  await c.close();
  return S;
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
  ];
}

// A drawn cursor, because a headless capture has none. Driven by the recorder rather than
// by mousemove, so it also tracks over same-origin iframes, where the top document sees none.
const CURSOR_JS = `(() => {
  const install = () => {
    if (document.getElementById("__rec_cursor") || !document.documentElement) return;
    const s = document.createElement("style");
    s.textContent = "#__rec_cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 4px rgb(28 18 20/.45))}#__rec_ring{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:999px;border:2.5px solid #b45069;z-index:2147483646;pointer-events:none;opacity:0}nextjs-portal,[data-nextjs-toast]{display:none!important}";
    document.documentElement.appendChild(s);
    document.documentElement.setAttribute("spellcheck", "false");
    const c = document.createElement("div");
    c.id = "__rec_cursor";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2.5 4 18.5 8.3 15 10.8 20.6 13.2 19.6 10.7 14.1 16.6 14.1 Z" fill="#1c1214" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const r = document.createElement("div");
    r.id = "__rec_ring";
    document.documentElement.appendChild(r);
    document.documentElement.appendChild(c);
  };
  window.__recSet = (x, y) => { install(); const c = document.getElementById("__rec_cursor"); if (c) c.style.transform = "translate(" + (x - 4) + "px," + (y - 2) + "px)"; };
  window.__recRing = (x, y) => { install(); const r = document.getElementById("__rec_ring"); if (!r) return; r.style.left = x + "px"; r.style.top = y + "px"; r.animate([{ opacity: 0.9, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.15)" }], { duration: 420, easing: "ease-out" }); };
  window.__recHideCursor = (hide) => { install(); const c = document.getElementById("__rec_cursor"); if (c) c.style.opacity = hide ? "0" : "1"; };
  if (document.readyState !== "loading") install(); else document.addEventListener("DOMContentLoaded", install);
  // Image uploads answer with the uploaded blob itself, so a note's thumbnail is the real capture.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (String(url).split("?")[0].endsWith("/api/admin/images") && init && init.method === "POST" && init.body instanceof FormData) {
      const file = init.body.get("file");
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      const image = { id: "img_up_" + Date.now().toString(36), url: dataUrl, alt: String(init.body.get("alt") || ""), contentType: file.type || "image/png", width: 1600, height: 900, bytes: file.size || 0, createdAt: Date.now(), uploadedBy: "rec" };
      return new Response(JSON.stringify({ image }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  };
})();`;

async function main() {
  const name = process.argv[2];
  const scenario = require(path.join(__dirname, "scenarios", name + ".cjs"));
  const S = await fixtures();
  if (scenario.prepare) scenario.prepare(S);
  const routes = mockApi(S);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: true,
    args: ["--no-first-run", "--hide-scrollbars", "--disable-features=Translate"],
  });
  const tab = await browser.newPage();
  await tab.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
  await tab.evaluateOnNewDocument(CURSOR_JS);
  tab.on("pageerror", (e) => console.log("PAGEERROR", String(e.message || e).slice(0, 300)));
  tab.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
  tab.on("dialog", (d) => { console.log("DIALOG", d.type(), d.message().slice(0, 80)); d.accept().catch(() => {}); });
  await tab.setRequestInterception(true);
  tab.on("request", (rq) => {
    const u = new URL(rq.url());
    if (u.origin !== BASE || !u.pathname.startsWith("/api/") || u.pathname.startsWith("/api/public/")) return rq.continue();
    let body = null;
    try {
      body = rq.postData() ? JSON.parse(rq.postData()) : null;
    } catch {
      body = null;
    }
    for (const [method, re, fn] of routes) {
      const m = u.pathname.match(re);
      if (m && rq.method() === method) {
        return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fn(m, u, body)) });
      }
    }
    console.log("UNMOCKED", rq.method(), u.pathname + u.search);
    return rq.respond({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
  });

  let cur = { x: W * 0.62, y: H * 0.55 };
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

  const api = {
    tab,
    S,
    sleep,
    mark: (k) => {
      marks[k] = +((Date.now() - t0) / 1000).toFixed(2);
      console.log("mark", k, marks[k]);
    },
    goto: async (p) => {
      await tab.goto(BASE + p, { waitUntil: "networkidle2", timeout: 120000 });
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
    cursorTo: async (x, y, ms = 700) => {
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
    },
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
    type: async (text, delay = 40) => {
      for (const ch of text) {
        if (ch === "\n") await tab.keyboard.press("Enter");
        else await tab.keyboard.type(ch);
        await sleep(delay + ((ch.charCodeAt(0) * 7) % 23));
      }
    },
    // Long copy: a word at a time via insertText, which reads as quick typing without
    // paying a keystroke round trip per character.
    typeFast: async (text, perWordMs = 55) => {
      for (const w of text.match(/\S+\s*/g) || []) {
        await tab.keyboard.sendCharacter(w);
        await sleep(perWordMs);
      }
    },
    clearAndType: async (sel, text, delay) => {
      await api.click(sel);
      await tab.keyboard.down("Control");
      await tab.keyboard.press("KeyA");
      await tab.keyboard.up("Control");
      await tab.keyboard.press("Backspace");
      await api.type(text, delay);
    },
    scrollBy: async (dy, ms = 900) => {
      await tab.evaluate(async (d, t) => {
        const m = document.querySelector(".c-main") || document.scrollingElement;
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
      }, dy, ms);
    },
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
      const f = tab.frames().find((fr) => fr !== tab.mainFrame() && fr.url().startsWith(BASE));
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

  // Straight from the compositor at device pixels (1536x864 at 1.25 = 1920x1080). Puppeteer's
  // own screencast caps frames at CSS pixels, which would upscale soft text into the video.
  const frameDir = path.join(outDir, ".frames");
  const frames = [];
  let cdp = null;
  let pending = [];
  if (record) {
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    cdp = await tab.createCDPSession();
    cdp.on("Page.screencastFrame", (f) => {
      const file = path.join(frameDir, `f${String(frames.length).padStart(6, "0")}.jpg`);
      frames.push({ ts: f.metadata.timestamp, file });
      pending.push(fs.promises.writeFile(file, Buffer.from(f.data, "base64")));
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
    await sleep(300);
  }
  t0 = Date.now();
  await scenario.run(api);
  api.mark("end");
  const tEnd = Date.now();
  if (record) {
    await sleep(200);
    await cdp.send("Page.stopScreencast");
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
      "-vf", `scale=${W * DPR}:${H * DPR}:flags=lanczos,fps=${fps}`, "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
    fs.rmSync(frameDir, { recursive: true, force: true });
    console.log(`wrote ${out} (${frames.length} source frames, ${total} output frames)`);
  }
  fs.writeFileSync(path.join(outDir, "marks.json"), JSON.stringify(marks, null, 2));
  await browser.close();
  if (!record) console.log("dry run done");
}

module.exports = { fixtures, mockApi, CURSOR_JS, BASE };

if (require.main === module) {
  main().catch((e) => {
    console.error("ERR", e.stack || e);
    process.exit(1);
  });
}
