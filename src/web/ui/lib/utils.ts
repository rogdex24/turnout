import { type ClassValue, clsx } from "clsx";

/**
 * The shadcn class helper, without tailwind-merge. twMerge resolves conflicts between Tailwind classes, which costs
 * 9 KB gzipped in the map bundle; our component classes are written not to conflict (the base-nova defaults are replaced,
 * not stacked) and the page's own CSS is unlayered, so it wins over Tailwind's layered utilities anyway.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
