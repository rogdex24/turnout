/**
 * An address from the server (a ticket page, a listing) that is safe to hand to the browser: http or https only. Anything else,
 * such as a script, an intent or another app's scheme, is dropped, so a bad row in the catalogue cannot open a different app.
 */
export function safeWebUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? text : null;
  } catch {
    return null;
  }
}
