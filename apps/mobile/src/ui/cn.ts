import { typography } from "@turnout/design-tokens";
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows the stock type sizes, so it takes a token size such as text-body for a color, and the text-ink that Text
 * adds after it would remove the size. Naming the tokens as font sizes keeps a size and a color side by side.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: Object.keys(typography) }] } },
});

/** Joins class names and lets the last Tailwind utility win, the helper the vendored reusables expect. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
