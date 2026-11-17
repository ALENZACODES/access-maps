/**
 * Name and address normalisation for the cross-source place matcher.
 *
 * Every function here is pure and deterministic. Normalisation only decides
 * whether two records may describe the same place; it never changes a stored
 * value. Source records are not rewritten.
 */

/** Words that carry no identity. Dropped from token lists. */
const STOPWORDS = new Set([
  "the", "le", "la", "les", "l", "de", "du", "des", "d", "of", "a", "an", "at", "and", "et", "a",
  "inc", "ltd", "limited", "corp", "corporation", "co", "company", "llc", "enr", "ltee", "incorporated",
]);

/**
 * Spelling variants mapped to one canonical token. Street words, compass
 * points, EN/FR pairs and centre/center. "st", "street" and "saint" share a
 * token on purpose: "St. Lawrence" and "Saint Lawrence" are the same name,
 * and "Main St" and "Main Street" are the same street.
 */
const CANONICAL: Record<string, string> = {
  street: "st", st: "st", saint: "st", ste: "st", sainte: "st", rue: "st",
  avenue: "ave", ave: "ave", av: "ave",
  road: "rd", rd: "rd", chemin: "rd", ch: "rd",
  drive: "dr", dr: "dr",
  boulevard: "blvd", blvd: "blvd", boul: "blvd", bd: "blvd",
  east: "e", e: "e", est: "e", eb: "eb", eastbound: "eb",
  west: "w", w: "w", ouest: "w", wb: "wb", westbound: "wb",
  north: "n", n: "n", nord: "n", nb: "nb", northbound: "nb",
  south: "s", s: "s", sud: "s", sb: "sb", southbound: "sb",
  mount: "mt", mt: "mt", mont: "mt",
  fort: "ft", ft: "ft",
  parkway: "pkwy", pkwy: "pkwy",
  highway: "hwy", hwy: "hwy",
  crescent: "cres", cres: "cres", cr: "cres", cresc: "cres",
  court: "ct", crt: "ct", ct: "ct",
  place: "pl", pl: "pl",
  square: "sq", sq: "sq",
  lane: "ln", ln: "ln",
  terrace: "terr", terr: "terr", ter: "terr",
  circle: "cir", cir: "cir", circ: "cir",
  trail: "trl", trl: "trl",
  gate: "gt", gt: "gt",
  heights: "hts", hts: "hts",
  centre: "centre", center: "centre", ctr: "centre", cntr: "centre",
  complex: "complex", cmplx: "complex", cplx: "complex",
  opposite: "opp", opp: "opp",
  parc: "park", park: "park",
  bibliotheque: "library", library: "library", lib: "library",
  ecole: "school", school: "school",
  eglise: "church", church: "church",
  pharmacie: "pharmacy", pharmacy: "pharmacy",
  hopital: "hospital", hospital: "hospital",
  piscine: "pool", pool: "pool",
  arena: "arena",
  gare: "station", station: "station", stn: "station",
  musee: "museum", museum: "museum",
  jardin: "garden", jardins: "garden", garden: "garden", gardens: "garden",
  plage: "beach", beach: "beach",
  communautaire: "community", community: "community",
  boulangerie: "bakery", bakery: "bakery",
  epicerie: "grocery", grocery: "grocery",
  toilettes: "washroom", washroom: "washroom", washrooms: "washroom", restroom: "washroom", restrooms: "washroom", toilets: "washroom", toilet: "washroom",
  terrain: "field", field: "field", fields: "field",
  caisse: "creditunion",
  number: "no", no: "no", num: "no",
};

/** Multi-word phrases rewritten before tokenising. */
const PHRASES: Array<[RegExp, string]> = [
  [/\bhotel de ville\b/g, "city hall"],
  [/\bcentre communautaire\b/g, "community centre"],
  [/\baire de jeux\b/g, "playground"],
  [/\bterrain de jeux\b/g, "playground"],
  [/\bcredit union\b/g, "creditunion"],
  [/\bcaisse populaire\b/g, "creditunion"],
  [/\bcomfort station\b/g, "washroom"],
];

/**
 * Tokens that describe a kind of place rather than a particular one. They
 * count for less in name similarity, so "Sentinel Park" and "Riverdale Park"
 * are not judged similar because both say "park".
 */
