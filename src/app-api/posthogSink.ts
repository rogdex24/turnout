import { gunzipSync } from "node:zlib";
import { invalidRequest, notFound } from "./errors.js";

/**
 * The project key the e2e build of the app is given (`EXPO_PUBLIC_POSTHOG_KEY` in apps/mobile/ci/env.sh). It is not a secret and
 * opens nothing: it only tells the capture route below that the post came from that build. A post with any other key is a 404.
 */
export const E2E_POSTHOG_KEY = "phc_e2e_capture_sink";

/** The most a post may hold after it is unzipped, and the most events the sink keeps. */
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS = 500;

/** One event as the app sent it: the name, the properties the app chose, and when the sink got it. */
export interface CapturedEvent {
  event: string;
  properties: Record<string, string | number | boolean>;
  at: string;
}

export interface PosthogSink {
  /** Takes one post (`/batch`, `/capture` or `/e`, gzip or plain) and returns how many events it held. */
  ingest(body: Uint8Array, contentEncoding: string | null, now: Date): number;
  events(): CapturedEvent[];
  clear(): void;
  /** Resolves with the events once `expected` appears in them in that order (other events may sit between), or after `ms`. */
  waitFor(expected: readonly string[], ms: number): Promise<{ events: CapturedEvent[]; matched: boolean }>;
}

/** True when every name in `expected` is in `names`, in that order, with other names allowed between them. */
export function containsInOrder(names: readonly string[], expected: readonly string[]): boolean {
  let next = 0;
  for (const name of names) if (name === expected[next]) next += 1;
  return next >= expected.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The SDK's own properties (`$lib`, `$device_id` and the rest), the token and the id are left out: the flows read what the app chose. */
function appProperties(raw: unknown): CapturedEvent["properties"] {
  const out: CapturedEvent["properties"] = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("$") || key === "token" || key === "distinct_id") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

function unzip(body: Uint8Array, contentEncoding: string | null): Uint8Array {
  const zipped = contentEncoding?.toLowerCase() === "gzip" || (body[0] === 0x1f && body[1] === 0x8b);
  if (!zipped) return body;
  try {
    return gunzipSync(body, { maxOutputLength: MAX_BODY_BYTES });
  } catch {
    throw invalidRequest("body: not a gzip stream this sink can read");
  }
}

/** The events in a post, and the key it came with. A batch is `{ api_key, batch: [...] }`; a single capture is `{ api_key, event }`. */
function parsePost(body: Uint8Array): { key: unknown; items: unknown[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw invalidRequest("body: not JSON");
  }
  if (!isRecord(parsed)) throw invalidRequest("body: not an object");
  const properties = isRecord(parsed.properties) ? parsed.properties : {};
  const key = parsed.api_key ?? properties.token;
  const items = Array.isArray(parsed.batch) ? parsed.batch : [parsed];
  return { key, items };
}

export function createPosthogSink(): PosthogSink {
  let kept: CapturedEvent[] = [];
  let waiters: { expected: readonly string[]; done: () => void }[] = [];
  const names = () => kept.map((item) => item.event);

  return {
    ingest(body, contentEncoding, now) {
      const { key, items } = parsePost(unzip(body, contentEncoding));
      if (key !== E2E_POSTHOG_KEY) throw notFound();
      let count = 0;
      for (const item of items) {
        if (!isRecord(item) || typeof item.event !== "string" || item.event === "") continue;
        kept.push({ event: item.event, properties: appProperties(item.properties), at: now.toISOString() });
        count += 1;
      }
      if (kept.length > MAX_EVENTS) kept = kept.slice(-MAX_EVENTS);
      for (const waiter of waiters) if (containsInOrder(names(), waiter.expected)) waiter.done();
      return count;
    },
    events: () => [...kept],
    clear() {
      kept = [];
    },
    waitFor(expected, ms) {
      const result = () => ({ events: [...kept], matched: containsInOrder(names(), expected) });
      if (ms <= 0 || result().matched) return Promise.resolve(result());
      return new Promise((resolve) => {
        const waiter = { expected, done: () => finish() };
        const timer = setTimeout(() => finish(), ms);
        function finish() {
          clearTimeout(timer);
          waiters = waiters.filter((entry) => entry !== waiter);
          resolve(result());
        }
        waiters.push(waiter);
      });
    },
  };
}

const sinks = new WeakMap<object, PosthogSink>();

/** The sink of one server: made on first use and kept for as long as the server's context lives. */
export function sinkFor(app: object): PosthogSink {
  let sink = sinks.get(app);
  if (sink === undefined) {
    sink = createPosthogSink();
    sinks.set(app, sink);
  }
  return sink;
}
