import { docToText, readingMinutes, wordCount as countWords } from "@avhomes/contracts";

import type { DocNode, PublicPost, PublicPostDetail } from "./types";

/**
 * Fixture posts for demo mode, and the source the seeder writes into MongoDB.
 *
 * ONE POST CARRIES THE KITCHEN SINK and the rest carry real bodies. The sink
 * exercises every node type and mark the renderer supports, including the
 * hostile hrefs the allow-list has to reject, so the reader stays verifiable
 * without the upstream service. Giving all fifteen the same body would make
 * that one useful document indistinguishable from filler, and would make the
 * seeded blog read as obviously fake the moment anyone clicked a second post.
 *
 * Word counts are COUNTED FROM THE BODY rather than typed in. A hand written
 * count is wrong the first time anyone edits a paragraph, and "1 min read" over
 * a long article is the kind of small lie that makes a reader distrust the rest
 * of the page.
 */

const p = (text: string): DocNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const h = (level: 2 | 3, text: string): DocNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const li = (text: string): DocNode => ({
  type: "listItem",
  content: [p(text)],
});

const task = (checked: boolean, text: string): DocNode => ({
  type: "taskItem",
  attrs: { checked },
  content: [p(text)],
});

const cell = (text: string, colwidth?: number[]): DocNode => ({
  type: "tableCell",
  attrs: colwidth ? { colwidth } : {},
  content: [p(text)],
});

const headerCell = (text: string, colwidth?: number[]): DocNode => ({
  type: "tableHeader",
  attrs: colwidth ? { colwidth } : {},
  content: [p(text)],
});

const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });
const ul = (...items: string[]): DocNode => ({ type: "bulletList", content: items.map(li) });
const ol = (...items: string[]): DocNode => ({ type: "orderedList", content: items.map(li) });
const quote = (text: string): DocNode => ({ type: "blockquote", content: [p(text)] });

const kitchenSink = (topic: string): DocNode => ({
  type: "doc",
  content: [
    p(
      `Every figure below is illustrative. ${topic} moves with the market, so treat these as a way to frame the question rather than a quote.`
    ),

    h(2, "What the numbers actually cover"),
    p(
      "Service charge, agency fees and legal costs are quoted separately more often than not, which makes two listings at the same headline price behave very differently once you have signed."
    ),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "The important distinction is between " },
        { type: "text", marks: [{ type: "bold" }], text: "recurring" },
        { type: "text", text: " costs and " },
        { type: "text", marks: [{ type: "italic" }], text: "one off" },
        { type: "text", text: " costs. Some agents will " },
        { type: "text", marks: [{ type: "strike" }], text: "quietly" },
        { type: "text", text: " roll the second into the first, and a line item marked " },
        { type: "text", marks: [{ type: "code" }], text: "misc" },
        { type: "text", text: " is worth " },
        { type: "text", marks: [{ type: "underline" }], text: "always" },
        { type: "text", text: " querying." },
      ],
    },

    quote(
      "Ask for the last twelve months of actual spend, not the budget. A budget is a plan. Spend is what happened."
    ),

    h(2, "A worked comparison"),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [headerCell("Line", [220]), headerCell("Quoted"), headerCell("Actual")],
        },
        {
          type: "tableRow",
          content: [cell("Security", [220]), cell("₦180,000"), cell("₦204,000")],
        },
        {
          type: "tableRow",
          content: [cell("Diesel", [220]), cell("₦420,000"), cell("₦655,000")],
        },
        {
          type: "tableRow",
          content: [cell("Grounds", [220]), cell("₦90,000"), cell("₦90,000")],
        },
      ],
    },

    h(3, "Before you sign"),
    {
      type: "taskList",
      content: [
        task(true, "Ask for twelve months of statements"),
        task(true, "Confirm who holds the sinking fund"),
        task(false, "Get the diesel reconciliation in writing"),
      ],
    },

    h(3, "The clause to read twice"),
    {
      type: "codeBlock",
      attrs: { language: "text" },
      content: [
        {
          type: "text",
          text: "The Manager may revise the Service Charge at its discretion\nupon thirty (30) days written notice to the Occupier.",
        },
      ],
    },
    p(
      "A revision clause with no cap and no arbitration route means the number you agreed is the number until somebody decides otherwise."
    ),

    { type: "horizontalRule" },

    h(3, "Further reading"),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "The Lagos State tenancy law is worth reading in full: " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "https://lagosstate.gov.ng" } }],
          text: "lagosstate.gov.ng",
        },
        { type: "text", text: ". A link like " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          text: "this one",
        },
        { type: "text", text: " is rejected by the renderer's allow-list rather than followed." },
      ],
    },
  ],
});

