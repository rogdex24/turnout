import type { Database } from "bun:sqlite";
import { adjustableClock, type Clock, systemClock } from "../utils/clock.js";
import type { FetchLike } from "../utils/http.js";
import { diskStore, memoryStore, type ObjectStore, s3Store } from "../utils/objectStore.js";
import { createAlerts } from "./alerts.js";
import type { AppContext, LogEntry, Route } from "./context.js";
import { type AppConfig, loadAppConfig } from "./env.js";
import { signedLinker } from "./fileLinks.js";
import { housekeeping } from "./housekeeping.js";
import { createRouter, handleRequest, type Router } from "./http.js";
import { appRoutes } from "./routes/index.js";
import { fakeOtpSender, type OtpSender } from "./vendors/otpSender.js";
import { whatsappOtpSender } from "./vendors/whatsappOtp.js";

export type { AppContext } from "./context.js";
export { ConfigError } from "./env.js";

/** Where the app API lives. `cli.ts` sends every path under it here and everything else to the site. */
export const APP_PREFIX = "/api/app/";

export interface AppContextOptions {
  db: Database;
  env: Record<string, string | undefined>;
  /** The clock. Staging wraps the real one in an adjustable clock for the test route; leave it out for the system clock. */
  now?: Clock;
  fetch?: FetchLike;
  /** Replaces the sender the settings pick (tests pass a fake they can read). */
  sender?: OtpSender;
  store?: ObjectStore;
  log?: (entry: LogEntry) => void;
  extraRoutes?: Route[];
}

function defaultLog(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

const TICK_MS = 60 * 1000;

/** Reads the settings (refusing to start on a bad one) and builds everything a handler needs. */
export async function createAppContext(options: AppContextOptions): Promise<AppContext> {
  const config: AppConfig = await loadAppConfig(options.env);
  const adjust = config.env === "staging" && options.now === undefined ? adjustableClock() : undefined;
  const now: Clock = options.now ?? adjust ?? systemClock;
  const fetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const link = signedLinker(config.fileLinkSecret, config.tunables.fileLinkMinutes * 60, now);
  const store =
    options.store ??
    (config.objectStore === "s3" && config.s3 !== null
      ? s3Store(config.s3, { ttlSeconds: config.tunables.fileLinkMinutes * 60 })
      : config.objectStore === "disk"
        ? diskStore({ dir: config.filesDir, link })
        : memoryStore({ now, link }));
  const sender =
    options.sender ??
    (config.otpSender === "whatsapp" && config.whatsapp !== null ? whatsappOtpSender(config.whatsapp, fetch) : fakeOtpSender());
  const context: AppContext = {
    db: options.db,
    now,
    config,
    store,
    sender,
    alerts: createAlerts({ now, fetch, webhookUrl: config.alertWebhookUrl }),
    fetch,
    log: options.log ?? (config.env === "test" ? () => {} : defaultLog),
    extraRoutes: options.extraRoutes,
    adjustClock: adjust,
  };
  return context;
}

/** Background upkeep for the app API (the sweep and the spend alerts), once a minute. `serve --no-ticker` skips it. Returns a function that stops it. */
export function startTicker(app: AppContext): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    housekeeping(app).finally(() => {
      running = false;
    });
  }, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}

const routers = new WeakMap<AppContext, Router>();

/** The app API's answer to one request. `peerIp` is the socket's address (`server.requestIP`), used when no proxy header is set. */
export async function appResponse(app: AppContext, request: Request, peerIp: string | null = null): Promise<Response> {
  let router = routers.get(app);
  if (router === undefined) {
    router = createRouter(appRoutes(app));
    routers.set(app, router);
  }
  return handleRequest(app, router, request, peerIp);
}
