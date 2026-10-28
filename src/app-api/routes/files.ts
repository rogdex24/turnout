import { contentTypeForKey } from "../../utils/objectStore.js";
import type { Route } from "../context.js";
import { notFound } from "../errors.js";
import { keyFromFilePath, verifyFileLink } from "../fileLinks.js";

/** Serves a stored file to anyone holding a good signed link. A bad, tampered or expired link, and a missing file, are all the same 404. */
export const fileRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/files/*",
    auth: "none",
    handler: async ({ app, url, now }) => {
      const key = keyFromFilePath(url.pathname);
      // Ticket files are for the operator's review only. No app link is ever made for one, and a key under tickets/ is the same 404.
      if (
        key === null ||
        key.startsWith("tickets/") ||
        !verifyFileLink(app.config.fileLinkSecret, key, url.searchParams.get("exp"), url.searchParams.get("sig"), now)
      )
        throw notFound();
      const object = await app.store.get(key);
      if (object === null) throw notFound();
      return new Response(Buffer.from(object.bytes), {
        headers: {
          "content-type": object.contentType || contentTypeForKey(key),
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "content-disposition": "inline",
        },
      });
    },
  },
];