interface Seed {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  category: string;
  tags: string[];
  template: "magazine" | "minimal" | "editorial" | "technical";
  cover: string;
  coverAlt: string;
  published: string;
  updated: string;
  author: string;
  body: DocNode;
}

const seeds: Seed[] = [
  {
    slug: "lagos-service-charge-explained",
    title: "What service charge in Lagos actually covers, and what it should not",
    subtitle: "Two listings at the same price can cost very different amounts to live in",
    excerpt:
      "Service charge is the least understood line in a Lagos tenancy. Here is how to read one, what figure looks reasonable per square metre, and the charges you should push back on.",
    category: "Buying Guide",
    tags: ["Service charge", "Lagos", "Buying"],
    template: "magazine",
    cover: "/images/library/interior-07.jpg",
    coverAlt: "A serviced apartment interior in Lekki",
    published: "2026-08-04",
    updated: "2026-08-06",
    author: "Adaeze Vincent",
    body: kitchenSink("service charge"),
  },
  {
    slug: "off-plan-risk-checklist",
    title: "Buying off plan without getting burned: a nine point checklist",
    subtitle: "Off plan can be the best value on the market, or the most expensive mistake",
    excerpt:
      "Off plan can be the best value in the market. It can also be the fastest way to lose a deposit. The difference is nine questions asked before you sign anything.",
    category: "Buying Guide",
    tags: ["Off plan", "Risk", "Buying"],
    template: "magazine",
    cover: "/images/library/av-render-01.jpg",
    coverAlt: "A render of a development still under construction",
    published: "2026-07-22",
    updated: "2026-07-22",
    author: "Tobi Ade-Johnson",
    body: doc(
      p(
        "Off plan is the only way most buyers reach a finished home in a prime Lagos postcode at a price they can carry. It is also the only purchase where you hand over money for something that does not exist, on the strength of a render and a promise."
      ),
      p(
        "The nine questions below are ordered by how much they cost you if the answer turns out to be wrong."
      ),
      h(2, "Before the deposit"),
      ol(
        "Whose name is on the title, and is it the same entity you are paying?",
        "Has the development got planning approval, or only an application in progress?",
        "What has this developer finished, and can you visit one of those sites unaccompanied?",
        "Is your money going into an escrow or project account, or into general trading funds?"
      ),
      quote(
        "A developer who will not let you speak to buyers from the last project is telling you something about the last project."
      ),
      h(2, "In the contract"),
      ol(
        "What is the completion date, and what happens on the day it is missed?",
        "Is there a penalty running in your favour, or only a force majeure clause running in theirs?",
        "What exactly is the specification, down to the make of the fittings?",
        "How are price variations handled if materials move?",
        "What is the refund path if the project stops entirely?"
      ),
      h(2, "The one that catches people"),
      p(
        "Completion date and handover date are usually two different dates in the same contract, sometimes months apart. Completion is when the developer says the building is finished. Handover is when you get the keys. Ask which one the penalty clause is measured against, because a penalty tied to a date the developer controls is not a penalty."
      ),
      p(
        "None of this makes off plan a bad buy. It makes it a purchase that rewards paperwork, which is the opposite of how it is usually sold."
      )
    ),
  },
  {
    slug: "governors-consent-timeline",
    title: "Governor's consent: a realistic timeline for 2026",
    subtitle: "Everyone quotes three months, and almost nobody closes in three months",
    excerpt:
      "Everyone quotes three months. Here is what the process actually involves, where it stalls, and how to keep it moving without paying for speed you will not get.",
    category: "Legal",
    tags: ["Legal", "Consent", "Lagos"],
    template: "editorial",
    cover: "/images/library/exterior-06.jpg",
    coverAlt: "Rooftops across a Lagos neighbourhood at golden hour",
    published: "2026-07-09",
    updated: "2026-07-15",
    author: "Ifeanyi Okoro",
    body: doc(
      p(
        "Under the Land Use Act every transfer of a registered interest needs the Governor's consent. Without it the transaction is, in the language the courts use, inchoate. You have paid, you may be living there, and you cannot cleanly sell."
      ),
      h(2, "The stages, and what each one really takes"),
      ul(
        "Application and form 1C, with the deed. One to two weeks if your documents are complete.",
        "Charting and site verification. Two to six weeks, and the first place things stall.",
        "Valuation for consent fees and stamp duty. Three to eight weeks.",
        "Payment and assessment reconciliation. Two weeks, longer if the assessment is disputed.",
        "Execution and registration. Four to ten weeks."
      ),
      p(
        "Added up honestly that is four to seven months for a clean file, not three. Files with an inherited title, a deceased vendor or an unresolved excision run past a year."
      ),
      h(2, "Where it actually stalls"),
      p(
        "In our experience the delay is almost never the registry being slow for its own sake. It is a document that was incomplete on day one and only surfaced at charting: a survey that does not match the deed description, a vendor's own consent that was never obtained, or a company seller whose board resolution is missing."
      ),
      quote(
        "Every week you spend getting the file right before you submit saves roughly a month at the other end."
      ),
      h(2, "What not to pay for"),
      p(
        "There is a persistent market in expedited consent. What you are usually buying is someone who will walk your file between desks. That has some value. It does not compress valuation, and anyone promising a fixed two week turnaround is selling certainty they do not have."
      ),
      p(
        "Budget the time, complete the file before submission, and treat any quoted timeline that starts with the word only as marketing."
      )
    ),
  },
  {
    slug: "abuja-vs-lagos-yields",
    title: "Abuja versus Lagos rental yields, measured properly",
    subtitle: "Headline yields hide the vacancy that decides the return",
    excerpt:
      "Headline yields flatter Abuja and punish Lagos. Adjust for vacancy, service charge and turnover cost and two of the five segments swap places entirely.",
    category: "Investing",
    tags: ["Investing", "Yields", "Abuja"],
    template: "technical",
    cover: "/images/library/exterior-09.jpg",
    coverAlt: "A residential street in Maitama, Abuja",
    published: "2026-06-28",
    updated: "2026-07-02",
    author: "Adaeze Vincent",
    body: doc(
      p(
        "A gross yield is annual rent divided by purchase price. It is the number in every pitch deck and it is close to useless, because it assumes the unit is let every day of the year, costs nothing to hold, and never turns over."
      ),
      h(2, "The three adjustments that matter"),
      ol(
        "Vacancy. Abuja's civil service cycle produces longer voids than Lagos in the same price band.",
        "Service charge that the landlord carries rather than the tenant, which is common in serviced blocks.",
        "Turnover cost: agency commission on re-letting, repaint, and the fortnight of works between tenants."
      ),
      h(2, "What that does to the ranking"),
      p(
        "Applied to the five segments we track, two of them swap places. Mid market Abuja apartments look strong on gross yield and mid table on net, because their voids run longer. Lagos mainland family houses look unremarkable on gross and near the top on net, because tenants stay put for years and turnover costs barely register."
      ),
      quote(
        "The best net yield we have measured belongs to the least glamorous asset class on the list."
      ),
      h(2, "How to run it on a specific unit"),
      p(
        "Take the annual rent. Subtract an honest void allowance, which means asking the managing agent how long the last two lettings took, not what they hope. Subtract any charge you carry. Amortise the re-letting cost over the average tenancy length. Divide what is left by the all in purchase price, including consent and legal fees, not the headline price."
      ),
      p(
        "The number you get will be lower than the one you were shown. It will also be the one you actually receive."
      )
    ),
  },
  {
    slug: "snagging-list-handover",
    title: "The snagging list to bring to every handover inspection",
    subtitle: "Ordered by how expensive each item is to fix after you sign",
    excerpt:
      "A working snagging list, ordered by how expensive each item is to fix once you have taken the keys. Walk the unit twice and do not sign until the list is closed.",
    category: "Buying Guide",
    tags: ["Handover", "Snagging", "Buying"],
    template: "magazine",
    cover: "/images/library/interior-02.jpg",
    coverAlt: "An empty room at handover, before furniture",
    published: "2026-06-11",
    updated: "2026-06-11",
    author: "Tobi Ade-Johnson",
    body: doc(
      p(
        "Snagging is the last moment your leverage is worth anything. Before you sign, an outstanding defect is the developer's problem. After you sign it is a favour you are asking for."
      ),
      h(2, "Expensive to fix later"),
      ul(
        "Damp patches at skirting level, particularly on walls shared with a bathroom.",
        "Doors and windows that bind, which usually means the frame moved rather than the hinge.",
        "Falls on balconies and wet rooms running towards the building rather than the drain.",
        "Soil stack noise audible in a bedroom.",
        "Distribution board unlabelled, or circuits that do not match the label."
      ),
      h(2, "Cheap to fix, easy to forget"),
      ul(
        "Sealant lines around baths and worktops.",
        "Missing or mismatched ironmongery.",
        "Sockets set at inconsistent heights.",
        "Paint coverage in the back of cupboards and above door heads."
      ),
      h(2, "How to walk it"),
      p(
        "Twice, on different days, and at least once after dark so you see the lighting as installed rather than the daylight flattering it. Run every tap at once and watch the pressure. Flush every WC twice in succession. Open and close every door fully. Take a photograph of each defect with something in frame for scale, and number them to match your list."
      ),
      quote(
        "Sign the handover with the snag list attached and referenced in the document, or the list has no status at all."
      ),
      p(
        "Agree a date for the fixes in the same document. A list with no date is a wish."
      )
    ),
  },
  {
    slug: "solar-battery-payback",
    title: "Solar and battery in a Lagos duplex: the real payback period",
    subtitle: "Measured against diesel at the price you are actually paying",
    excerpt:
      "We ran the numbers against diesel at current prices for a four bedroom duplex. The payback is shorter than most installers claim, and the reason is not the panels.",
    category: "Sustainability",
    tags: ["Solar", "Energy", "Running costs"],
    template: "magazine",
    cover: "/images/library/exterior-10.jpg",
    coverAlt: "A duplex with a rooftop solar array",
    published: "2026-05-30",
    updated: "2026-06-03",
    author: "Ifeanyi Okoro",
    body: doc(
      p(
        "Most solar payback calculations compare the system against a grid tariff. In Lagos that is the wrong comparison, because the grid is not what you are actually running on for a good part of the day."
      ),
      h(2, "Compare against diesel, not the tariff"),
      p(
        "The honest benchmark is your generator's fuel bill plus its servicing plus the rebuild you are amortising whether you think about it or not. Once the generator is in the comparison the arithmetic changes completely, because diesel is the most expensive electricity in the country."
      ),
      h(2, "Where the money actually goes"),
      ul(
        "Panels are the cheapest part of the system and getting cheaper.",
        "The battery is the expensive part and the part that wears out.",
        "The inverter sits in the middle and is where the false economies get made.",
        "Installation and cabling are the line most quotes understate."
      ),
      quote(
        "You are not buying solar. You are buying storage, and paying for the panels that fill it."
      ),
      h(2, "The result for a four bedroom duplex"),
      p(
        "Sized to carry the house overnight without the generator starting, and measured against the diesel it displaces rather than against the tariff, the payback lands well inside the battery's warranty. Size it to run air conditioning through the afternoon as well and the payback stretches past the point where you are replacing cells, which is where a lot of oversized systems quietly stop making sense."
      ),
      p(
        "Size for the load you cannot tolerate losing, not the load you have. That single decision moves the payback more than any equipment choice."
      )
    ),
  },
  {
    slug: "verify-land-title-lagos",
    title: "How to verify a land title in Lagos before you pay a naira",
    subtitle: "The search costs a fraction of the deposit you are about to lose",
    excerpt:
      "A title search at the Lands Bureau costs a small fraction of a deposit. Here is what to ask for, what the result actually tells you, and the three red flags that end a deal.",
    category: "Legal",
    tags: ["Legal", "Title", "Lagos", "Buying"],
    template: "editorial",
    cover: "/images/library/exterior-03.jpg",
    coverAlt: "A surveyed plot on the Lagos mainland",
    published: "2026-05-14",
    updated: "2026-05-19",
    author: "Ifeanyi Okoro",
    body: doc(
      p(
        "Almost every land dispute we see could have been avoided by a search that cost less than one percent of the money at risk. The search is not the hard part. Knowing what the result means is."
      ),
      h(2, "What to obtain"),
      ol(
        "A certified true copy of the root of title, whatever the seller claims it is.",
        "A charting report against the survey plan, to confirm the land is where the seller says and is not under government acquisition.",
        "A search at the Lands Registry on the specific title number, not on the seller's name."
      ),
      h(2, "Reading the result"),
      p(
        "Charting is the step that catches the most expensive problems. It tells you whether the parcel falls within a committed government acquisition, a road setback, or an area already excised to a family. A plot can have a perfectly genuine deed and still be unbuildable because it sits in a drainage reserve."
      ),
      quote(
        "A genuine document proving ownership of land the state has already committed elsewhere is still a genuine document. It is just not worth what you are paying."
      ),
      h(2, "Three red flags"),
      ul(
        "The seller offers a survey plan but resists charting it.",
        "The root of title is a deed of assignment whose own chain stops at a name nobody can produce a consent for.",
        "The price is meaningfully below the street, and the explanation involves urgency."
      ),
      p(
        "Every one of those is survivable with the right advice. None of them is survivable by hoping."
      )
    ),
  },
  {
    slug: "lagos-two-year-rent-advance",
    title: "What a two year rent advance really costs you",
    subtitle: "The headline rent is not the number that leaves your account",
    excerpt:
      "Lagos still runs on advance rent. Once you price the money you hand over up front, a cheaper annual rent can be the more expensive tenancy.",
    category: "Renting",
    tags: ["Renting", "Lagos", "Running costs"],
    template: "minimal",
    cover: "/images/library/interior-05.jpg",
    coverAlt: "A living room in a let apartment",
    published: "2026-04-28",
    updated: "2026-04-28",
    author: "Adaeze Vincent",
    body: doc(
      p(
        "Two years up front is still normal in much of Lagos, and the Lagos State tenancy law's limits are honoured more in the breach than the observance. Whatever the legal position, the practical question is what the arrangement costs you."
      ),
      h(2, "Price the money, not just the rent"),
      p(
        "Money you hand over in month one for occupation in month twenty is money you could have held. At any realistic rate of return, two years in advance on a mid market flat costs meaningfully more over the term than a slightly higher rent paid annually."
      ),
      h(2, "The costs that ride along"),
      ul(
        "Agency fee, commonly ten percent.",
        "Legal or agreement fee, commonly another ten percent.",
        "Caution or damage deposit, refundable in theory.",
        "Service charge, often a full year in advance alongside the rent."
      ),
      p(
        "On a two year term those extras land almost entirely in the first payment, which is why the cheque is so much larger than twice the annual rent."
      ),
      quote(
        "Compare tenancies on total cash out in year one, then on total cost over the term. The ranking often changes between the two."
      ),
      h(2, "What is negotiable"),
      p(
        "More than most tenants assume. Landlords with a vacant unit and a mortgage are frequently open to one year at a premium, or two years with the second year's service charge deferred. The worst outcome of asking is a no."
      )
    ),
  },
  {
    slug: "short-let-versus-long-let-lekki",
    title: "Short let versus long let in Lekki, with the costs both sides leave out",
    subtitle: "Higher nightly rates, and a business rather than an investment",
    excerpt:
      "Short let headline returns in Lekki look extraordinary next to an annual tenancy. Then you add management, voids, wear and the service charge nobody mentions.",
    category: "Investing",
    tags: ["Investing", "Short let", "Lekki"],
    template: "technical",
    cover: "/images/library/interior-09.jpg",
    coverAlt: "A furnished short let apartment",
    published: "2026-04-09",
    updated: "2026-04-12",
    author: "Tobi Ade-Johnson",
    body: doc(
      p(
        "A well run Lekki short let can gross two to three times the equivalent annual tenancy. That number is real. It is also gross, and short let is the one property strategy where the gap between gross and net is enormous."
      ),
      h(2, "What comes off the top"),
      ul(
        "Platform commission, plus payment processing.",
        "Management, whether you pay an operator or absorb it yourself as unpaid work.",
        "Cleaning and laundry between every stay.",
        "Consumables, replacements, and the furniture cycle, which runs at roughly three years rather than ten.",
        "Power, water and internet, which in a long let are the tenant's problem."
      ),
      h(2, "Occupancy is the whole game"),
      p(
        "Everything turns on nights sold. At high occupancy short let comfortably beats an annual tenancy. At moderate occupancy the two converge. Below that, an annual tenancy wins and does not require you to answer the phone at midnight."
      ),
      quote(
        "A long let is an investment. A short let is a small hospitality business that happens to own one apartment."
      ),
      h(2, "The service charge question"),
      p(
        "Many Lekki blocks now price service charge differently for short let units, or prohibit them outright in the estate rules. Check the deed of assignment and the estate regulations before you buy on a short let assumption. Discovering the restriction after you have furnished the unit is an expensive way to learn it."
      )
    ),
  },
  {
    slug: "lekki-versus-ajah",
    title: "Lekki or Ajah: what the price difference actually buys",
    subtitle: "Twenty minutes of road, and a very different set of trade offs",
    excerpt:
      "The same budget buys a one bedroom in Lekki Phase 1 or a three bedroom past Ajah. Here is what changes besides the square metres.",
    category: "Neighbourhoods",
    tags: ["Neighbourhoods", "Lekki", "Ajah", "Buying"],
    template: "magazine",
    cover: "/images/library/exterior-04.jpg",
    coverAlt: "A residential street on the Lekki peninsula",
    published: "2026-03-21",
    updated: "2026-03-25",
    author: "Adaeze Vincent",
    body: doc(
      p(
        "It is the most common question we get from first time buyers on the peninsula, and the honest answer is that the two are not really competing for the same buyer."
      ),
      h(2, "What the money buys"),
      p(
        "The same budget that reaches a one bedroom in Lekki Phase 1 reaches a three bedroom terrace past Ajah with room to spare. On floor area alone the decision looks obvious, which is why so many people make it on floor area alone."
      ),
      h(2, "What changes with it"),
      ul(
        "Commute. The corridor is one road, and one road means one incident between you and the office.",
        "Infrastructure. Drainage, power and water reliability still thin out as you go east.",
        "Resale depth. Phase 1 has buyers at every price point. Further east the buyer pool is narrower and slower.",
        "Estate quality. Past Ajah the range between a well run estate and a badly run one is enormous."
      ),
      quote(
        "Buying east is a bet on the road and the drainage. Both are improving. Neither is finished."
      ),
      h(2, "How to decide"),
      p(
        "If you commute daily to the island and value your evenings, the smaller unit closer in is usually the better life even though it is the worse spreadsheet. If you work from home, or your journey runs the other way, the extra bedrooms are close to free money."
      ),
      p(
        "Whichever you choose, spend the day before you commit doing the actual journey at the actual hour. Nothing on a floor plan tells you what that road is like at seven in the morning."
      )
    ),
  },
  {
    slug: "building-costs-per-square-metre-2026",
    title: "What it costs to build per square metre in 2026",
    subtitle: "Shell, finish and the gap between a quote and an outturn",
    excerpt:
      "Build cost ranges for Lagos and Abuja in 2026, split by shell and finish, with the contingency that keeps a project from stopping halfway.",
    category: "Building",
    tags: ["Building", "Costs", "Development"],
    template: "technical",
    cover: "/images/library/av-render-03.jpg",
    coverAlt: "A residential development under construction",
    published: "2026-03-05",
    updated: "2026-03-10",
    author: "Ifeanyi Okoro",
    body: doc(
      p(
        "Build cost per square metre is the most requested and least reliable number in Nigerian development. It moves with the exchange rate, with cement, and with how far your site is from a decent road."
      ),
      h(2, "Split the number in two"),
      p(
        "Shell and core behaves fairly predictably: it is structure, blockwork, roof and a weathertight envelope, and it is driven by cement, steel and labour. Finishes are where the range explodes, because the difference between a competent local specification and an imported one is a multiple, not a percentage."
      ),
      h(2, "What actually moves it"),
      ul(
        "Site access. A site a lorry cannot reach adds cost to every single delivery for the whole programme.",
        "Ground conditions. Reclaimed or waterlogged ground can put a large sum into the foundation before anything is visible.",
        "Programme length. Time is the silent cost, through supervision, security and inflation on unbought materials.",
        "Procurement. Buying steel and cement early is a hedge; buying finishes early is usually just storage risk."
      ),
      quote(
        "The most expensive projects we see are not the ones with the highest specification. They are the ones that stopped for six months."
      ),
      h(2, "Contingency"),
      p(
        "A contingency below ten percent is not a contingency, it is optimism with a line item. For a renovation or anything involving existing ground, fifteen is more honest. The purpose is not to cover mistakes. It is to keep the project moving when the exchange rate moves, because a stopped site costs more than almost any variation."
      )
    ),
  },
  {
    slug: "abuja-estate-service-charge",
    title: "Service charge in Abuja estates, and why it varies so much",
    subtitle: "Two estates a kilometre apart, and double the charge",
    excerpt:
      "Abuja service charges range more widely than Lagos ones for reasons that are mostly structural. Here is what drives the difference and what to ask before you commit.",
    category: "Renting",
    tags: ["Service charge", "Abuja", "Renting"],
    template: "minimal",
    cover: "/images/library/exterior-11.jpg",
    coverAlt: "An estate street in Abuja",
    published: "2026-02-18",
    updated: "2026-02-18",
    author: "Adaeze Vincent",
    body: doc(
      p(
        "Two Abuja estates a kilometre apart, similar unit sizes, and service charges that differ by a factor of two. The reason is rarely that one is being greedy."
      ),
      h(2, "What drives the spread"),
      ul(
        "Whether the estate carries its own water treatment or is on a mains supply that works.",
        "Whether power is estate generated, hybrid, or genuinely grid dominant.",
        "Road and drainage adoption. An unadopted estate maintains its own roads forever.",
        "Occupancy. A half sold estate splits the same fixed costs between half the households."
      ),
      p(
        "That last one catches buyers in new developments repeatedly. The charge quoted at launch assumes full occupancy that may be years away, and the shortfall lands on whoever has already moved in."
      ),
      quote(
        "Ask what the charge would be at today's occupancy, not at the occupancy in the brochure."
      ),
      h(2, "Questions worth asking"),
      ol(
        "Who sets the charge, and can residents vote on it?",
        "Is there a sinking fund, who holds it, and what is in it?",
        "What were the actual accounts for the last two years?",
        "What happens to a defaulting household, and how many are currently in default?"
      ),
      p(
        "The last question is the most revealing and the least often asked. Widespread default in an estate means the paying residents are covering the rest, whether or not anyone says so out loud."
      )
    ),
  },
  {
    slug: "flood-risk-lekki-epe-corridor",
    title: "Reading flood risk on the Lekki-Epe corridor",
    subtitle: "Drainage, elevation and the questions a site visit cannot answer",
    excerpt:
      "The corridor floods unevenly, and the pattern is more predictable than it looks. What to check on a plot, and what a dry season viewing will never show you.",
    category: "Neighbourhoods",
    tags: ["Neighbourhoods", "Flood risk", "Lekki", "Due diligence"],
    template: "editorial",
    cover: "/images/library/exterior-13.jpg",
    coverAlt: "Low lying land along the Lekki-Epe corridor",
    published: "2026-01-30",
    updated: "2026-02-04",
    author: "Ifeanyi Okoro",
    body: doc(
      p(
        "Flooding on the corridor is not random, and it is not uniform. Two plots on the same street can behave completely differently, and the difference is usually visible if you know what to look at."
      ),
      h(2, "What to look at on the plot"),
      ul(
        "Relative elevation against the road and against the neighbours, not absolute height.",
        "Whether the estate's drainage discharges somewhere, or simply ends.",
        "Sand fill depth, and whether it was placed and compacted or merely tipped.",
        "The high water mark on neighbouring fences and gateposts, which is often still visible months later."
      ),
      h(2, "What a viewing will not tell you"),
      p(
        "A plot viewed in January tells you nothing about July. If you cannot visit in the rains, the next best evidence is the people already living there. Ask a resident two streets over, not the agent, and ask specifically about the worst week rather than the average year."
      ),
      quote(
        "Everyone will tell you it does not flood. Ask instead how high it came, and how long it stayed."
      ),
      h(2, "Filling is not a solution on its own"),
      p(
        "Raising your plot above your neighbours moves the water rather than removing it, and it works only until they raise theirs. Estates that have solved this did it at estate level, with a drainage plan and somewhere for the water to go. Estates that left it to individual buyers are in a slow arms race that the last person to build always loses."
      ),
      p(
        "None of this makes the corridor a bad place to buy. It makes drainage a question you ask before price."
      )
    ),
  },
  {
    slug: "mortgage-or-developer-payment-plan",
    title: "Mortgage or developer payment plan: which is actually cheaper",
    subtitle: "One has an interest rate. The other has one too, it is just not printed",
    excerpt:
      "Developer payment plans advertise no interest. Compare the plan price against the outright price and the implied rate appears, sometimes above a mortgage.",
    category: "Finance",
    tags: ["Finance", "Mortgage", "Buying"],
    template: "technical",
    cover: "/images/library/interior-11.jpg",
    coverAlt: "A finished apartment interior",
    published: "2026-01-12",
    updated: "2026-01-16",
    author: "Tobi Ade-Johnson",
    body: doc(
      p(
        "Nigerian mortgage rates make developer payment plans look attractive, and the marketing leans hard on the phrase no interest. There is almost always interest. It is just expressed as a price difference rather than a rate."
      ),
      h(2, "Find the implied rate"),
      p(
        "Ask for two numbers: the price if you pay outright today, and the total you will pay across the instalment plan. The gap between them, spread over the plan's term, is the interest. Converting it to an annual rate takes a minute and is frequently the single most useful minute in the whole purchase."
      ),
      quote(
        "A twelve percent price premium over an eighteen month plan is not a twelve percent rate. It is considerably worse."
      ),
      h(2, "Where each one wins"),
      ul(
        "Payment plans win on access: no credit assessment, no perfected title required up front, and speed.",
        "Mortgages win on cost when the implied rate on the plan runs above the mortgage rate, which it often does on shorter plans.",
        "Payment plans carry completion risk that a mortgage on a finished unit does not.",
        "Mortgages carry the requirement that the title is clean enough for a bank, which is itself a form of due diligence you get for free."
      ),
      h(2, "The point most buyers miss"),
      p(
        "A bank refusing to lend against a specific unit is information. It usually means the title, the developer or the valuation did not survive scrutiny by an institution with money at stake. A payment plan asks none of those questions, which is exactly why it is available."
      )
    ),
  },
  {
    slug: "inspecting-a-lagos-duplex",
    title: "Inspecting a Lagos duplex: the walk that saves you millions",
    subtitle: "Two hours, a torch, and a willingness to be impolite",
    excerpt:
      "A structured inspection of a resale duplex, in the order that finds the expensive problems first. Bring a torch and be prepared to open things.",
    category: "Buying Guide",
    tags: ["Buying", "Inspection", "Lagos", "Due diligence"],
    template: "magazine",
    cover: "/images/library/exterior-08.jpg",
    coverAlt: "A detached duplex in a Lagos estate",
    published: "2025-12-15",
    updated: "2025-12-18",
    author: "Ifeanyi Okoro",
    body: doc(
      p(
        "Most viewings are conducted like social visits. You are shown the kitchen, you admire the kitchen, you leave. A proper inspection takes two hours and requires you to open cupboards, lift covers and ask questions the agent would rather you did not."
      ),
      h(2, "Start outside and underneath"),
      ul(
        "Walk the perimeter. Look at the ground level against the damp course, and at where rainwater lands.",
        "Open the septic and soakaway covers. Ask when it was last emptied.",
        "Look at the roof from the compound and from a neighbour's upper window if you can.",
        "Check the borehole: depth, pump age, and whether the water is treated."
      ),
      h(2, "Then the services"),
      p(
        "The distribution board tells you most of what you need to know about the electrical installation. Unlabelled circuits, mixed cable colours, and evidence of repeated modification all point the same direction. Run the generator. Switch the changeover. Watch what happens to the lights."
      ),
      quote(
        "In a resale duplex the roof, the plumbing stack and the electrical installation are where the real money is. Everything else is decoration."
      ),
      h(2, "Finally the finishes"),
      p(
        "Only once the expensive systems check out is it worth caring about tiles and paint. Doing it in the other order is how buyers fall in love with a kitchen in a house that needs rewiring."
      ),
      h(2, "Bring the right people"),
      p(
        "For anything above a certain value, a builder and an electrician for a couple of hours is trivially cheap against the purchase price, and they will see in ten minutes what you would miss entirely. Go back a second time, alone, and just stand in the rooms."
      )
    ),
  },
];

function toPost(seed: Seed): PublicPost {
  // The same three helpers a real save runs, so a seeded post and an authored
  // one cannot disagree about how long the same document takes to read.
  const wordCount = countWords(docToText(seed.body));
  return {
    id: `demo_${seed.slug}`,
    slug: seed.slug,
    title: seed.title,
    subtitle: seed.subtitle,
    excerpt: seed.excerpt,
    coverImage: {
      url: seed.cover,
      alt: seed.coverAlt,
      focalPoint: "50% 50%",
      width: 1600,
      height: 900,
    },
    category: seed.category,
    tags: seed.tags,
    template: seed.template,
    publishedAt: Date.parse(`${seed.published}T09:00:00Z`),
    updatedAt: Date.parse(`${seed.updated}T09:00:00Z`),
    wordCount,
    readingTime: readingMinutes(wordCount),
    author: { name: seed.author },
  };
}

export const demoPosts: PublicPost[] = seeds.map(toPost);

export const demoPostDetails: PublicPostDetail[] = seeds.map((seed) => ({
  ...toPost(seed),
  content: seed.body,
}));

/** The seeder needs the raw seeds, not just the public projection. */
export const demoPostSeeds = seeds;
