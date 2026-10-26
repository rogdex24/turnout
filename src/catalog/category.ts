/**
 * Canonical event categories.
 *
 * Sources do not agree on a vocabulary. BookMyShow publishes genre labels
 * ("Comedy Shows", "Classic,Drama,Theatre"), MeraEvents mixes city names into
 * the same field, Luma sends the name of the calendar an event was posted to
 * ("GPU Calendar"), and Communitie, District and AllEvents send nothing at all.
 * The site filters on one enum, so each event is classified into it once at
 * ingest and the result stored, the same way `area` is.
 *
 * Labels decide it when they say anything useful. Otherwise the title does,
 * which is the only signal for the ~40% of the catalogue that arrives with no
 * labels whatsoever.
 */

export const CATEGORIES = [
  "comedy",
  "music",
  "theatre",
  "workshop",
  "sports",
  "food",
  "nightlife",
  "community",
  "kids",
  "film",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Checked in order, first match wins, so the order encodes precedence. Kids
 * leads because a children's show is a kids' event whatever else it is. Comedy
 * precedes theatre because a standup show carries both labels. Food precedes
 * workshop so a cooking class files under food, where a reader would look for
 * it. Community precedes nightlife so a "startup club" is not a night out.
 */
const RULES: { category: Category; pattern: RegExp }[] = [
  { category: "kids", pattern: /\bkids?\b|\bchildren'?s?\b|\btoddler\b|\bfamily fun\b|\bstory\s?time\b|\bplay ?school\b/ },
  {
    category: "comedy",
    pattern: /\bcomedy\b|\bcomic\b|\bstand[\s-]?up\b|\bimprov\b|\bopen mic\b|\bhumour\b|\bhumor\b|\broast\b|\bfunnies\b/,
  },
  {
    category: "sports",
    pattern:
      /\bsports?\b|\bmarathon\b|\brun(ning|s)?\b|\bcycling\b|\bcricket\b|\bfootball\b|\bpickleball\b|\bbadminton\b|\bchess\b|\btournament\b|\byoga\b|\bfitness\b|\btrek(king)?\b|\bhike\b|\bhiking\b|\bboulder(ing)?\b|\bclimb(ing)?\b|\bcyclothon\b|\bgymnastics\b|\bswim(ming)?\b|\bskat(e|ing)\b/,
  },
  { category: "film", pattern: /\bfilm\b|\bmovie\b|\bcinema\b|\bscreening\b|\bdocumentary\b/ },
  {
    category: "theatre",
    pattern:
      /\btheatre\b|\btheater\b|\bdrama\b|\bplay\b|\bnatak\b|\bmonologue\b|\bmusical\b|\bmythological\b|\bperformances?\b|\bstorytelling\b|\bdance\b|\bballet\b|\brecital\b/,
  },
  {
    category: "music",
    pattern:
      /\bmusic\b|\bconcert\b|\bgig\b|\blive band\b|\blive at\b|\bunplugged\b|\bsymphony\b|\bqawwali\b|\bghazal\b|\bsufi\b|\bcarnatic\b|\bhindustani\b|\bjam(ming|mers)?\b|\bsing(ing|er)?\b|\bdj\b/,
  },
  {
    category: "food",
    pattern:
      /\bfood\b|\bdining\b|\bculinary\b|\bbaking\b|\bbake\b|\bcook(ing|out)?\b|\bbrunch\b|\bwine\b(?! glass)|\bbeer\b|\btasting\b|\bbrewery\b|\bcafe\b|\bpotluck\b|\bsupper\b|\bhi[\s-]?tea\b|\bhigh tea\b|\bhot ?pot\b|\bbuffet\b|\bpizza\b|\bsushi\b|\bpasta\b|\bdessert\b|\bcake\b|\bchocolate\b|\btiramisu\b|\bbiryani\b|\bbarbeque\b|\bbarbecue\b|\bbbq\b|\bhibachi\b|\bset menu\b/,
  },
  {
    category: "workshop",
    pattern:
      /\bworkshop\b|\bmasterclass\b|\bbootcamp\b|\btraining\b|\bclass(es)?\b|\bcertification\b|\bhands[\s-]?on\b|\bpottery\b|\bclay\b|\bceramic\b|\bpaint(ing)?\b|\bcraft(ing)?\b|\bcalligraphy\b|\bphotography\b|\bdiy\b|\bmake your own\b|\bart\b|\bsketch(ing)?\b|\bdoodle\b|\bresin\b|\bterrarium\b|\bscrapbook\b|\bknit(ting)?\b|\bcrochet\b|\bcandle\b|\bjournal(ing|ling)?\b|\bmacrame\b|\bembroidery\b|\btufting\b|\bmehendi\b|\bmaking\b|\bdecorat(e|ing)\b|\bkintsugi\b|\bikebana\b|\borigami\b|\bfloral\b|\bflower\b|\bplant(er|ing)?\b|\bgarden(ing)?\b|\bmosaic\b|\bsculpt(ing|ure)?\b|\bpoetry\b|\bwriting\b|\btarot\b|\bastrology\b/,
  },
  {
    category: "community",
    pattern:
      /\bmeetups?\b|\bmeet[\s-]?ups?\b|\bnetworking\b|\bcommunity\b|\bconferences?\b|\bsummits?\b|\bseminar\b|\bexhibitions?\b|\bexpo\b|\bhackathon\b|\bdemo\b|\bstart[\s-]?ups?\b|\bfounders?\b|\bpitch\b|\bconclave\b|\bsocial\b|\bboard ?gam(e|ing)\b|\bquiz\b|\btrivia\b|\bbook club\b|\bdiscussion\b|\bpanel\b|\btalks?\b|\bvolunteer(ing)?\b|\bfundrais(er|ing)\b|\bgamers?\b|\bgaming\b|\bcarnival\b|\bfest(ival)?\b|\bflea\b|\bconnect\b|\bmixer\b|\bcohort\b|\bforum\b/,
  },
  {
    category: "nightlife",
    pattern:
      /\bnightlife\b|\bnight ?club\b|\bclubbing\b|\bparty\b|\bafter[\s-]?party\b|\bpub\b|\bcocktail\b|\bladies night\b|\brooftop\b|\bkaraoke\b/,
  },
];

/** Source labels that carry no category meaning and would otherwise mislead. */
const NOISE = /^(hyderabad|other|personal|general|events?|india|telangana)$/i;

function usableLabels(labels: string[]): string {
  return labels
    .flatMap((label) => label.split(","))
    .map((label) => label.trim())
    .filter((label) => label && !NOISE.test(label))
    .join(" ")
    .toLowerCase();
}

/**
 * Classifies an event, preferring source labels and falling back to the title.
 * Returns "other" when neither says anything recognisable.
 */
export function classify(labels: string[], title: string, tags: string[] = []): Category {
  const fromLabels = usableLabels([...labels, ...tags]);
  for (const { category, pattern } of RULES) {
    if (pattern.test(fromLabels)) return category;
  }
  const fromTitle = foldTitle(title);
  for (const { category, pattern } of RULES) {
    if (pattern.test(fromTitle)) return category;
  }
  return "other";
}

/** Titles arrive styled ("\u{1D416}\u{1D40E}\u{1D411}\u{1D40A}\u{1D412}\u{1D407}\u{1D40E}\u{1D40F}") and HTML-escaped; fold both so the rules see plain words. */
function foldTitle(title: string): string {
  return title.normalize("NFKC").replace(/&amp;/g, "&").replace(/&#39;/g, "'").toLowerCase();
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** The Phosphor glyph for each category, the same on the map, its filters and the listing (DESIGN.md, Icons). The sprite is built from these names. */
export const CATEGORY_ICON: Record<Category, string> = {
  comedy: "microphone-stage",
  music: "music-notes",
  theatre: "mask-happy",
  workshop: "palette",
  sports: "sneaker-move",
  food: "bowl-food",
  nightlife: "martini",
  community: "users-three",
  kids: "puzzle-piece",
  film: "film-slate",
  other: "sparkle",
};

/** A stored category as the sprite and the tint tokens know it; anything unknown reads as "other". */
export const iconCategory = (value: string): Category => (isCategory(value) ? value : "other");

/** "Comedy": the word for a category, as a native select option shows it (an option cannot hold an icon). */
export const categoryLabel = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
