/**
 * Nigerian places, for the location box on the search bars.
 *
 * THIS IS A LOCAL LIST ON PURPOSE, not a call to a geocoder. The three free
 * options all fail this particular job: Nominatim's usage policy names
 * autocomplete as a forbidden pattern, Photon is a shared instance with no
 * availability promise, and Google and Mapbox both want a billed key on the
 * client. Against that, the useful universe for a Lagos and Abuja agency is a
 * few hundred neighbourhoods, which fits in a file that answers in the same
 * tick with no network, no key and no rate limit.
 *
 * The list is ordered by how often a buyer types the name, not alphabetically,
 * because `search` uses position as the last tiebreaker.
 */

export interface Place {
  /** What the buyer types and what lands in the query. */
  name: string;
  /** The larger area it sits in. Shown as the second line, never matched alone. */
  area: string;
  state: string;
}

/** `area` repeats for every entry in a group, so the groups carry it once. */
const GROUPS: { area: string; state: string; names: string[] }[] = [
  {
    area: "Lekki Peninsula",
    state: "Lagos",
    names: [
      "Lekki Phase 1", "Lekki Phase 2", "Ikate Elegushi", "Chevron Drive", "Agungi",
      "Osapa London", "Jakande", "Igbo Efon", "Idado", "Ilasan", "Salem", "Marwa",
      "Victoria Garden City", "Northern Foreshore", "Pinnock Beach", "Nicon Town",
      "Orchid Road", "Lafiaji", "Ologolo", "Elf Bus Stop",
    ],
  },
  {
    area: "Ajah and Ibeju",
    state: "Lagos",
    names: [
      "Ajah", "Sangotedo", "Abraham Adesanya", "Badore", "Ado Road", "Thomas Estate",
      "Ogombo", "Okun Ajah", "Awoyaya", "Ibeju-Lekki", "Eleko", "Bogije", "Lakowe",
      "Abijo", "Crown Estate", "Epe",
    ],
  },
  {
    area: "Lagos Island",
    state: "Lagos",
    names: [
      "Ikoyi", "Victoria Island", "Banana Island", "Oniru", "Old Ikoyi", "Parkview Estate",
      "Dolphin Estate", "Ligali Ayorinde", "Adeola Odeku", "Lagos Island", "Obalende",
      "Bourdillon", "Gerrard Road", "Awolowo Road",
    ],
  },
  {
    area: "Ikeja and Magodo",
    state: "Lagos",
    names: [
      "Ikeja", "Ikeja GRA", "Magodo Phase 1", "Magodo Phase 2", "Omole Phase 1",
      "Omole Phase 2", "Ojodu Berger", "Ojodu", "Opebi", "Allen Avenue", "Oregun",
      "Alausa", "Maryland", "Anthony Village", "Ilupeju", "Palmgrove",
    ],
  },
  {
    area: "Yaba and Surulere",
    state: "Lagos",
    names: [
      "Yaba", "Akoka", "Sabo Yaba", "Ebute Metta", "Surulere", "Bode Thomas",
      "Adeniran Ogunsanya", "Ojuelegba", "Bariga", "Shomolu", "Mushin", "Idi Araba",
      "Costain", "Iponri",
    ],
  },
  {
    area: "Gbagada and Ketu",
    state: "Lagos",
    names: [
      "Gbagada", "Gbagada Phase 2", "Medina Estate", "Ogudu", "Ogudu GRA", "Ojota",
      "Ketu", "Alapere", "Mile 12", "Owode Onirin", "Agboyi", "Soluyi",
    ],
  },
  {
    area: "Isolo and Festac",
    state: "Lagos",
    names: [
      "Isolo", "Ejigbo", "Okota", "Ago Palace Way", "Festac Town", "Amuwo Odofin",
      "Satellite Town", "Apapa", "Oshodi", "Ilasamaja", "Mile 2", "Ajegunle",
    ],
  },
  {
    area: "Alimosho and Agege",
    state: "Lagos",
    names: [
      "Ikotun", "Egbeda", "Idimu", "Igando", "Akowonjo", "Iyana Ipaja", "Abule Egba",
      "Agege", "Meiran", "Alagbado", "Ipaja", "Ayobo", "Dopemu", "Iju Ishaga", "Ifako",
    ],
  },
  {
    area: "Ikorodu and the corridor",
    state: "Lagos",
    names: [
      "Ikorodu", "Ijede", "Igbogbo", "Agric Ikorodu", "Ebute Ikorodu", "Isheri North",
      "Isheri Olowora", "Opic Estate", "Arepo", "Magboro", "Ibafo", "Mowe", "Sango Ota",
    ],
  },
  {
    area: "Abuja Central",
    state: "FCT",
    names: [
      "Maitama", "Asokoro", "Wuse 2", "Wuse", "Garki", "Garki 2", "Central Business District",
      "Guzape", "Mabushi", "Wuye", "Utako", "Jabi", "Kado", "Jahi", "Dakibiyu",
      "Katampe", "Katampe Extension",
    ],
  },
  {
    area: "Abuja Suburbs",
    state: "FCT",
    names: [
      "Gwarinpa", "Life Camp", "Dawaki", "Kubwa", "Karsana", "Karmo", "Idu", "Gwagwa",
      "Apo", "Gudu", "Durumi", "Lokogoma", "Galadimawa", "Games Village", "Lugbe",
      "Airport Road", "Kuje", "Gwagwalada", "Nyanya", "Karu", "Jikwoyi", "Kurudu", "Mpape",
    ],
  },
  {
    area: "Port Harcourt",
    state: "Rivers",
    names: [
      "Old GRA", "GRA Phase 2", "GRA Phase 3", "Trans Amadi", "Peter Odili Road",
      "Woji", "Rumuokoro", "Rumuola", "Eliozu", "Ada George", "Rukpokwu", "Choba",
    ],
  },
  {
    area: "Ibadan",
    state: "Oyo",
    names: [
      "Bodija", "Old Bodija", "Jericho", "Iyaganku", "Agodi GRA", "Akobo", "Oluyole",
      "Ring Road", "Mokola", "Alalubosa", "Idishin", "Ologuneru",
    ],
  },
  {
    area: "Enugu",
    state: "Enugu",
    names: ["Independence Layout", "Enugu GRA", "New Haven", "Trans Ekulu", "Achara Layout", "Thinkers Corner"],
  },
  {
    area: "Benin City",
    state: "Edo",
    names: ["Benin GRA", "Ugbowo", "Sapele Road", "Airport Road Benin", "Ekenwan Road"],
  },
  {
    area: "Other cities",
    state: "Nigeria",
    names: [
      "Abeokuta", "Akure", "Asaba", "Awka", "Calabar", "Ilorin", "Jos", "Kaduna",
      "Kano", "Lokoja", "Makurdi", "Onitsha", "Owerri", "Uyo", "Warri", "Aba",
      "Abakaliki", "Bauchi", "Minna", "Osogbo", "Sokoto", "Yola", "Umuahia", "Lafia",
    ],
  },
];

