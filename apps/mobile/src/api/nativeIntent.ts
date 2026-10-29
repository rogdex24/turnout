import Constants from "expo-constants";
import { type LinkContext, normalizeLinkHost, resolveSystemPath } from "@/model/linking";
import { groupsEnabled } from "./features";
import { appVariant } from "./variant";

function context(): LinkContext {
  const extra = Constants.expoConfig?.extra;
  return {
    linkHost: normalizeLinkHost(typeof extra?.linkHost === "string" ? extra.linkHost : undefined),
    scheme: String(Constants.expoConfig?.scheme ?? ""),
    goEnabled: groupsEnabled(),
    devClient: __DEV__,
    pushHook: appVariant() === "e2e",
  };
}

/**
 * Every link the system opens (an https link on the link host, or the app's own scheme) comes through here before the router sees it.
 * Only a show and its go flow are allowed; anything else opens Home. https://docs.expo.dev/router/advanced/native-intent/
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return resolveSystemPath(path, context());
}