export const GENERIC_TOKENS = new Set([
  "park", "centre", "community", "library", "school", "church", "pharmacy", "hospital", "pool", "arena",
  "station", "restaurant", "cafe", "bar", "store", "shop", "public", "washroom", "building", "branch",
  "city", "town", "playground", "parking", "lot", "field", "recreation", "rec", "complex", "facility",
  "hall", "plaza", "mall", "garden", "museum", "beach", "grocery", "bakery", "clinic", "medical", "dental",
  "office", "services", "service", "club", "place", "parkette", "fieldhouse", "house", "court", "rink",
  "sports", "fitness", "gym", "market", "supermarket", "pizza", "coffee", "kitchen", "grill", "bistro",
  "toronto", "ottawa", "ontario", "region", "regional", "municipal", "county", "village", "township",
  "st", "ave", "rd", "dr", "blvd", "e", "w", "n", "s", "nb", "sb", "eb", "wb",
  "play", "structure", "structures", "equipment", "area", "splash", "pad", "swing", "swings", "set", "outdoor", "indoor",
  "basketball", "tennis", "soccer", "baseball", "diamond", "courts", "ball", "volleyball", "pickleball", "skate",
  "wading", "change", "room", "fountain", "drinking", "bottle", "filling", "bench", "benches", "bus", "terminal",
  "transit", "platform", "stop", "accessible", "universal", "family", "male", "female", "mens", "womens",
]);

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ'`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/\bc\/o\b/g, " ");
}

/** Lower-case, accent-free, punctuation-free canonical tokens, stopwords removed. */
export function nameTokens(value: string | null | undefined): string[] {
  if (typeof value !== "string") return [];
  let text = foldText(value);
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  const out: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const token = Object.hasOwn(CANONICAL, raw) ? CANONICAL[raw]! : raw;
    if (STOPWORDS.has(token)) continue;
    out.push(token);
  }
  return out;
}

export function normalizedName(value: string | null | undefined): string {
  return nameTokens(value).join(" ");
}

function tokenWeight(token: string): number {
  if (GENERIC_TOKENS.has(token)) return 0.25;
  if (/^\d+$/.test(token)) return 0.8;
  return 1;
}

/** Levenshtein distance capped at max + 1 (small strings only). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length] ?? max + 1;
}

/** Two tokens are the same word: equal, or one typo in a word of five letters or more. */
export function tokensAgree(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d/.test(a) || /^\d/.test(b)) return false;
  if (a.length >= 5 && b.length >= 5) return editDistance(a, b, 1) <= 1;
  return false;
}

