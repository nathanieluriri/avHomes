import type { Agent, ListingFee, PriceChange, Property, RentPeriod, SiteStat, Testimonial } from "@avhomes/contracts";
import { normalizeFees, readRentPeriod } from "@avhomes/contracts";

/**
 * Bundled fixtures.
 *
 * They exist so `next build` renders every page with no MONGODB_URI, and so a
 * freshly cloned checkout looks like the real site before anyone has seeded a
 * database. The data layer falls back to them and says so in the log; a
 * deployment with a working database never reaches them.
 *
 * The literals below are written in READABLE units (naira, "For Sale", an ISO
 * date) and normalised into the stored contract by `toProperty` at the bottom.
 * Writing minor units and epoch milliseconds by hand is how a fixture quietly
 * stops matching what the application actually stores.
 */


const L = "/images/library";
const ext = (n: number) => `${L}/exterior-${String(n).padStart(2, "0")}.jpg`;
const int = (n: number) => `${L}/interior-${String(n).padStart(2, "0")}.jpg`;

const agents: Agent[] = [
  {
    id: "agent-1",
    name: "Adaeze Vincent",
    role: "Senior Property Consultant",
    phone: "+234 801 234 5678",
    email: "adaeze@avhomes.com",
    avatarUrl: `${L}/person-06.jpg`,
  },
  {
    id: "agent-2",
    name: "Tobi Ade-Johnson",
    role: "Luxury Homes Advisor",
    phone: "+234 809 876 5432",
    email: "tobi@avhomes.com",
    avatarUrl: `${L}/person-02.jpg`,
  },
  {
    id: "agent-3",
    name: "Ifeanyi Okoro",
    role: "Land and Estates Lead",
    phone: "+234 803 111 2244",
    email: "ifeanyi@avhomes.com",
    avatarUrl: `${L}/person-04.jpg`,
  },
];

type PropertySeed = Omit<
  Property,
  | "priceMinor"
  | "currency"
  | "status"
  | "listingType"
  | "rentPeriod"
  | "fees"
  | "priceHistory"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
  | "deletedAt"
  | "revision"
  | "agentUserId"
  | "featured"
> & {
  price: number;
  status: "For Sale" | "For Rent" | "Sold" | "Under Offer" | "Let Agreed" | "Let";
  /** Rentals only. Omitted means "year", the same default `readRentPeriod` gives a legacy row. */
  rentPeriod?: RentPeriod;
  fees?: ListingFee[];
  /** Epoch ms. Written with `Date.parse` at the call site, same as `createdAt` below. */
  priceHistory?: PriceChange[];
  createdAt: string;
  featured?: boolean;
};

