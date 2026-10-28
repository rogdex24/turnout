import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets the last Tailwind utility win, the helper the vendored reusables expect. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
