import { haversineKm } from "../utils/geo.js";

/** Hyderabad area enum from data-model.md §4.1 (subset used for Phase 1 filters). */
export const AREAS = [
  "gachibowli",
  "madhapur",
  "hitec-city",
  "kondapur",
  "financial-district",
  "nanakramguda",
  "kokapet",
  "manikonda",
  "tolichowki",
  "jubilee-hills",
  "banjara-hills",
  "film-nagar",
  "somajiguda",
  "begumpet",
  "ameerpet",
  "punjagutta",
  "khairatabad",
  "kukatpally",
  "miyapur",
  "nizampet",
  "bachupally",
  "secunderabad",
  "marredpally",
  "kompally",
  "alwal",
  "uppal",
  "nacharam",
  "lb-nagar",
  "dilsukhnagar",
  "old-city",
  "charminar",
  "mehdipatnam",
  "attapur",
  "shamshabad",
  "sangareddy",
  "other",
] as const;

export type Area = (typeof AREAS)[number];

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * One representative point per area, kept next to AREAS so a new slug cannot
 * be added without one. Used to place a venue with no coordinates (approximate)
 * and to name the area of a venue that has them. sangareddy is a town outside
 * the Hyderabad box, so a venue placed there is never shown on the map.
 */
export const AREA_CENTRES: Record<Exclude<Area, "other">, LatLng> = {
  gachibowli: { lat: 17.4401, lng: 78.3489 },
  madhapur: { lat: 17.4486, lng: 78.3908 },
  "hitec-city": { lat: 17.4435, lng: 78.3772 },
  kondapur: { lat: 17.46, lng: 78.364 },
  "financial-district": { lat: 17.413, lng: 78.34 },
  nanakramguda: { lat: 17.42, lng: 78.348 },
  kokapet: { lat: 17.393, lng: 78.335 },
  manikonda: { lat: 17.4034, lng: 78.3868 },
  tolichowki: { lat: 17.4, lng: 78.415 },
  "jubilee-hills": { lat: 17.4326, lng: 78.4071 },
  "banjara-hills": { lat: 17.4126, lng: 78.4482 },
  "film-nagar": { lat: 17.415, lng: 78.41 },
  somajiguda: { lat: 17.424, lng: 78.458 },
  begumpet: { lat: 17.444, lng: 78.467 },
  ameerpet: { lat: 17.4375, lng: 78.4483 },
  punjagutta: { lat: 17.426, lng: 78.452 },
  khairatabad: { lat: 17.412, lng: 78.46 },
  kukatpally: { lat: 17.4948, lng: 78.3996 },
  miyapur: { lat: 17.4969, lng: 78.3548 },
  nizampet: { lat: 17.517, lng: 78.385 },
  bachupally: { lat: 17.544, lng: 78.36 },
  secunderabad: { lat: 17.4399, lng: 78.4983 },
  marredpally: { lat: 17.452, lng: 78.513 },
  kompally: { lat: 17.54, lng: 78.486 },
  alwal: { lat: 17.5, lng: 78.51 },
  uppal: { lat: 17.405, lng: 78.559 },
  nacharam: { lat: 17.428, lng: 78.55 },
  "lb-nagar": { lat: 17.347, lng: 78.552 },
  dilsukhnagar: { lat: 17.3688, lng: 78.5247 },
  "old-city": { lat: 17.36, lng: 78.474 },
  charminar: { lat: 17.3616, lng: 78.4747 },
  mehdipatnam: { lat: 17.395, lng: 78.44 },
  attapur: { lat: 17.368, lng: 78.42 },
  shamshabad: { lat: 17.26, lng: 78.39 },
  sangareddy: { lat: 17.6247, lng: 78.0867 },
};

/**
 * How far a venue's real point may be from an area centre and still take that
 * area. Core-city centres sit 1 to 3 km apart, so 2.5 km claims the nearest
 * neighbourhood without reaching into the next one, and leaves venues on the
 * far edge as `other` rather than guessing.
 */
export const AREA_SNAP_KM = 2.5;

/** The area whose centre is nearest the point, or `other` when none is within AREA_SNAP_KM. */
export function nearestArea(lat: number, lng: number): Area {
  let best: Area = "other";
  let bestKm = AREA_SNAP_KM;
  for (const [slug, centre] of Object.entries(AREA_CENTRES) as Array<[Exclude<Area, "other">, LatLng]>) {
    const km = haversineKm(lat, lng, centre.lat, centre.lng);
    if (km <= bestKm) {
      best = slug;
      bestKm = km;
    }
  }
  return best;
}

/**
 * Alias phrases → canonical area slug. Longer / more specific phrases first.
 * Expanded from live venue_name+address samples where area was still `other`.
 *
 * Order matters:
 * 1) multi-word neighbourhoods + known venues
 * 2) single-token neighbourhoods (beats broad mandal leftovers)
 * 3) broad west-Hyd mandal catch-alls last
 */
