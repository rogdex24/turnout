/** Stored legacy data must pass the public link boundary too. */
export function publicSourceUrl(value: string): string | null {
  return /^https?:\/\//i.test(value) && URL.canParse(value) ? value : null;
}
