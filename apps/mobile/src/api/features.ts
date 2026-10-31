/** "1" or "true" turns a flag on. Anything else, including an unset variable, is off. */
export function parseFlag(value: string | undefined): boolean {
  const text = value?.trim().toLowerCase();
  return text === "1" || text === "true";
}

/**
 * Whether groups are open in this build. Every profile in `eas.json` turns it on; a local or fork build without it opens "Coming
 * soon in this build" from the Show page's Go button. With it on, the Go button and `/go` links open the go sheet (`src/app/(app)/show/[publicId]/go.tsx`). The variable is read by its full name so Metro can inline it.
 */
export function groupsEnabled(): boolean {
  return parseFlag(process.env.EXPO_PUBLIC_GROUPS_ENABLED);
}
