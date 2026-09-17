/**
 * The states, as a datalist rather than a select.
 *
 * Suggestions, not a gate: the API takes any string up to 80 characters, and a
 * marketer working across a border should not be stopped by a picker. The list
 * exists so that thirty people in the same city do not produce thirty spellings
 * of it in the admin's filters.
 *
 * Not taken from `src/lib/locations.ts`. That file is a few hundred
 * neighbourhood entries built for the search bar, it only carries the states it
 * happens to cover, and importing it here would pull all of it into a phone's
 * bundle for thirty-seven strings.
 */
export const NIGERIAN_STATES: readonly string[] = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT Abuja",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
];