/** States, so a broad search still lands somewhere sensible. */
const STATES = [
  "Lagos", "Abuja FCT", "Ogun", "Oyo", "Rivers", "Enugu", "Edo", "Delta", "Anambra",
  "Kaduna", "Kano", "Akwa Ibom", "Cross River", "Imo", "Abia", "Osun", "Ondo", "Kwara",
  "Plateau", "Benue", "Borno", "Niger", "Bauchi", "Katsina", "Sokoto", "Ekiti", "Kogi",
  "Nasarawa", "Adamawa", "Ebonyi", "Bayelsa", "Gombe", "Jigawa", "Kebbi", "Taraba",
  "Yobe", "Zamfara",
];

export const PLACES: Place[] = [
  ...GROUPS.flatMap((g) => g.names.map((name) => ({ name, area: g.area, state: g.state }))),
  ...STATES.map((name) => ({ name, area: "State", state: "Nigeria" })),
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Precomputed so a keystroke does no string work beyond the query itself. */
const INDEX = PLACES.map((place, position) => ({
  place,
  position,
  haystack: norm(place.name),
  area: norm(place.area),
}));

/**
 * Rank: a name that STARTS with the query beats one that merely contains it,
 * and a word-boundary hit beats a mid-word one. Without that, typing "ike"
 * surfaces "Victoria Garden City" (from "Ikate"? no) ahead of "Ikeja", which
 * makes the list feel arbitrary even though every row technically matches.
 */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = norm(query);
  if (q.length === 0) return [];

  const hits: { place: Place; score: number; position: number }[] = [];
  for (const entry of INDEX) {
    const at = entry.haystack.indexOf(q);
    let score: number;
    if (at === 0) score = 0;
    else if (at > 0 && entry.haystack[at - 1] === " ") score = 1;
    else if (at > 0) score = 2;
    else if (entry.area.includes(q)) score = 3;
    else continue;
    hits.push({ place: entry.place, score, position: entry.position });
  }

  hits.sort((a, b) => a.score - b.score || a.position - b.position);
  return hits.slice(0, limit).map((h) => h.place);
}
