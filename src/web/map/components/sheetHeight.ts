import { LAYOUT } from "../layout.js";
import type { Detent } from "../model/state.js";

/** The sheet's visible height at each detent (DESIGN.md, Sheet): peek 120 px, half 50dvh, full 100dvh - 104 px (it stops below the filter row, whose hit area ends at 96). */
export function detentHeight(detent: Detent, viewportHeight: number): number {
  return detent === "peek"
    ? LAYOUT.sheetPeek
    : detent === "half"
      ? (viewportHeight * LAYOUT.sheetHalfDvh) / 100
      : viewportHeight - LAYOUT.sheetFullInset;
}
