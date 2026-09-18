/**
 * Phone numbers: the country a number belongs to, and how one is written down.
 *
 * ONE FILE, for the same reason money has one. A number is typed on six screens
 * across three apps, stored by four routes, compared by the deal rules and
 * printed on a public listing beside a `tel:` link. Every one of those is the
 * same question ("what did this person actually give us") and each surface
 * answering it separately is how "0803 000 0000" and "+234 803 000 0000" end up
 * being two different customers.
 *
 * STORED IN E.164: a plus, the country code, then the national digits, and no
 * spaces. It is the form a dialler, a WhatsApp link and a bank all accept, it is
 * unambiguous about which country the number is in, and it sorts and compares as
 * itself. `formatPhone` is what puts the spaces back for reading.
 */

/**
 * Every country: ISO 3166-1 alpha-2, its calling code, and its English name.
 *
 * THE NAMES ARE DATA RATHER THAN `Intl.DisplayNames`, and that was not the
 * first plan. Intl already knows what to call a region, so reading them at
 * runtime looked like the way to avoid a hand-kept list going stale. It is
 * also a HYDRATION BUG: the server and the browser ship different ICU builds,
 * Node says "Palestinian Territories" where Chrome says "Palestine" and
 * "Falkland Islands" where Chrome says "Falkland Islands (Islas Malvinas)",
 * and the list is SORTED BY NAME, so two disagreements reorder the whole
 * picker. React re-rendered the tree and logged a mismatch on every page
 * carrying a phone field. Fixed names are the same in both places forever.
 *
 * The Caribbean and the North Atlantic share +1 between them, so their entries
 * carry the full four-digit code (JM 1876, not JM 1). `countryForE164` matches
 * the LONGEST code, which is what makes that work.
 *
 * One line per country, `ISO2 dial Name`, sorted by code so a diff that adds
 * one is a one-line diff. The picker sorts by name at runtime.
 */
