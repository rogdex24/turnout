/** Session state of /map (D5): where the reader is, which detent the phone sheet is at, which list sections they folded. */
import { LAYOUT } from "../layout.js";

export type Detent = "peek" | "half" | "full";
export const DETENTS: readonly Detent[] = ["peek", "half", "full"];

export type Location =
  | { kind: "off" }
  | { kind: "requesting" }
  | { kind: "on"; origin: { lat: number; lng: number }; km: number }
  | { kind: "denied" };

export interface Session {
  location: Location;
  sheet: Detent;
  /** Section keys the reader collapsed ("type:comedy", "day:2026-10-11", "venue:<id>"). Every other section is open. */
  collapsed: readonly string[];
}

export type Action =
  | { type: "locate-start" }
  | { type: "locate-found"; origin: { lat: number; lng: number } }
  | { type: "locate-denied" }
  | { type: "locate-off" }
  | { type: "radius"; km: number }
  | { type: "sheet"; detent: Detent }
  | { type: "section"; key: string; open: boolean };

export const initialSession = (sheet: Detent): Session => ({ location: { kind: "off" }, sheet, collapsed: [] });

export function reduce(state: Session, action: Action): Session {
  switch (action.type) {
    case "locate-start":
      return state.location.kind === "requesting" ? state : { ...state, location: { kind: "requesting" } };
    case "locate-found":
      return { ...state, location: { kind: "on", origin: action.origin, km: LAYOUT.nearKm.default } };
    case "locate-denied":
      return { ...state, location: { kind: "denied" } };
    case "locate-off":
      return { ...state, location: { kind: "off" } };
    case "radius":
      return state.location.kind === "on" ? { ...state, location: { ...state.location, km: action.km } } : state;
    case "sheet":
      return state.sheet === action.detent ? state : { ...state, sheet: action.detent };
    case "section": {
      const has = state.collapsed.includes(action.key);
      if (action.open === !has) return state;
      return { ...state, collapsed: action.open ? state.collapsed.filter((k) => k !== action.key) : [...state.collapsed, action.key] };
    }
  }
}

/** The origin and radius while Near me is on, else null. */
export const nearby = (location: Location): { origin: { lat: number; lng: number }; km: number } | null =>
  location.kind === "on" ? { origin: location.origin, km: location.km } : null;
