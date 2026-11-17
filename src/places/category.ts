/**
 * Coarse place classes for the matcher. Each source has its own category
 * words (OSM tags, municipal layer names, GTFS location types, other
 * publishers' taxonomies), so the class is read from those words with a
 * fixed, ordered list of patterns. A record whose words match no pattern is
 * class "unknown", which is neutral for most classes.
 */
import { foldText } from "./normalize.js";

export type PlaceClass =
  | "washroom" | "transit" | "emergency" | "fuel" | "parking" | "drinking_water" | "playground"
  | "sport_field" | "sport_venue" | "community" | "library" | "school" | "worship" | "health" | "food"
  | "lodging" | "camp" | "park" | "trail_access" | "culture" | "civic" | "shop" | "finance" | "entrance"
  | "street_furniture" | "crossing" | "mobility" | "unknown";

/** Ordered: the first pattern that matches wins. Specific words come before broad ones. */
const PATTERNS: ReadonlyArray<[PlaceClass, RegExp]> = [
  ["washroom", /toilet|washroom|restroom|comfort station|lavatory|toilettes/],
  ["entrance", /^entrance\b|\bentrance\/|loading_dock|parking_entrance/],
  ["emergency", /fire[_ ]?(station|hall)|caserne|police|ambulance/],
  ["fuel", /\bfuel\b|gas[_ ]station|petrol|charging/],
  ["mobility", /bicycle_rental|bike share|bike_share|car_sharing|car_rental|bicycle_parking|scooter|taxi/],
  ["drinking_water", /drinking|bottle fill|water_point|water fountain|dog fountain/],
  ["crossing", /crossing|crosswalk|crossover|traffic[_ ]signal|signal pole|curb cut|kerb/],
  ["street_furniture", /\bbench\b|benches|waste|recycling|post_box|picnic_table|bleacher|vending|telephone|grit_bin|relay_box|trolley_bay|bike repair|bicycle_repair|shade shelter|\bshelter\b|outdoor_seating|accessible table|picnic table/],
  ["transit", /transit|bus[_ ]?stop|bus[_ ]station|platform|subway|train[_ ]station|railway|tram|ferry|^stop\b|\bstop$|^station\b|\bstation$/],
  ["parking", /parking|parkade|\blot\b|garage/],
  ["playground", /playground|play structure|play area|play equipment|tot lot|swing|slide|climber|spring toy|splash|spray|water play|playset|water_park|\bplay\b/],
  ["library", /librar|biblioth/],
  ["school", /school|college|universit|kindergarten|ecole/],
  ["worship", /worship|church|mosque|temple|synagogue|eglise|chapel|cathedral|gurdwara/],
  ["health", /hospital|clinic|doctor|dentist|dental|pharmac|health|physio|optometr|optician|medical|veterinar|hearing_aid|chiropract/],
  ["sport_venue", /arena|sports_centre|sports centre|stadium|sportsplex|recreation complex|sports complex|fitness|\bgym\b|dojo|curling|indoor/],
  ["community", /community|recreation (centre|center|complex|facility)|^recreation$|seniors|field ?house|youth centre|civic cent|social_centre|social_facility|events_venue|town facility|city facility|county or municipal facility|childcare|child care|daycare|earlyon|change (house|room|facilit|pavil)|clubhouse/],
  ["sport_field", /pitch|sports?\b|\btrack\b|skat|soccer|baseball|tennis|basketball|volleyball|pickleball|bocci|bocce|lawn bowl|\brink|\bpool|swimming|wading|piscine|diamond|court\b|courts\b|ice_rink|cricket|football|multi use pad|boat (launch|ramp|dock)|slipway/],
  ["food", /restaurant|fast_food|\bcafe\b|coffee|\bbar\b|\bpub\b|ice_cream|food|bakery|\bdeli\b|dining|eat_and_drink|brewery|winery/],
  ["camp", /camp_site|camp_pitch|campground|caravan/],
  ["lodging", /hotel|motel|hostel|guest_house|chalet|lodging|bed and breakfast|accommodation/],
  ["trail_access", /trail access|access point|trail head|trailhead|trail connection/],
  ["park", /\bparks?\b|parkette|garden|nature|conservation|open space|natural area|picnic|reserve|beach|viewpoint|green ?space|dog_park|village green|waterfront|golf|active recreation|passive recreation/],
  ["culture", /museum|gallery|theatre|theater|arts?_centre|\barts?\b|historic|attraction|cultural|artwork|cinema/],
  ["civic", /townhall|town hall|city hall|civic|municipal|government|courthouse|post_office|post office|administration|service ?ontario|service canada/],
  ["finance", /\bbank\b|\batm\b|credit union|money|financial/],
  ["shop", /\bshop\b|store|retail|\bmall\b|market|supermarket|convenience|boutique/],
];

/** Classes that describe a large area, where two sources may put the point far apart. */
export const AREA_CLASSES: ReadonlySet<PlaceClass> = new Set(["park", "camp", "school", "sport_venue"]);

/** Classes linked only to their own class, never to an unknown category. */
export const POINT_FEATURES: ReadonlySet<PlaceClass> = new Set([
  "washroom", "transit", "crossing", "street_furniture", "entrance", "drinking_water", "mobility", "parking", "fuel",
  "playground", "sport_field",
]);

/** Pairs of different classes that can still be the same place (one source's arena is another's community centre). */
const AFFINITY: ReadonlyArray<[PlaceClass, PlaceClass]> = [
  ["community", "sport_venue"],
  ["community", "civic"],
  ["civic", "culture"],
  ["community", "culture"],
  ["food", "shop"],
  ["health", "shop"],
  ["finance", "shop"],
  ["lodging", "camp"],
  ["park", "camp"],
  ["park", "trail_access"],
  ["park", "culture"],
];

