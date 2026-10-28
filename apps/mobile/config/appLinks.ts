import { normalizeLinkHost } from "../src/model/linking.ts";

type Env = Record<string, string | undefined>;

/** The Android intent filter data entry that Expo writes into the manifest. */
export interface IntentFilter {
  action: string;
  autoVerify: boolean;
  data: { scheme: string; host: string; pathPrefix: string }[];
  category: string[];
}

/**
 * `APP_LINKS_HOST` is `go.<host>`. Not set means no app links (the domain does not exist yet), and a value that is not a
 * `go.<domain>` host fails the build, so a typo does not ship a filter for the wrong host.
 */
export function resolveLinkHost(env: Env): string | null {
  const raw = env.APP_LINKS_HOST?.trim();
  if (!raw) return null;
  const host = normalizeLinkHost(raw);
  if (host === null) throw new Error(`APP_LINKS_HOST must be a go.<domain> host name with no scheme or path, got "${raw}"`);
  return host;
}

/**
 * Verified App Links for `https://<host>/e/...`. `autoVerify` makes Android fetch `/.well-known/assetlinks.json` from the host at
 * install. There is no iOS counterpart: Apple's associated domains need the Apple developer account (TN3155), so iOS opens these
 * links in the browser until then.
 */
export function androidIntentFilters(host: string | null): IntentFilter[] {
  if (host === null) return [];
  return [{ action: "VIEW", autoVerify: true, data: [{ scheme: "https", host, pathPrefix: "/e/" }], category: ["BROWSABLE", "DEFAULT"] }];
}
