import type { Point } from "@/model/walk";

export type LocationPermission = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean };

/**
 * What the meet card needs of the phone's location, so the rules around it can be tested without a phone. Foreground only: the app never
 * asks to read the place in the background. A point is shown on the card and dropped; nothing here has a way to send one anywhere.
 */
export interface LocationNative {
  /** Reads the permission without asking. */
  permission(): Promise<LocationPermission>;
  /** Asks the system question. Only called when the person taps the line on the live card. */
  requestPermission(): Promise<LocationPermission>;
  /** Calls `onPoint` for each fix, about every 25 m of walking. Returns the way to stop. */
  watch(onPoint: (point: Point) => void): Promise<() => void>;
}