export function classOfText(word: string | null | undefined): PlaceClass {
  if (typeof word !== "string" || word === "UNKNOWN") return "unknown";
  const text = foldText(word).trim();
  if (!text) return "unknown";
  for (const [klass, pattern] of PATTERNS) if (pattern.test(text)) return klass;
  return "unknown";
}

/**
 * Class of a record. Words are tried in order (the most specific first, for
 * example the category before the category group); the first word that
 * matches a pattern decides.
 */
export function placeClass(tranche: string, words: readonly (string | null | undefined)[]): PlaceClass {
  if (tranche === "washroom") return "washroom";
  if (tranche === "transit") return "transit";
  for (const word of words) {
    const klass = classOfText(word);
    if (klass !== "unknown") return klass;
  }
  return "unknown";
}

/** A finer type inside a few point-feature classes, so a bench is not linked to a picnic table. */
export function fineType(klass: PlaceClass, words: readonly (string | null | undefined)[]): string {
  if (klass !== "street_furniture" && klass !== "parking" && klass !== "playground") return klass;
  const text = words.filter((word): word is string => typeof word === "string" && word !== "UNKNOWN").map((word) => foldText(word)).join(" ");
  const rules: Array<[string, RegExp]> = [
    ["bench", /\bbench|benches/],
    ["picnic_table", /picnic/],
    ["waste", /waste|recycl/],
    ["shelter", /shelter/],
    ["post_box", /post_box/],
    ["seating", /outdoor_seating|table/],
    ["parking_space", /parking_space|stall|accessible parking space|accessible parking feature|accessible parking location/],
    ["splash_pad", /splash|spray|water play|water_park/],
  ];
  for (const [fine, pattern] of rules) if (pattern.test(text)) return fine;
  return klass;
}

const FURNITURE_FINE = new Set(["bench", "picnic_table", "waste", "shelter", "post_box", "seating"]);

/** Two records of one class whose finer types say they are different things (a bench and a table, a lot and a stall). */
export function fineConflict(a: string, b: string): boolean {
  if (a === b) return false;
  if (FURNITURE_FINE.has(a) && FURNITURE_FINE.has(b)) return true;
  const pair = [a, b].sort().join("/");
  return pair === "parking/parking_space";
}

/**
 * 1 for the same class, 0.6 for an affinity pair, 0.5 when either side is
 * unknown (0 for point features), 0 for classes that cannot be the same
 * place. A pair with 0 is never linked, not even as a possible duplicate.
 */
export function classCompatibility(a: PlaceClass, b: PlaceClass): number {
  if (a === b) return a === "unknown" ? 0.5 : 1;
  if (a === "unknown" || b === "unknown") {
    // Small point features (a stop, a washroom, a signal, a bench, a bike-share dock, a sports
    // field) are only linked to the same kind of feature: they often carry the name of the park
    // or corner they are in, which other features share.
    const known = a === "unknown" ? b : a;
    return POINT_FEATURES.has(known) ? 0 : 0.5;
  }
  for (const [x, y] of AFFINITY) if ((a === x && b === y) || (a === y && b === x)) return 0.6;
  return 0;
}

const KIND_WORDS: ReadonlyArray<[PlaceClass, RegExp]> = [
  ["washroom", /^(washroom|washrooms|toilets?|restrooms?|toilettes)$/],
  ["library", /^(library|bibliotheque)$/],
  ["school", /^(school|ecole|college|university|universite|academy)$/],
  ["worship", /^(church|eglise|mosque|synagogue|temple|chapel|cathedral)$/],
  ["sport_venue", /^(arena|stadium|sportsplex|curling|gym)$/],
  ["sport_field", /^(pool|piscine|rink|court|courts|diamond|field|fields|pitch)$/],
  ["community", /^(community|communautaire|fieldhouse|clubhouse)$/],
  ["health", /^(hospital|hopital|pharmacy|pharmacie|clinic|clinique)$/],
  ["playground", /^(playground|splash|swings?)$/],
  ["parking", /^(parking|stationnement|lot)$/],
  ["park", /^(park|parc|parkette|gardens?|jardin)$/],
];

function kindOf(token: string): PlaceClass | null {
  for (const [kind, pattern] of KIND_WORDS) if (pattern.test(token)) return kind;
  return null;
}

const FRENCH_HEADS = /^(parc|bibliotheque|ecole|eglise|piscine|jardin|hopital|pharmacie|clinique|toilettes|stationnement)$/;

/**
 * The kinds of place a name says it is. A name may join several places
 * ("Cornell Community Centre and Library", "Glen Cairn Community Centre /
 * Morrena Park"): each part's head word counts. In English the head is the
 * last kind word of a part ("Bedford Park Community Centre" is a community
 * centre); in French it is the first ("Parc des Pionniers").
 */
export function nameKinds(name: string | null | undefined): PlaceClass[] {
  if (typeof name !== "string") return [];
  const kinds = new Set<PlaceClass>();
  const parts = foldText(name).split(/\s+(?:and|et)\s+|\s*[\/|]\s*|\s+-\s+|\s*\+\s*/);
  for (const part of parts) {
    const tokens = part.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (tokens.length === 0) continue;
    if (FRENCH_HEADS.test(tokens[0]!)) {
      kinds.add(kindOf(tokens[0]!)!);
      continue;
    }
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      const kind = kindOf(tokens[index]!);
      if (kind) {
        kinds.add(kind);
        break;
      }
    }
  }
  return [...kinds].sort();
}

/** Two names say different kinds of place: both state kinds and none agree. */
export function kindsConflict(a: readonly PlaceClass[], b: readonly PlaceClass[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return !a.some((kind) => b.includes(kind));
}