const TABLE = `
AD 376 Andorra
AE 971 United Arab Emirates
AF 93 Afghanistan
AG 1268 Antigua & Barbuda
AI 1264 Anguilla
AL 355 Albania
AM 374 Armenia
AO 244 Angola
AR 54 Argentina
AS 1684 American Samoa
AT 43 Austria
AU 61 Australia
AW 297 Aruba
AX 358 Aland Islands
AZ 994 Azerbaijan
BA 387 Bosnia & Herzegovina
BB 1246 Barbados
BD 880 Bangladesh
BE 32 Belgium
BF 226 Burkina Faso
BG 359 Bulgaria
BH 973 Bahrain
BI 257 Burundi
BJ 229 Benin
BL 590 St. Barthelemy
BM 1441 Bermuda
BN 673 Brunei
BO 591 Bolivia
BQ 599 Caribbean Netherlands
BR 55 Brazil
BS 1242 Bahamas
BT 975 Bhutan
BW 267 Botswana
BY 375 Belarus
BZ 501 Belize
CA 1 Canada
CD 243 Congo - Kinshasa
CF 236 Central African Republic
CG 242 Congo - Brazzaville
CH 41 Switzerland
CI 225 Cote d'Ivoire
CK 682 Cook Islands
CL 56 Chile
CM 237 Cameroon
CN 86 China
CO 57 Colombia
CR 506 Costa Rica
CU 53 Cuba
CV 238 Cape Verde
CW 599 Curacao
CY 357 Cyprus
CZ 420 Czechia
DE 49 Germany
DJ 253 Djibouti
DK 45 Denmark
DM 1767 Dominica
DO 1809 Dominican Republic
DZ 213 Algeria
EC 593 Ecuador
EE 372 Estonia
EG 20 Egypt
EH 212 Western Sahara
ER 291 Eritrea
ES 34 Spain
ET 251 Ethiopia
FI 358 Finland
FJ 679 Fiji
FK 500 Falkland Islands
FM 691 Micronesia
FO 298 Faroe Islands
FR 33 France
GA 241 Gabon
GB 44 United Kingdom
GD 1473 Grenada
GE 995 Georgia
GF 594 French Guiana
GG 44 Guernsey
GH 233 Ghana
GI 350 Gibraltar
GL 299 Greenland
GM 220 Gambia
GN 224 Guinea
GP 590 Guadeloupe
GQ 240 Equatorial Guinea
GR 30 Greece
GT 502 Guatemala
GU 1671 Guam
GW 245 Guinea-Bissau
GY 592 Guyana
HK 852 Hong Kong SAR China
HN 504 Honduras
HR 385 Croatia
HT 509 Haiti
HU 36 Hungary
ID 62 Indonesia
IE 353 Ireland
IL 972 Israel
IM 44 Isle of Man
IN 91 India
IO 246 British Indian Ocean Territory
IQ 964 Iraq
IR 98 Iran
IS 354 Iceland
IT 39 Italy
JE 44 Jersey
JM 1876 Jamaica
JO 962 Jordan
JP 81 Japan
KE 254 Kenya
KG 996 Kyrgyzstan
KH 855 Cambodia
KI 686 Kiribati
KM 269 Comoros
KN 1869 St. Kitts & Nevis
KP 850 North Korea
KR 82 South Korea
KW 965 Kuwait
KY 1345 Cayman Islands
KZ 7 Kazakhstan
LA 856 Laos
LB 961 Lebanon
LC 1758 St. Lucia
LI 423 Liechtenstein
LK 94 Sri Lanka
LR 231 Liberia
LS 266 Lesotho
LT 370 Lithuania
LU 352 Luxembourg
LV 371 Latvia
LY 218 Libya
MA 212 Morocco
MC 377 Monaco
MD 373 Moldova
ME 382 Montenegro
MF 590 St. Martin
MG 261 Madagascar
MH 692 Marshall Islands
MK 389 North Macedonia
ML 223 Mali
MM 95 Myanmar (Burma)
MN 976 Mongolia
MO 853 Macao SAR China
MP 1670 Northern Mariana Islands
MQ 596 Martinique
MR 222 Mauritania
MS 1664 Montserrat
MT 356 Malta
MU 230 Mauritius
MV 960 Maldives
MW 265 Malawi
MX 52 Mexico
MY 60 Malaysia
MZ 258 Mozambique
NA 264 Namibia
NC 687 New Caledonia
NE 227 Niger
NF 672 Norfolk Island
NG 234 Nigeria
NI 505 Nicaragua
NL 31 Netherlands
NO 47 Norway
NP 977 Nepal
NR 674 Nauru
NU 683 Niue
NZ 64 New Zealand
OM 968 Oman
PA 507 Panama
PE 51 Peru
PF 689 French Polynesia
PG 675 Papua New Guinea
PH 63 Philippines
PK 92 Pakistan
PL 48 Poland
PM 508 St. Pierre & Miquelon
PR 1787 Puerto Rico
PS 970 Palestine
PT 351 Portugal
PW 680 Palau
PY 595 Paraguay
QA 974 Qatar
RE 262 Reunion
RO 40 Romania
RS 381 Serbia
RU 7 Russia
RW 250 Rwanda
SA 966 Saudi Arabia
SB 677 Solomon Islands
SC 248 Seychelles
SD 249 Sudan
SE 46 Sweden
SG 65 Singapore
SH 290 St. Helena
SI 386 Slovenia
SJ 47 Svalbard & Jan Mayen
SK 421 Slovakia
SL 232 Sierra Leone
SM 378 San Marino
SN 221 Senegal
SO 252 Somalia
SR 597 Suriname
SS 211 South Sudan
ST 239 São Tomé & Príncipe
SV 503 El Salvador
SX 1721 Sint Maarten
SY 963 Syria
SZ 268 Eswatini
TC 1649 Turks & Caicos Islands
TD 235 Chad
TG 228 Togo
TH 66 Thailand
TJ 992 Tajikistan
TK 690 Tokelau
TL 670 Timor-Leste
TM 993 Turkmenistan
TN 216 Tunisia
TO 676 Tonga
TR 90 Türkiye
TT 1868 Trinidad & Tobago
TV 688 Tuvalu
TW 886 Taiwan
TZ 255 Tanzania
UA 380 Ukraine
UG 256 Uganda
US 1 United States
UY 598 Uruguay
UZ 998 Uzbekistan
VA 39 Vatican City
VC 1784 St. Vincent & Grenadines
VE 58 Venezuela
VG 1284 British Virgin Islands
VI 1340 U.S. Virgin Islands
VN 84 Vietnam
VU 678 Vanuatu
WF 681 Wallis & Futuna
WS 685 Samoa
YE 967 Yemen
YT 262 Mayotte
ZA 27 South Africa
ZM 260 Zambia
ZW 263 Zimbabwe
`;

