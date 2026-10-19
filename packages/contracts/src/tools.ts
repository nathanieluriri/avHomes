/**
 * Marketing tools: the guides, trainings and merch AV Homes hands its partners.
 *
 * One document an admin edits from the console, read whole by the partner app.
 * A list that has never been saved answers with the defaults below, so a new
 * site opens on something worth reading rather than three empty tabs.
 */

export const GUIDE_KINDS = ["article", "link", "file", "video"] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

export const GUIDE_KIND_LABELS: Record<GuideKind, string> = {
  article: "Article",
  link: "Link",
  file: "File",
  video: "Video",
};

export interface Guide {
  id: string;
  kind: GuideKind;
  title: string;
  summary: string;
  /** The article itself, for kind `article`. Plain text, blank lines between paragraphs. */
  body: string;
  /** Where a link, file or video lives. Empty for an article. */
  url: string;
  hidden: boolean;
}

export interface Training {
  id: string;
  title: string;
  summary: string;
  /** A video to watch or a link to join. */
  url: string;
  minutes: number;
  /** When a live session starts, or null for one watched any time. */
  liveAt: number | null;
  hidden: boolean;
}

/** A merch tier. A partner reaches it once they have this many approved deals. */
export interface MerchGrade {
  id: string;
  name: string;
  includes: string;
  minDeals: number;
}

export interface MerchItem {
  id: string;
  name: string;
  summary: string;
  imageUrl: string;
  gradeId: string;
  /** Zero is free. */
  priceMinor: number;
  sizes: string[];
  /** Null when there is no count to run out of. */
  stock: number | null;
  hidden: boolean;
}

export interface MarketingTools {
  guides: Guide[];
  trainings: Training[];
  grades: MerchGrade[];
  merch: MerchItem[];
}

export const TOOL_LISTS = ["guides", "trainings", "grades", "merch"] as const;
export type ToolList = (typeof TOOL_LISTS)[number];

export const MERCH_REQUEST_STATUSES = ["requested", "sent", "declined"] as const;
export type MerchRequestStatus = (typeof MERCH_REQUEST_STATUSES)[number];

export interface MerchRequest {
  id: string;
  marketerId: string;
  marketerName: string;
  marketerCode: string;
  marketerPhone: string;
  itemId: string;
  itemName: string;
  gradeName: string;
  size: string;
  note: string;
  status: MerchRequestStatus;
  createdAt: number;
  updatedAt: number;
  handledByName: string;
}

/** What the partner app's Tools screen reads in one go. */
export interface PartnerTools {
  guides: Guide[];
  trainings: Training[];
  grades: MerchGrade[];
  merch: MerchItem[];
  approvedDeals: number;
  /** The highest grade reached, or null before the first. */
  gradeId: string | null;
  requests: MerchRequest[];
}

export const TOOL_TITLE_MAX = 140;
export const TOOL_SUMMARY_MAX = 400;
export const TOOL_BODY_MAX = 20_000;
export const TOOL_URL_MAX = 1000;
export const TOOL_LIST_MAX = 100;

/** The grade a partner with this many approved deals has reached. */
export function gradeFor(grades: readonly MerchGrade[], approvedDeals: number): MerchGrade | null {
  let best: MerchGrade | null = null;
  for (const grade of grades) {
    if (approvedDeals >= grade.minDeals && (!best || grade.minDeals >= best.minDeals)) best = grade;
  }
  return best;
}

/** Can a partner on `reached` ask for an item of `wanted`? */
export function gradeAllows(grades: readonly MerchGrade[], reached: string | null, wanted: string): boolean {
  const target = grades.find((g) => g.id === wanted);
  if (!target) return false;
  const mine = grades.find((g) => g.id === reached);
  return mine !== undefined && mine.minDeals >= target.minDeals;
}

/**
 * A URL that downloads instead of playing, or null when the host cannot be asked to.
 *
 * Same-origin files take the `download` attribute. Cloudinary serves an
 * attachment when `fl_attachment` is in the path, and Vercel Blob when
 * `download=1` is in the query. Anything else (YouTube, a Drive page) is
 * opened rather than saved.
 */
