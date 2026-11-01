/**
 * Which links may open which screen. Every link the phone hands the app goes through `resolveSystemPath`, which returns an app route
 * or "/" (Home). Nothing the link says is passed on except a show id that has been checked and, for Storybook, a plain story id.
 */
import { NOTICE_KINDS } from "@turnout/contract/app/notices";

export interface LinkContext {
  /** `go.<host>`, from the build. Null until the domain exists, and then no https link is accepted. */
  linkHost: string | null;
  /** The build's own scheme (`turnout`, `turnout-e2e`, ...). Other schemes are refused. */
  scheme: string;
  /** False while the group flow is not in the build, so a `/go` link opens the show, where Go says it is coming. */
  goEnabled: boolean;
  /** True in a development build, which needs the dev client launcher's own links. */
  devClient: boolean;
  /** True only in the e2e build, which has a link that acts as a tapped notification (`push?kind=..&noticeId=..&planId=..`) so a flow can test the routing. */
  pushHook?: boolean;
}

const MAX_LINK_LENGTH = 2048;
// A show id or slug: letters, digits, `_` and `-`, starting with a letter or digit. No dots, so no `..` and no file suffix.
const SHOW_ID = "[A-Za-z0-9][A-Za-z0-9_-]{0,127}";
const WEB_PATH = new RegExp(`^/e/(${SHOW_ID})(/go)?/?$`);
const SCHEME_PATH = new RegExp(`^(?:show|e)/(${SHOW_ID})(/go)?/?$`);
const APP_PATH = new RegExp(`^/show/(${SHOW_ID})(/go)?/?$`);
const PUSH_ID = /^[A-Za-z0-9_-]{1,40}$/;
const STORY_ID = /^[A-Za-z0-9_-]{1,100}$/;
const LINK_HOST = /^go(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,}$/;

/** The host written as `go.<domain>`, lower-cased, or null when it is not one. */
export function normalizeLinkHost(value: string | undefined): string | null {
  const host = value?.trim().toLowerCase();
  return host && LINK_HOST.test(host) ? host : null;
}

function showRoute(id: string, go: string | undefined, ctx: LinkContext): string {
  return go !== undefined && ctx.goEnabled ? `/show/${id}/go` : `/show/${id}`;
}

function fromWeb(input: string, ctx: LinkContext): string | null {
  if (ctx.linkHost === null) return null;
  // The authority is everything up to the first `/`, `?` or `#`, so a user, a port or a look-alike suffix makes it differ from the host.
  const parts = /^https:\/\/([^/?#]*)([^?#]*)(?:\?[^#]*)?(?:#.*)?$/i.exec(input);
  if (parts === null || parts[1]?.toLowerCase() !== ctx.linkHost) return null;
  const match = WEB_PATH.exec(parts[2] ?? "");
  return match === null ? null : showRoute(match[1] as string, match[2], ctx);
}

/** The e2e push link, as a route with only the three fields a push carries. Anything that is not one of ours is Home. */
function pushHookRoute(query: string): string {
  const params = new URLSearchParams(query);
  const kind = params.get("kind");
  const noticeId = params.get("noticeId");
  const planId = params.get("planId");
  if (kind === null || !NOTICE_KINDS.some((known) => known === kind)) return "/";
  if (noticeId === null || !PUSH_ID.test(noticeId) || (planId !== null && !PUSH_ID.test(planId))) return "/";
  return `/push?${new URLSearchParams({ kind, noticeId, ...(planId === null ? {} : { planId }) }).toString()}`;
}

function fromScheme(input: string, rest: string, ctx: LinkContext): string | null {
  if (ctx.devClient && rest.startsWith("expo-development-client")) return input;
  // `turnout://show/x` and `turnout:///show/x` mean the same thing.
  const body = rest.startsWith("/") ? rest.slice(1) : rest;
  const [path = "", query = ""] = body.split("#")[0]?.split("?", 2) ?? [];
  if (path === "" || path === "/") return "/";
  if (path === "storybook") {
    // Split by hand: React Native's URLSearchParams does not implement get on every version we ship.
    const params = new Map(query.split("&").map((pair) => pair.split("=", 2) as [string, string | undefined]));
    const story = params.get("story");
    if (story === undefined || !STORY_ID.test(story)) return "/storybook";
    // device=1 comes from the visual capture link: the story follows the device theme and text size.
    return params.get("device") === "1" ? `/storybook?story=${story}&device=1` : `/storybook?story=${story}`;
  }
  if (path === "push" && ctx.pushHook) return pushHookRoute(query);
  const match = SCHEME_PATH.exec(path);
  return match === null ? null : showRoute(match[1] as string, match[2], ctx);
}

// A path inside the app, as the router hands it back for a link it has already read. It needs the same checks as any other link.
function fromAppPath(input: string, ctx: LinkContext): string | null {
  const path = input.split("#")[0]?.split("?")[0] ?? "";
  if (path === "/") return "/";
  if (path === "/push" && ctx.pushHook) return pushHookRoute(input.split("#")[0]?.split("?")[1] ?? "");
  const match = APP_PATH.exec(path);
  return match === null ? null : showRoute(match[1] as string, match[2], ctx);
}

/** The app route for a link the system opened, or "/" for anything not on the list. */
export function resolveSystemPath(input: string, ctx: LinkContext): string {
  const link = input.trim();
  if (link === "" || link.length > MAX_LINK_LENGTH) return "/";
  const prefix = `${ctx.scheme.toLowerCase()}://`;
  if (link.toLowerCase().startsWith(prefix)) return fromScheme(link, link.slice(prefix.length), ctx) ?? "/";
  if (link.startsWith("/") && !link.startsWith("//")) return fromAppPath(link, ctx) ?? "/";
  return fromWeb(link, ctx) ?? "/";
}