/** A stored number, as it actually arrives: a string, null, or not there. */
type MaybeText = string | null | undefined;

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, uppercase. The value a picker stores. */
  iso2: string;
  /** Digits only, no plus. */
  dial: string;
  /** English, from Intl, falling back to the code itself. */
  name: string;
}

/** Every country, sorted by name, so a picker reads the way a person scans it. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = TABLE.split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "")
  .map((line) => {
    const [iso2, dial, ...name] = line.split(" ");
    return { iso2, dial, name: name.join(" ") };
  })
  /* A fixed collation, not the reader's. `localeCompare` with no locale follows
     the runtime's default, which is another way for the server and the browser
     to disagree about the order of a list they both render. */
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const BY_ISO2 = new Map(PHONE_COUNTRIES.map((country) => [country.iso2, country]));

/**
 * The default, and the reason it is not a setting.
 *
 * This is a Nigerian estate agency: the buyer, the marketer and the agent are
 * nearly always on a Nigerian number, and the one thing a country picker must
 * never do is make the common case cost a choice. Somebody abroad changes it
 * once and the value they store carries their own code from then on.
 */
export const DEFAULT_PHONE_COUNTRY = "NG";

export function phoneCountry(iso2: string): PhoneCountry | null {
  return BY_ISO2.get(iso2.toUpperCase()) ?? null;
}

/**
 * Digits and nothing else, for comparing two numbers somebody typed
 * differently.
 *
 * Takes a value that may be absent, like every entry point below it. These are
 * called on records that crossed the wire, where a field is null on one row and
 * missing entirely on any response an older deployment produced. A phone field
 * that throws takes the page down with it, and a blank one does not.
 */
export function phoneDigits(value: MaybeText): string {
  return (value ?? "").replace(/\D/gu, "");
}

/**
 * Who a shared code belongs to, when the digits cannot say.
 *
 * Ten codes are used by more than one place, and the number alone does not
 * decide between them: +44 is the UK, Jersey, Guernsey and the Isle of Man, and
 * +1 is the US, Canada and a dozen Caribbean states whose own four-digit codes
 * are matched before this table is consulted. Left to a sort, the flag came out
 * Guernsey for every British number and Canada for every American one. This
 * names the one somebody most likely means. The picker can still be changed by
 * hand, and the stored value is identical whichever is shown.
 */
const PRIMARY_FOR_DIAL: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "39": "IT",
  "44": "GB",
  "47": "NO",
  "212": "MA",
  "262": "RE",
  "358": "FI",
  "590": "GP",
  "599": "CW",
};

/**
 * Whose code does this E.164 number start with?
 *
 * Longest match wins, so +1876 is Jamaica rather than the United States.
 */
function countryForE164(digits: string): PhoneCountry | null {
  let best: PhoneCountry | null = null;
  for (const country of PHONE_COUNTRIES) {
    if (!digits.startsWith(country.dial)) continue;
    if (best && country.dial.length < best.dial.length) continue;
    if (best && country.dial.length === best.dial.length) {
      if (PRIMARY_FOR_DIAL[country.dial] !== country.iso2) continue;
    }
    best = country;
  }
  return best;
}

/**
 * The places whose national number really does begin with a zero.
 *
 * Everywhere else, a leading zero is the TRUNK prefix: the digit you dial
 * before a number inside the country, and the one thing E.164 has no room for.
 * 0803 000 0000 is +234 803 000 0000, not +234 080 300 00000. Italy is the
 * standard exception, where the zero is part of the number itself and dropping
 * it breaks every Rome landline.
 */
const TRUNK_ZERO_KEEPERS = new Set(["IT", "VA"]);