const propertySeeds: PropertySeed[] = [
  {
    id: "1",
    slug: "tropical-oasis-lekki",
    title: "Tropical Oasis",
    tagline: "Pool villa in a gated Lekki estate",
    description:
      "A private pool villa wrapped in modern amenities, set within a quiet gated Lekki estate. Sun washed interiors, floor to ceiling glazing, and a resort style garden make this a rare full time or weekend retreat.",
    price: 245000000,
    status: "For Sale",
    fees: [
      { kind: "agency", amountMinor: 1225000000, currency: "NGN" },
      { kind: "legal", amountMinor: 735000000, currency: "NGN" },
    ],
    type: "Villa",
    location: "Lekki Phase 1, Lagos",
    city: "Lagos",
    address: "12 Admiralty Way, Lekki Phase 1, Lagos",
    bedrooms: 5,
    bathrooms: 6,
    areaSqft: 4200,
    parkingSpaces: 3,
    yearBuilt: 2022,
    featured: true,
    amenities: ["Private Pool", "Smart Home System", "24/7 Security", "Fitness Center", "Backup Power", "Landscaped Garden"],
    images: [`${L}/av-render-01.jpg`, `${L}/av-render-02.jpg`, int(1), int(7)],
    agent: agents[0],
    createdAt: "2026-06-01",
  },
  {
    id: "2",
    slug: "banana-island-mansion",
    title: "The Banana Island Mansion",
    tagline: "Waterfront statement home with infinity pool",
    description:
      "Six bedrooms arranged around a double height atrium, opening onto an infinity pool that reads straight into the lagoon. Imported stone, a full staff wing, and a garage that takes six cars.",
    price: 1250000000,
    status: "For Sale",
    type: "Mansion",
    location: "Banana Island, Ikoyi",
    city: "Lagos",
    address: "7 Ocean Parade, Banana Island, Ikoyi, Lagos",
    bedrooms: 6,
    bathrooms: 7,
    areaSqft: 9800,
    parkingSpaces: 6,
    yearBuilt: 2023,
    featured: true,
    amenities: ["Infinity Pool", "Private Jetty", "Cinema Room", "Staff Quarters", "Elevator", "Wine Cellar", "Gym"],
    images: [ext(2), int(2), int(8), int(11)],
    agent: agents[1],
    createdAt: "2026-07-14",
  },
  {
    id: "3",
    slug: "ikoyi-glass-house",
    title: "Ikoyi Glass House",
    tagline: "Timber and glass, wrapped around a courtyard tree",
    description:
      "An architect's own home. Blackened timber cladding, a two storey glazed spine, and living space that folds fully open onto the lawn. Quiet, warm, and unlike anything else on the island.",
    price: 480000000,
    status: "For Sale",
    // Reduced from 495,000,000 three weeks ago, so the "Price reduced" marker has a fixture to render on.
    priceHistory: [
      {
        at: Date.parse("2026-08-20T09:00:00Z"),
        fromMinor: 49500000000,
        toMinor: 48000000000,
        currency: "NGN",
        byUserId: null,
        byName: "Adaeze Vincent",
      },
    ],
    type: "Duplex",
    location: "Old Ikoyi, Lagos",
    city: "Lagos",
    address: "4 Bourdillon Road, Old Ikoyi, Lagos",
    bedrooms: 4,
    bathrooms: 5,
    areaSqft: 5100,
    parkingSpaces: 3,
    yearBuilt: 2021,
    featured: true,
    amenities: ["Courtyard Garden", "Double Height Living", "Study", "Solar Array", "Smart Lighting"],
    images: [ext(1), int(1), int(3), int(9)],
    agent: agents[0],
    createdAt: "2026-05-18",
  },
  {
    id: "4",
    slug: "victoria-island-penthouse",
    title: "Skyline Penthouse",
    tagline: "Full floor penthouse over Victoria Island",
    description:
      "The entire top floor, wrapped in glass on three sides. A 20 metre terrace runs the length of the living space, and the primary suite looks straight down the lagoon at sunset.",
    price: 18500000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Penthouse",
    location: "Victoria Island, Lagos",
    city: "Lagos",
    address: "18 Adeola Odeku Street, Victoria Island, Lagos",
    bedrooms: 3,
    bathrooms: 4,
    areaSqft: 3400,
    parkingSpaces: 3,
    yearBuilt: 2024,
    featured: true,
    amenities: ["Wraparound Terrace", "Concierge", "Private Lift Lobby", "Gym", "Backup Power"],
    images: [ext(3), int(4), int(10), int(12)],
    agent: agents[1],
    createdAt: "2026-07-30",
  },
  {
    id: "5",
    slug: "lekki-palm-residence",
    title: "Palm Residence",
    tagline: "Poolside family home under mature palms",
    description:
      "Built for a family that lives outdoors. A shaded loggia runs the full width of the house, the pool sits in afternoon sun, and every bedroom opens to a balcony.",
    price: 9800000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Villa",
    location: "Chevron Drive, Lekki",
    city: "Lagos",
    address: "27 Chevron Drive, Lekki, Lagos",
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 3600,
    parkingSpaces: 2,
    yearBuilt: 2020,
    featured: true,
    amenities: ["Swimming Pool", "Loggia", "Study", "Community Garden", "24/7 Security"],
    images: [ext(4), int(5), int(7), int(11)],
    agent: agents[2],
    createdAt: "2026-06-20",
  },
  {
    id: "6",
    slug: "baraks-road-bungalow",
    title: "Baraks Road Bungalow",
    tagline: "Completed three bedroom, move in ready",
    description:
      "A compact, well finished bungalow delivered by the AV Constructions team. Granite entrance steps, terrazzo floors, mature planting, and a walled compound with parking for three.",
    price: 62000000,
    status: "For Sale",
    type: "Bungalow",
    location: "Baraks Road, Calabar",
    city: "Calabar",
    address: "18 Baraks Road, Calabar, Cross River",
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1750,
    parkingSpaces: 3,
    yearBuilt: 2022,
    amenities: ["Walled Compound", "Borehole", "Terrazzo Floors", "Mature Planting"],
    images: [`${L}/av-photo-01.jpg`, `${L}/av-photo-02.jpg`, `${L}/av-photo-03.jpg`],
    agent: agents[2],
    createdAt: "2026-04-02",
  },
  {
    id: "7",
    slug: "maitama-terrace",
    title: "Maitama Terrace",
    tagline: "Four bedroom terrace on a quiet diplomatic street",
    description:
      "One of six terraces on a gated close, each with a private rear garden. Generous ceiling heights, a proper utility room, and covered parking at the door.",
    price: 7200000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Terrace",
    location: "Maitama, Abuja",
    city: "Abuja",
    address: "9 Gana Street, Maitama, Abuja",
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 2600,
    parkingSpaces: 2,
    yearBuilt: 2021,
    amenities: ["Private Rear Garden", "Utility Room", "Covered Parking", "Gated Close"],
    images: [ext(5), int(6), int(9)],
    agent: agents[2],
    createdAt: "2026-07-05",
  },
  {
    id: "8",
    slug: "asokoro-hillside-villa",
    title: "Asokoro Hillside Villa",
    tagline: "Set back on a hill, long views over the city",
    description:
      "A generous villa on a sloping plot, arranged so the main living level catches the view. Deep eaves keep it cool through the afternoon.",
    price: 395000000,
    status: "For Sale",
    type: "Villa",
    location: "Asokoro, Abuja",
    city: "Abuja",
    address: "3 Yedseram Street, Asokoro, Abuja",
    bedrooms: 5,
    bathrooms: 5,
    areaSqft: 4800,
    parkingSpaces: 4,
    yearBuilt: 2019,
    amenities: ["Hillside Views", "Deep Eaves", "Guest Wing", "Backup Power", "Borehole"],
    images: [ext(6), int(2), int(8)],
    agent: agents[1],
    createdAt: "2026-03-22",
  },
  {
    id: "9",
    slug: "gwarinpa-family-home",
    title: "Gwarinpa Family Home",
    tagline: "Practical five bedroom on a full plot",
    description:
      "A straightforward, well built family house with room to grow. Big kitchen, separate dining, and a rear yard that already has the slab down for an extension.",
    price: 148000000,
    status: "For Sale",
    type: "Townhouse",
    location: "Gwarinpa, Abuja",
    city: "Abuja",
    address: "41 3rd Avenue, Gwarinpa Estate, Abuja",
    bedrooms: 5,
    bathrooms: 4,
    areaSqft: 3200,
    parkingSpaces: 3,
    yearBuilt: 2018,
    amenities: ["Large Kitchen", "Separate Dining", "Rear Yard", "Boys Quarters"],
    images: [ext(7), int(7), int(10)],
    agent: agents[2],
    createdAt: "2026-02-11",
  },
  {
    id: "10",
    slug: "wuse-studio-loft",
    title: "Wuse Studio Loft",
    tagline: "Compact loft, walkable to everything, let by the night",
    description:
      "A well planned studio with a proper sleeping alcove rather than a corner. Good light, good storage, and a building with a lift that actually works. Run as a short let, so it comes furnished and serviced.",
    price: 85000,
    status: "For Rent",
    rentPeriod: "night",
    type: "Studio",
    location: "Wuse 2, Abuja",
    city: "Abuja",
    address: "12 Aminu Kano Crescent, Wuse 2, Abuja",
    bedrooms: 1,
    bathrooms: 1,
    areaSqft: 720,
    parkingSpaces: 1,
    yearBuilt: 2022,
    amenities: ["Sleeping Alcove", "Lift", "Concierge", "Backup Power"],
    images: [ext(8), int(4), int(12)],
    agent: agents[0],
    createdAt: "2026-07-18",
  },
  {
    id: "11",
    slug: "jabi-lakeview-apartment",
    title: "Jabi Lakeview Apartment",
    tagline: "Three bedroom with a balcony over the water",
    description:
      "Corner unit on the seventh floor, so the balcony gets both the lake and the evening light. Quiet building, mostly long term residents.",
    price: 5400000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Apartment",
    location: "Jabi, Abuja",
    city: "Abuja",
    address: "Block C, Lakeview Court, Jabi, Abuja",
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1650,
    parkingSpaces: 2,
    yearBuilt: 2023,
    amenities: ["Lake View Balcony", "Corner Unit", "Lift", "Gym", "24/7 Security"],
    images: [ext(9), int(3), int(11)],
    agent: agents[0],
    createdAt: "2026-06-28",
  },
  {
    id: "12",
    slug: "katampe-hilltop-estate",
    title: "Katampe Hilltop Estate",
    tagline: "New build, last two units remaining",
    description:
      "Part of a nine unit development on the ridge. Handover finish is high: stone worktops, fitted wardrobes throughout, and solar with battery backup as standard.",
    price: 210000000,
    status: "For Sale",
    type: "Duplex",
    location: "Katampe Extension, Abuja",
    city: "Abuja",
    address: "Plot 22, Katampe Extension, Abuja",
    bedrooms: 4,
    bathrooms: 5,
    areaSqft: 3900,
    parkingSpaces: 3,
    yearBuilt: 2025,
    featured: true,
    amenities: ["Solar with Battery", "Stone Worktops", "Fitted Wardrobes", "Gated Estate", "Borehole"],
    images: [ext(10), int(5), int(9), int(12)],
    agent: agents[1],
    createdAt: "2026-08-01",
  },

  {
    id: "13",
    slug: "oniru-beachfront-apartment",
    title: "Oniru Beachfront Apartment",
    tagline: "Three bed with an ocean-facing balcony",
    description:
      "A corner unit on the seventh floor, so the balcony gets the water on one side and the estate's gardens on the other. Service charge covers the pool, the gym and a manned gate. Let as a serviced apartment, billed monthly.",
    price: 750000,
    status: "For Rent",
    rentPeriod: "month",
    fees: [
      { kind: "agency", amountMinor: 90000000, currency: "NGN" },
      { kind: "legal", amountMinor: 45000000, currency: "NGN" },
      { kind: "caution", amountMinor: 75000000, currency: "NGN" },
      { kind: "service-charge", amountMinor: 30000000, currency: "NGN" },
    ],
    type: "Apartment",
    location: "Oniru, Victoria Island, Lagos",
    city: "Lagos",
    address: "Block C, Ocean Parade, Oniru, Lagos",
    bedrooms: 3,
    bathrooms: 3,
    areaSqft: 1850,
    parkingSpaces: 2,
    yearBuilt: 2021,
    amenities: ["Ocean View", "Shared Pool", "Gym", "Concierge", "Backup Power"],
    images: [ext(4), int(2), int(8)],
    agent: agents[1],
    createdAt: "2026-07-14",
  },
  {
    id: "14",
    slug: "ikeja-gra-family-house",
    title: "Ikeja GRA Family House",
    tagline: "Mature garden, five minutes from the airport road",
    description:
      "A 1990s build on a generous plot, updated twice and kept well. The garden is the reason to see it: established trees, a lawn that takes a marquee, and a boys quarters at the back.",
    price: 165000000,
    status: "For Sale",
    type: "Duplex",
    location: "Ikeja GRA, Lagos",
    city: "Lagos",
    address: "8 Sobo Arobiodu Street, Ikeja GRA, Lagos",
    bedrooms: 5,
    bathrooms: 4,
    areaSqft: 3600,
    parkingSpaces: 4,
    yearBuilt: 1996,
    amenities: ["Mature Garden", "Boys Quarters", "Borehole", "Gated Street"],
    images: [ext(6), int(3), int(11)],
    agent: agents[2],
    createdAt: "2026-05-22",
  },
  {
    id: "15",
    slug: "yaba-tech-loft",
    title: "Yaba Tech Loft",
    tagline: "Open plan one bed, walkable to the hub",
    description:
      "Built for the way people actually work now: one open room, a proper desk wall, fibre already pulled in, and a lift that runs on the estate's own inverter.",
    price: 4200000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Studio",
    location: "Herbert Macaulay Way, Yaba, Lagos",
    city: "Lagos",
    address: "14 Herbert Macaulay Way, Yaba, Lagos",
    bedrooms: 1,
    bathrooms: 1,
    areaSqft: 720,
    parkingSpaces: 1,
    yearBuilt: 2023,
    amenities: ["Fibre Internet", "Inverter Backup", "Lift", "Secure Parking"],
    images: [int(4), int(6)],
    agent: agents[0],
    createdAt: "2026-08-09",
  },
  {
    id: "16",
    slug: "chevron-drive-townhouse",
    title: "Chevron Drive Townhouse",
    tagline: "Four bed in a twelve unit terrace",
    description:
      "End of terrace, so it takes light on three sides. The estate runs its own treatment plant and the service charge has not moved in two years, which is worth asking about.",
    price: 132000000,
    status: "For Sale",
    type: "Townhouse",
    location: "Chevron Drive, Lekki, Lagos",
    city: "Lagos",
    address: "Unit 12, Cheveron Court, Lekki, Lagos",
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 2600,
    parkingSpaces: 2,
    yearBuilt: 2020,
    amenities: ["End of Terrace", "Treatment Plant", "Estate Security", "Fitted Kitchen"],
    images: [ext(8), int(10), ext(12)],
    agent: agents[1],
    createdAt: "2026-07-28",
  },
  {
    id: "17",
    slug: "wuse-2-office-conversion",
    title: "Wuse 2 Office Conversion",
    tagline: "Two bed above a quiet commercial row",
    description:
      "Converted from offices in 2024 and done properly: acoustic floors, new stack, and windows that open. The row below closes at six, so evenings are quieter than the address suggests.",
    price: 6800000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Apartment",
    location: "Wuse 2, Abuja",
    city: "Abuja",
    address: "3rd Floor, Aminu Kano Crescent, Wuse 2, Abuja",
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1400,
    parkingSpaces: 1,
    yearBuilt: 2024,
    amenities: ["Acoustic Floors", "Lift", "Backup Power", "Secure Parking"],
    images: [int(5), int(9)],
    agent: agents[2],
    createdAt: "2026-08-18",
  },
  {
    id: "18",
    slug: "guzape-ridge-duplex",
    title: "Guzape Ridge Duplex",
    tagline: "Sold in eleven days, kept for the record",
    description:
      "A four bed on the ridge with a view back across the city. Listed in June and gone by the middle of the month, at close to asking.",
    price: 189000000,
    status: "Sold",
    type: "Duplex",
    location: "Guzape, Abuja",
    city: "Abuja",
    address: "Plot 7, Guzape District, Abuja",
    bedrooms: 4,
    bathrooms: 5,
    areaSqft: 3400,
    parkingSpaces: 3,
    yearBuilt: 2019,
    amenities: ["City View", "Solar with Battery", "Gated Estate"],
    images: [ext(2), int(1)],
    agent: agents[2],
    createdAt: "2026-06-11",
  },
  {
    id: "19",
    slug: "ajah-starter-flat",
    title: "Ajah Starter Flat",
    tagline: "Two bed, the cheapest thing we will list",
    description:
      "Not glamorous and not pretending to be. Sound building, honest finish, and a price that lets a first buyer stop renting. The estate road is unpaved past the gate.",
    price: 38000000,
    status: "For Sale",
    type: "Apartment",
    location: "Sangotedo, Ajah, Lagos",
    city: "Lagos",
    address: "Block 4, Fara Park, Sangotedo, Lagos",
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 950,
    parkingSpaces: 1,
    yearBuilt: 2018,
    amenities: ["Gated Estate", "Borehole", "Prepaid Meter"],
    images: [ext(13), int(12)],
    agent: agents[0],
    createdAt: "2026-08-25",
  },
  {
    id: "20",
    slug: "banana-island-penthouse-let",
    title: "Banana Island Penthouse",
    tagline: "Top floor, let furnished by the year",
    description:
      "The whole top floor, furnished to a standard that survives a corporate let, with a private lift lobby and staff quarters on the same level.",
    price: 24000000,
    status: "For Rent",
    rentPeriod: "year",
    type: "Penthouse",
    location: "Banana Island, Ikoyi, Lagos",
    city: "Lagos",
    address: "Penthouse, Block A, Banana Island, Lagos",
    bedrooms: 4,
    bathrooms: 5,
    areaSqft: 3200,
    parkingSpaces: 3,
    yearBuilt: 2022,
    amenities: ["Private Lift Lobby", "Furnished", "Staff Quarters", "Concierge", "Backup Power"],
    images: [`${L}/av-render-04.jpg`, `${L}/av-render-05.jpg`, int(7)],
    agent: agents[1],
    createdAt: "2026-08-30",
  },
  {
    id: "21",
    slug: "parkview-estate-townhouse",
    title: "Parkview Estate Townhouse",
    tagline: "Under offer, exchange expected this month",
    description:
      "A four bedroom townhouse on Parkview's tree lined loop, offered with the buyer's survey already back. The garden backs onto the estate's own running track.",
    price: 220000000,
    status: "Under Offer",
    fees: [
      { kind: "agency", amountMinor: 1100000000, currency: "NGN" },
      { kind: "legal", amountMinor: 660000000, currency: "NGN" },
    ],
    type: "Townhouse",
    location: "Parkview Estate, Ikoyi, Lagos",
    city: "Lagos",
    address: "14 Bourdillon Close, Parkview Estate, Ikoyi, Lagos",
    bedrooms: 4,
    bathrooms: 4,
    areaSqft: 3300,
    parkingSpaces: 2,
    yearBuilt: 2020,
    amenities: ["Running Track", "Gated Estate", "24/7 Security", "Fitted Kitchen"],
    images: [ext(11), int(9), int(12)],
    agent: agents[1],
    createdAt: "2026-08-28",
  },
  {
    id: "22",
    slug: "utako-garden-flat",
    title: "Utako Garden Flat",
    tagline: "Let agreed, tenant moving in next month",
    description:
      "A ground floor two bedroom with its own garden gate, in a small block off the Utako roundabout. The first viewing had an offer in by the end of the week.",
    price: 4800000,
    status: "Let Agreed",
    rentPeriod: "year",
    type: "Apartment",
    location: "Utako, Abuja",
    city: "Abuja",
    address: "6 Obafemi Awolowo Way, Utako, Abuja",
    bedrooms: 2,
    bathrooms: 2,
    areaSqft: 1150,
    parkingSpaces: 1,
    yearBuilt: 2021,
    amenities: ["Private Garden Gate", "Secure Parking", "Backup Power"],
    images: [ext(9), int(6)],
    agent: agents[2],
    createdAt: "2026-08-27",
  },
];