function trigrams(text: string): Map<string, number> {
  const padded = `  ${text} `;
  const grams = new Map<string, number>();
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    const gram = padded.slice(index, index + 3);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

export function trigramDice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  let total = 0;
  for (const [gram, count] of ga) {
    total += count;
    shared += Math.min(count, gb.get(gram) ?? 0);
  }
  for (const count of gb.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

export interface NameComparison {
  /** 0..1, symmetric. */
  score: number;
  /** Distinctive (non-generic) tokens on each side. */
  distinctiveA: number;
  distinctiveB: number;
  /** Distinctive tokens that agree. */
  distinctiveShared: number;
}

/**
 * Symmetric name similarity on canonical tokens.
 *
 * Weighted Dice over tokens (generic tokens weigh a quarter), with a fuzzy
 * token match for single typos; a character trigram Dice over the
 * distinctive tokens catches spacing differences ("Mc Donalds" and
 * "McDonalds"). When every distinctive token of the shorter name appears in
 * the longer name and the longer name has at most one other distinctive
 * token, the score is at least 0.85 ("Sentinel Park" and "Sentinel Park
 * Washroom"); with more other tokens, at least 0.7. Two names made only of
 * generic words score at most 0.5. Order does not matter.
 */
export function compareNames(aTokens: readonly string[], bTokens: readonly string[]): NameComparison {
  const empty = { score: 0, distinctiveA: 0, distinctiveB: 0, distinctiveShared: 0 };
  if (aTokens.length === 0 || bTokens.length === 0) return empty;
  const [short, long] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  const used = new Array<boolean>(long.length).fill(false);
  let sharedWeight = 0;
  let distinctiveShared = 0;
  for (const token of short) {
    let found = -1;
    for (let index = 0; index < long.length; index += 1) {
      if (!used[index] && long[index] === token) { found = index; break; }
    }
    if (found < 0) {
      for (let index = 0; index < long.length; index += 1) {
        if (!used[index] && tokensAgree(token, long[index] ?? "")) { found = index; break; }
      }
    }
    if (found >= 0) {
      used[found] = true;
      const weight = Math.min(tokenWeight(token), tokenWeight(long[found] ?? token));
      sharedWeight += weight;
      if (!GENERIC_TOKENS.has(token)) distinctiveShared += 1;
    }
  }
  const totalWeight = short.reduce((sum, token) => sum + tokenWeight(token), 0) + long.reduce((sum, token) => sum + tokenWeight(token), 0);
  let score = totalWeight === 0 ? 0 : (2 * sharedWeight) / totalWeight;
  const distinctiveA = aTokens.filter((token) => !GENERIC_TOKENS.has(token));
  const distinctiveB = bTokens.filter((token) => !GENERIC_TOKENS.has(token));
  const shortDistinctive = short === aTokens ? distinctiveA : distinctiveB;
  const longDistinctive = short === aTokens ? distinctiveB : distinctiveA;
  if (shortDistinctive.length > 0 && distinctiveShared >= shortDistinctive.length) {
    score = Math.max(score, longDistinctive.length - distinctiveShared <= 1 ? 0.85 : 0.7);
  }
  if (distinctiveA.length > 0 && distinctiveB.length > 0) {
    const gram = trigramDice(distinctiveA.join(""), distinctiveB.join(""));
    score = Math.max(score, gram * 0.95);
  } else if (distinctiveA.length === 0 && distinctiveB.length === 0) {
    score = Math.min(score, 0.5);
  }
  return { score: Math.min(1, Math.round(score * 1000) / 1000), distinctiveA: distinctiveA.length, distinctiveB: distinctiveB.length, distinctiveShared };
}

/** Separators between the street a stop is on and the cross street. */
const STOP_SPLIT = /\s*(?:\/|@|\+|&|\s(?:at|opposite|opp|near|and)\s)\s*/;

function stopParts(name: string): [string[], string[]] | null {
  const folded = foldText(name).replace(/\(.*?\)/g, " ");
  const parts = folded.split(STOP_SPLIT).map((part) => nameTokens(part)).filter((part) => part.length > 0);
  if (parts.length !== 2) return null;
  return [parts[0]!, parts[1]!];
}

/** Direction-of-travel words on a stop name (northbound, SB, ...). */
const BOUND = new Set(["nb", "sb", "eb", "wb"]);

export type StopNameConflict = "none" | "different" | "platform_one_side";

/**
 * Compares two transit stop names.
 *
 * "different": one says "opposite" and the other does not; both name a
 * platform, bay or track and the numbers differ; or the street and cross
 * street are swapped ("Mohawk at Upper Kenilworth" and "Upper Kenilworth at
 * Mohawk" are two stops on two streets at one corner).
 * Both name a direction of travel and the directions differ: "different".
 * "platform_one_side": only one names a platform, bay or direction of
 * travel, so one may be a platform or one side of the other; such a pair is
 * never more than a possible duplicate.
 */
export function stopNameConflict(a: string | null, b: string | null): StopNameConflict {
  if (!a || !b) return "none";
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.includes("opp") !== tb.includes("opp")) return "different";
  const pa = platformNumber(ta);
  const pb = platformNumber(tb);
  if (pa !== null && pb !== null && pa !== pb) return "different";
  const sa = stopParts(a);
  const sb = stopParts(b);
  if (sa && sb) {
    const same = compareNames(sa[0], sb[0]).score;
    const crossed = compareNames(sa[0], sb[1]).score >= 0.6 && compareNames(sa[1], sb[0]).score >= 0.6;
    if (same < 0.5 && crossed) return "different";
  }
  const bound = (tokens: readonly string[]) => tokens.filter((token) => BOUND.has(token)).sort().join(" ");
  const ba = bound(ta);
  const bb = bound(tb);
  if (ba && bb && ba !== bb) return "different";
  const hasPlatform = (tokens: readonly string[]) => tokens.some((token) => token === "platform" || token === "bay" || token === "track");
  if (hasPlatform(ta) !== hasPlatform(tb) || (ba === "") !== (bb === "")) return "platform_one_side";
  return "none";
}

function platformNumber(tokens: readonly string[]): string | null {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token === "platform" || token === "bay" || token === "track") return tokens[index + 1] ?? null;
  }
  return null;
}

/** House numbers as a set of digit-led tokens ("12-14" gives 12 and 14; "12A" stays "12a"). */
export function houseNumbers(value: string | number | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  const text = String(value).toLowerCase();
  const found = text.match(/\d+[a-z]?/g) ?? [];
  return [...new Set(found)].sort();
}

/** Splits "5 Glen Everest Rd" into a house number and street tokens. */
export function splitAddress(value: string | null | undefined): { housenumber: string[]; street: string[] } {
  if (typeof value !== "string") return { housenumber: [], street: [] };
  const match = /^\s*(\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?)\s+(.+)$/i.exec(value);
  if (!match) return { housenumber: [], street: nameTokens(value) };
  return { housenumber: houseNumbers(match[1] ?? ""), street: nameTokens((match[2] ?? "").split(",")[0] ?? "") };
}

export type AddressAgreement = "same" | "different_number" | "different_street" | "unknown";

/** Address agreement when both sides state a house number and a street. */
export function compareAddress(
  a: { housenumber: readonly string[]; street: readonly string[] },
  b: { housenumber: readonly string[]; street: readonly string[] },
): AddressAgreement {
  if (a.housenumber.length === 0 || b.housenumber.length === 0) return "unknown";
  const numbersMeet = a.housenumber.some((number) => b.housenumber.includes(number));
  if (a.street.length === 0 || b.street.length === 0) return numbersMeet ? "same" : "different_number";
  const street = compareNames(a.street, b.street).score;
  if (street < 0.6) return "different_street";
  return numbersMeet ? "same" : "different_number";
}