function dropTrunkZero(iso2: string, digits: string): string {
  if (TRUNK_ZERO_KEEPERS.has(iso2.toUpperCase())) return digits;
  return digits.replace(/^0+/u, "");
}

export interface SplitPhone {
  iso2: string;
  /** The national part, digits only. Empty when there is no number yet. */
  national: string;
}

/**
 * A stored value back into the two things a field edits.
 *
 * Three shapes arrive here. A value this component wrote is E.164 and splits on
 * its country code. A value typed before this field existed is a local number
 * ("0803 000 0000"), and the leading trunk zero is dropped because E.164 has no
 * room for it. Anything else keeps its digits under the fallback country, which
 * is the reading least likely to silently move somebody's number to another
 * continent.
 */
export function splitPhone(value: MaybeText, fallbackIso2: string = DEFAULT_PHONE_COUNTRY): SplitPhone {
  const iso2 = phoneCountry(fallbackIso2)?.iso2 ?? DEFAULT_PHONE_COUNTRY;
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return { iso2, national: "" };

  const digits = phoneDigits(trimmed);
  if (digits === "") return { iso2, national: "" };

  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    const international = trimmed.startsWith("00") ? digits.slice(2) : digits;
    const country = countryForE164(international);
    if (country) {
      const national = international.slice(country.dial.length);
      return { iso2: country.iso2, national: dropTrunkZero(country.iso2, national) };
    }
  }
  return { iso2, national: dropTrunkZero(iso2, digits) };
}

/** The two halves back into one stored value. Empty national means empty value. */
export function joinPhone(iso2: string, national: MaybeText): string {
  const digits = dropTrunkZero(iso2, phoneDigits(national));
  if (digits === "") return "";
  const country = phoneCountry(iso2);
  return `+${country?.dial ?? phoneCountry(DEFAULT_PHONE_COUNTRY)?.dial ?? ""}${digits}`;
}

/**
 * National digits in readable groups.
 *
 * Nigeria writes a mobile number as three, three, four, and it is the number
 * nearly every field here holds, so it gets its own line. Everything else is
 * grouped from the LEFT in threes with the remainder carried into the last
 * group, which is not every country's convention and is right far more often
 * than one unbroken run of digits.
 */
export function groupNational(iso2: string, national: MaybeText): string {
  const digits = phoneDigits(national);
  if (digits === "") return "";
  if (iso2.toUpperCase() === "NG" && digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    // A trailing single digit reads as a typo. Fold it into the group before it.
    const last = groups.pop() as string;
    groups[groups.length - 1] += last;
  }
  return groups.join(" ");
}

/** "+234 803 000 0000". What a person reads, never what is stored. */
export function formatPhone(value: MaybeText): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return "";
  const { iso2, national } = splitPhone(trimmed);
  if (national === "") return trimmed;
  const country = phoneCountry(iso2);
  if (!country || !(trimmed.startsWith("+") || trimmed.startsWith("00"))) {
    // A legacy local number is printed as it was typed. Rewriting it into a
    // country it was never stated to be in would be a guess on a public page.
    return trimmed;
  }
  /* The North American plan writes its area code apart from the country code:
     +1 876 555 1234, never +1876 555 1234. Every four-digit code starting with
     a 1 in the table above is one of those. */
  const head = country.dial.length === 4 && country.dial.startsWith("1")
    ? `+1 ${country.dial.slice(1)}`
    : `+${country.dial}`;
  return `${head} ${groupNational(iso2, national)}`;
}

/**
 * Long enough to be a phone number, short enough to be one.
 *
 * E.164 caps the whole number at fifteen digits including the country code, and
 * nowhere has a national number shorter than four. This is the only check worth
 * making without a per-country length table, which is a dependency this app
 * does not need: the real validation of a phone number is that somebody answers
 * it.
 */
export function isPlausiblePhone(value: MaybeText): boolean {
  const { iso2, national } = splitPhone(value);
  const dial = phoneCountry(iso2)?.dial ?? "";
  return national.length >= 4 && dial.length + national.length <= 15;
}

/** What a field shows when it is empty, for the country that is selected. */
export function phonePlaceholder(iso2: string): string {
  return iso2.toUpperCase() === "NG" ? "803 000 0000" : "000 000 000";
}