/** Readable status into the pair the contract actually stores. */
const statusMap = {
  "For Sale":    { listingType: "sale", status: "live" },
  "For Rent":    { listingType: "rent", status: "live" },
  Sold:          { listingType: "sale", status: "closed" },
  "Under Offer": { listingType: "sale", status: "under-offer" },
  "Let Agreed":  { listingType: "rent", status: "under-offer" },
  Let:           { listingType: "rent", status: "closed" },
} as const;

/** Readable fixture units into the stored contract. */
function toProperty(seed: PropertySeed): Property {
  const published = Date.parse(`${seed.createdAt}T09:00:00Z`);
  const { price, status, featured, rentPeriod, fees, priceHistory, ...rest } = seed;
  const { listingType, status: lifecycle } = statusMap[status];
  const { createdAt: _isoDate, ...fields } = rest;
  void _isoDate;
  return {
    ...fields,
    // 100 kobo per naira. The fixture writes naira; the contract stores minor units.
    priceMinor: price * 100,
    currency: "NGN",
    status: lifecycle,
    listingType,
    rentPeriod: readRentPeriod(rentPeriod, listingType),
    fees: normalizeFees(fees ?? []),
    priceHistory: priceHistory ?? [],
    featured: featured ?? false,
    agentUserId: null,
    createdAt: published,
    updatedAt: published,
    publishedAt: published,
    deletedAt: null,
    revision: 1,
  };
}

