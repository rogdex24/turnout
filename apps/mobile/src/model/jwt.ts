/** The `sub` of an access token, which is the member id. The app only reads it to name the cache; the server checks the signature. */
export function jwtSubject(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed: unknown = JSON.parse(atob(base64));
    if (typeof parsed === "object" && parsed !== null && "sub" in parsed && typeof parsed.sub === "string") return parsed.sub;
  } catch {
    // A token that does not decode has no subject.
  }
  return null;
}
