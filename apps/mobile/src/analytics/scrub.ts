/** Removes what must never leave the phone from a piece of text, a URL or a Sentry event: phone numbers, emails, tokens, queries and bodies. */

const PHONE_RUN = /(?<![\w.])[+(]?\d[\d\s().-]{5,}\d(?![\w])/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)]+/gi;
const URL_PARTS = /^(https?:\/\/)(?:[^@/?#]*@)?([^/?#]*)([^?#]*)/i;
const TOKEN_SEGMENT = /^[A-Za-z0-9_-]{20,}$/;

/** A URL with no credentials, no query, no fragment, and any path segment that looks like a token replaced. */
export function scrubUrl(url: string): string {
  const parts = URL_PARTS.exec(url);
  if (parts === null) return url.split(/[?#]/)[0] ?? "";
  const [, scheme, host, path] = parts;
  const safePath = (path ?? "")
    .split("/")
    .map((segment) => (TOKEN_SEGMENT.test(segment) ? "[token]" : segment))
    .join("/");
  return `${scheme}${host}${safePath}`;
}

function digitCount(text: string): number {
  return text.replace(/\D/g, "").length;
}

export function scrubText(text: string): string {
  return text
    .replace(URL_IN_TEXT, (url) => scrubUrl(url))
    .replace(EMAIL, "[email]")
    .replace(BEARER, "Bearer [token]")
    .replace(PHONE_RUN, (run) => (digitCount(run) >= 7 && !ISO_DATE.test(run.trim()) ? "[phone]" : run));
}

/** Scrubs a string, and every string inside an array or a plain object at any depth. */
function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return scrubRecord(value as Record<string, unknown>);
  }
  return value;
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = key === "url" && typeof value === "string" ? scrubUrl(value) : scrubValue(value);
  }
  return out;
}

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Scrubs a breadcrumb's message and data. A console breadcrumb keeps only its `logger`: its `arguments` are whatever the app
 * logged, so they never leave the phone, even scrubbed.
 */
export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(crumb: B): B {
  if (crumb.message !== undefined) crumb.message = scrubText(crumb.message);
  if (crumb.data !== undefined) {
    const { arguments: _logged, ...rest } = crumb.data;
    crumb.data = scrubRecord(crumb.category === "console" ? rest : crumb.data);
  }
  return crumb;
}

/** The parts of a Sentry event this file reads. A real `ErrorEvent` fits it, and a test can pass a plain object. */
export interface ScrubbableEvent {
  message?: string;
  user?: unknown;
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
  extra?: Record<string, unknown>;
}

/** The `beforeSend` body: drops the person and the request body, keeps the bare URL, and scrubs every free-text field. */
export function scrubSentryEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.user;
  if (event.message !== undefined) event.message = scrubText(event.message);
  if (event.request !== undefined) {
    const url = event.request.url;
    event.request = url === undefined ? {} : { url: scrubUrl(url) };
  }
  for (const entry of event.exception?.values ?? []) {
    if (entry.value !== undefined) entry.value = scrubText(entry.value);
  }
  for (const crumb of event.breadcrumbs ?? []) scrubBreadcrumb(crumb);
  if (event.extra !== undefined) event.extra = scrubRecord(event.extra);
  return event;
}