export const demoProperties: Property[] = propertySeeds.map(toProperty);


/** `position` orders the carousel. The fixtures use their array order. */
const testimonialSeeds: Omit<Testimonial, "position">[] = [
  {
    id: "t1",
    name: "Jessica Liu",
    role: "Homeowner, Lekki",
    quote:
      "We could not be happier with the outcome. From the first consultation to the final touches, the team showed a level of professionalism and creativity we had not seen anywhere else.",
    rating: 5,
    initials: "JL",
  },
  {
    id: "t2",
    name: "Marcus Bello",
    role: "First time buyer, Abuja",
    quote:
      "AVHomes made a stressful process feel effortless. Clear communication, honest pricing, and a home that exceeded what we had imagined we could afford.",
    rating: 5,
    initials: "MB",
  },
  {
    id: "t3",
    name: "Funmi Adeyemi",
    role: "Investor",
    quote:
      "Their market read and their responsiveness set them apart. Every listing was vetted before it reached me and every question was answered the same day.",
    rating: 5,
    initials: "FA",
  },
  {
    id: "t4",
    name: "Samson Ghani",
    role: "Repeat client",
    quote:
      "I have bought through three agencies in Lagos. This is the only one that told me not to buy something. That is why I keep coming back.",
    rating: 5,
    initials: "SG",
  },
];

export const demoTestimonials: Testimonial[] = testimonialSeeds.map((t, i) => ({
  ...t,
  position: i,
}));


const statSeeds: Omit<SiteStat, "id" | "position">[] = [
  { value: 1500, label: "Properties managed", suffix: "+" },
  { value: 30, label: "Years of experience", suffix: "+" },
  { value: 98, label: "Client satisfaction", suffix: "%" },
  { value: 12, label: "Cities covered", suffix: "" },
];

export const demoStats: SiteStat[] = statSeeds.map((s, i) => ({
  ...s,
  id: `stat-${i + 1}`,
  position: i,
}));
