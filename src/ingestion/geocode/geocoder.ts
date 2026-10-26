export interface GeocodeHit {
  lat: number;
  lng: number;
  placeId?: string;
}

/** One provider. Adding Google is one new file implementing this, plus one line in cli.ts. */
export interface Geocoder {
  name: "nominatim" | "google";
  geocode(query: string): Promise<GeocodeHit | null>;
}
