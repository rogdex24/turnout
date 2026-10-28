/** "1" or "true" turns a flag on. Anything else, including an unset variable, is off. */
export function parseFlag(value: string | undefined): boolean {
  const text = value?.trim().toLowerCase();
  return text === "1" || text === "true";
}

/**
 * Whether groups are open in this build. Off until the plans server (M3) is live: the Show page then opens "Coming soon in this
 * build" from its Go button. Keep it off in every build until the go route (`src/app/(app)/show/[publicId]/go.tsx`, A11) exists:
 * with it on, the Go button and `/go` links open that route. The variable is read by its full name so Metro can inline it.
 */
export function groupsEnabled(): boolean {
  return parseFlag(process.env.EXPO_PUBLIC_GROUPS_ENABLED);
}