const AREA_ALIASES: Array<[RegExp, Area]> = [
  // Multi-word neighbourhoods
  [/\bfinancial\s*district\b|\bgachibowli\s*financial\b/i, "financial-district"],
  [/\bjubilee\s*hills\b/i, "jubilee-hills"],
  [/\bbanjara\s*hills\b/i, "banjara-hills"],
  [/\bfilm\s*nagar\b/i, "film-nagar"],
  [/\blb\s*nagar\b|\bl\.?b\.?\s*nagar\b/i, "lb-nagar"],
  [/\bkothapet\b|\bsaroornagar\b/i, "lb-nagar"],
  [/\bold\s*city\b/i, "old-city"],
  [/\bpathergatti\b|\bafzal\s*gunj\b|\bbegum\s*bazar\b|\bmir\s*alam\b/i, "old-city"],
  [
    /\blakdikapul\b|\bsaifabad\b|\bred\s*hills\b|\bftcci\b|\bftapcci\b|\bravindra\s*bharathi\b|\bkln\s*prasad\b|\bfateh\s*maidan\b/i,
    "khairatabad",
  ],
  [/\bbasheer\s*bagh\b|\bbasheerbagh\b|\bgun\s*foundry\b|\bhussain\s*sagar\b|\bsanjeevaiah\b/i, "khairatabad"],
  [/\bkhairtabad\b/i, "khairatabad"], // common misspelling
  [/\bsanjeeva\s*reddy\s*nagar\b|\bsr\s*nagar\b|\bbk\s*guda\b/i, "ameerpet"],
  [/\braj\s*bhavan\b|\bkatriya\b/i, "somajiguda"],
  [/\bgandipet\b|\bmanchirevula\b|\bnarsingi\b|\baziznagar\b/i, "kokapet"],
  [/\bkhajaguda\b/i, "financial-district"],
  [/\bkphb\b|\bk\.?p\.?h\.?b\b/i, "kukatpally"],
  [/\bnallagandla\b|\bindian\s*school\s*of\s*business\b|\bisb\b|\bdeccan\s*serai\b|\bgolf\s*edge\b/i, "gachibowli"],
  [/\bitc\s*kakatiya\b/i, "begumpet"],
  [/\blotus\s*pond\b/i, "jubilee-hills"],
  [/\bbahadur?pally\b/i, "kompally"],
  [/\bgolconda\b/i, "mehdipatnam"],

  // Known venues (before corridor tokens that also appear in their addresses)
  [/\bred\s*rhino\b/i, "gachibowli"],
  [/\bmindspace\b|\bsmaaash\b/i, "madhapur"],

  // HITEC / HITEX / Knowledge City corridor (HITEX ≠ HITEC spelling)
  [/\bhitech\s*city\b|\bhi[\s-]?tech\s*city\b|\bhitec\b/i, "hitec-city"],
  [/\bhitex\b|\bhicc\b|\bizzat\s*nagar\b|\bizzathnagar\b|\bkothaguda\b/i, "hitec-city"],
  [/\bknowledge\s*city\b|\braidurgam?\b|\brai\s*durg\b|\bpan\s*maktha\b|\bpanmaktha\b|\bpanmaqtha\b|\bt[\s-]?hub\b/i, "hitec-city"],

  // Single-token neighbourhoods — must beat broad mandal leftovers below
  [/\bgachibowli\b/i, "gachibowli"],
  [/\bmadhapur\b/i, "madhapur"],
  [/\bkondapur\b/i, "kondapur"],
  [/\bnanakramguda\b/i, "nanakramguda"],
  [/\bkokapet\b/i, "kokapet"],
  [/\bmanikonda\b/i, "manikonda"],
  [/\btolichowki\b/i, "tolichowki"],
  [/\bsomajiguda\b/i, "somajiguda"],
  [/\bbegumpet\b/i, "begumpet"],
  [/\bameerpet\b/i, "ameerpet"],
  [/\bpunjagutta\b/i, "punjagutta"],
  [/\bkhairatabad\b/i, "khairatabad"],
  [/\bkukatpally\b/i, "kukatpally"],
  [/\bmiyapur\b/i, "miyapur"],
  [/\bnizampet\b/i, "nizampet"],
  [/\bbachupally\b/i, "bachupally"],
  [/\bsecunderabad\b/i, "secunderabad"],
  [/\bmarredpally\b/i, "marredpally"],
  [/\bkompally\b/i, "kompally"],
  [/\balwal\b/i, "alwal"],
  [/\buppal\b/i, "uppal"],
  [/\bnacharam\b/i, "nacharam"],
  [/\bdilsukhnagar\b|\bdilshuknagar\b/i, "dilsukhnagar"],
  [/\bcharminar\b/i, "charminar"],
  [/\bmehdipatnam\b/i, "mehdipatnam"],
  [/\battapur\b/i, "attapur"],
  [/\bshamshabad\b/i, "shamshabad"],
  [/\bsangareddy\b/i, "sangareddy"],
  [/\bfd\b/i, "financial-district"],

  // Broad west-Hyd mandal leftover (Google addresses stamp this on half of west Hyd)
  [/\bserilingampall[ye]\b/i, "hitec-city"],
];

/** Infer area enum from venue name + address. Falls back to `other`. */
export function inferArea(venueName: string | null | undefined, address: string | null | undefined): Area {
  const hay = `${venueName ?? ""} ${address ?? ""}`.trim();
  if (!hay) return "other";
  for (const [re, area] of AREA_ALIASES) {
    if (re.test(hay)) return area;
  }
  return "other";
}
