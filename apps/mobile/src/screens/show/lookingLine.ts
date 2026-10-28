import { show } from "@/copy/show";
import { groupIndian } from "@/model/showTime";

export interface LookingLine {
  /** The big number, or null when there is nobody yet and the sentence stands alone. */
  numeral: string | null;
  text: string;
}

/** The "people are looking for a group" line. Null when the count is not known, which is every show until groups open. */
export function lookingLine(count: number | null | undefined): LookingLine | null {
  if (count === null || count === undefined || !Number.isInteger(count) || count < 0) return null;
  if (count === 0) return { numeral: null, text: show.looking.none };
  return { numeral: groupIndian(count), text: count === 1 ? show.looking.one : show.looking.many };
}
