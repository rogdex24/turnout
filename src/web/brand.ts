import { markSvg } from "../utils/brandMark.js";

/**
 * The favicon route and link. The mark's geometry is in
 * utils/brandMark.ts and its colors come from DESIGN.md, so the public favicon
 * and the admin's cannot drift apart.
 */

export const faviconSvg = (): string => markSvg();

export function faviconResponse(): Response {
  return new Response(faviconSvg(), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}

/** Put in every page's head. */
export const FAVICON_LINK = `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`;