export function downloadLink(url: string, name: string): { href: string; filename: string } | null {
  const base = slugName(name) || "download";
  const path = url.split(/[?#]/u)[0] ?? "";
  const dot = path.lastIndexOf(".");
  const ext = dot > path.lastIndexOf("/") ? path.slice(dot + 1).toLowerCase() : "";
  const filename = ext ? `${base}.${ext}` : base;
  if (url.startsWith("/") && !url.startsWith("//")) return { href: url, filename };
  if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\//u.test(url)) {
    return { href: url.replace(/\/upload\//u, `/upload/fl_attachment:${base}/`), filename };
  }
  if (/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//u.test(url)) {
    return { href: `${url}${url.includes("?") ? "&" : "?"}download=1`, filename };
  }
  return null;
}

function slugName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

export const DEFAULT_MARKETING_TOOLS: MarketingTools = {
  guides: [
    {
      id: "guide-first-deal",
      kind: "article",
      title: "Your first deal in seven days",
      summary: "A simple plan for the first week: who to tell, what to send and when to follow up.",
      body: [
        "Day 1: Make a list of twenty people who have talked about buying land or a house. Family, colleagues, church and old classmates all count.",
        "Day 2: Pick three listings you would happily show your own family. Open each one in the app and read it end to end.",
        "Day 3: Share one listing a day on your WhatsApp status with a short line in your own words. Your code is already in the link.",
        "Day 4 to 6: Message the people on your list one by one. Ask what they are looking for before you send anything.",
        "Day 7: Log every serious buyer under Buyers. AV Homes calls them, books the viewing and closes it, and you are paid the same.",
      ].join("\n\n"),
      url: "",
      hidden: false,
    },
    {
      id: "guide-whatsapp-status",
      kind: "article",
      title: "Selling on your WhatsApp status",
      summary: "What to post, how often, and the words that get people to reply.",
      body: [
        "Post one property a day, not five. People skip a wall of adverts.",
        "Lead with the photo that shows the whole home, then one line on why it is a good buy: the location, the price or the payment plan.",
        "End with a question, such as \"Want me to send you the full details?\" A question gets replies where a price list gets silence.",
        "Reply within the hour. A buyer who waits a day has usually asked someone else.",
      ].join("\n\n"),
      url: "",
      hidden: false,
    },
    {
      id: "guide-av-homes-site",
      kind: "link",
      title: "Every listing on AV Homes",
      summary: "The full catalogue, with photos and prices, to browse before you talk to a buyer.",
      body: "",
      url: "https://www.avhomesltd.com/listings",
      hidden: false,
    },
  ],
  trainings: [
    {
      id: "training-onboarding",
      title: "Partner onboarding",
      summary: "How AV Homes works, how commission is split, and how you are paid at the end of the month.",
      url: "/tutorials/invite-and-earn.mp4",
      minutes: 2,
      liveAt: null,
      hidden: false,
    },
    {
      id: "training-report-a-deal",
      title: "Reporting a deal properly",
      summary: "The proof AV Homes needs to approve a deal quickly, and the mistakes that slow it down.",
      url: "/tutorials/report-a-deal.mp4",
      minutes: 2,
      liveAt: null,
      hidden: false,
    },
  ],
  grades: [
    { id: "grade-standard", name: "Standard", includes: "A branded polo shirt and a pack of flyers.", minDeals: 0 },
    { id: "grade-premium", name: "Premium", includes: "A branded hoodie, a cap and business cards with your code.", minDeals: 3 },
    { id: "grade-elite", name: "Elite", includes: "The full kit: a jacket, a branded bag and a framed partner certificate.", minDeals: 10 },
  ],
  merch: [
    {
      id: "merch-polo",
      name: "AV Homes polo shirt",
      summary: "Wine red with the AV Homes mark on the chest.",
      imageUrl: "",
      gradeId: "grade-standard",
      priceMinor: 0,
      sizes: ["S", "M", "L", "XL", "XXL"],
      stock: null,
      hidden: false,
    },
    {
      id: "merch-flyers",
      name: "Flyer pack",
      summary: "Fifty flyers with space to write your number and code.",
      imageUrl: "",
      gradeId: "grade-standard",
      priceMinor: 0,
      sizes: [],
      stock: null,
      hidden: false,
    },
    {
      id: "merch-hoodie",
      name: "AV Homes hoodie",
      summary: "Heavy cotton, for site visits on a cold morning.",
      imageUrl: "",
      gradeId: "grade-premium",
      priceMinor: 0,
      sizes: ["S", "M", "L", "XL", "XXL"],
      stock: null,
      hidden: false,
    },
    {
      id: "merch-cards",
      name: "Business cards",
      summary: "A box of 100 with your name, number and partner code.",
      imageUrl: "",
      gradeId: "grade-premium",
      priceMinor: 0,
      sizes: [],
      stock: null,
      hidden: false,
    },
    {
      id: "merch-elite-kit",
      name: "Elite partner kit",
      summary: "A jacket, a branded bag and a framed certificate.",
      imageUrl: "",
      gradeId: "grade-elite",
      priceMinor: 0,
      sizes: ["S", "M", "L", "XL", "XXL"],
      stock: null,
      hidden: false,
    },
  ],
};
