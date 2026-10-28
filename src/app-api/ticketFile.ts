import { constants, inflateSync } from "node:zlib";
import { type ImageKind, sniffImage } from "./upload.js";

export type TicketFileKind = ImageKind | "pdf";

/** What a ticket file is, by its first bytes. The name and the content type the caller sent are never trusted. */
export function sniffTicketFile(bytes: Uint8Array): TicketFileKind | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return "pdf";
  return sniffImage(bytes);
}

export type PdfRefusal = "no_header" | "no_trailer" | "active_content" | "encrypted" | "unreadable_stream";
export type PdfCheck = { ok: true } | { ok: false; reason: PdfRefusal };

/** Names that make a PDF do something on its own, or hide something inside it. */
const BANNED_NAMES: ReadonlySet<string> = new Set(["JavaScript", "JS", "OpenAction", "AA", "Launch", "EmbeddedFile", "RichMedia"]);

/** The only stream filters the check can look through or knows to be plain picture data. Anything else cannot be read, so it is refused. */
const ALLOWED_FILTERS: ReadonlySet<string> = new Set([
  "FlateDecode",
  "Fl",
  "DCTDecode",
  "DCT",
  "JPXDecode",
  "CCITTFaxDecode",
  "CCF",
  "JBIG2Decode",
]);

/** The most one stream may inflate to, and the most all of them together. A bigger one is refused, so a small file cannot fill memory. */
const MAX_STREAM_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const TAIL_BYTES = 2048;

const NAME = /\/([^\s()<>[\]{}/%]*)/g;
const FILTER_VALUE = /\/Filter\s*(\[[^\]]*\]|\/[^\s()<>[\]{}/%]+|[^\s/[]*)/g;

/** Writes of a name with `#41` style escapes read the same as the plain letters, so they are turned back before anything is compared. */
const unescapeNames = (text: string): string =>
  text.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

type Finding = "active_content" | "encrypted" | "unreadable_stream" | null;

/** Looks at the names and the stream filters in one piece of PDF text. */
function scanText(raw: string): Finding {
  const text = unescapeNames(raw);
  let encrypted = false;
  for (const match of text.matchAll(NAME)) {
    const name = match[1] as string;
    if (BANNED_NAMES.has(name)) return "active_content";
    if (name === "Encrypt") encrypted = true;
  }
  for (const match of text.matchAll(FILTER_VALUE)) {
    const value = match[1] as string;
    // A filter that is not a name or a list of names (`7 0 R`) cannot be known without following it.
    if (!value.startsWith("/") && !value.startsWith("[")) return "unreadable_stream";
    for (const filter of value.matchAll(NAME)) if (!ALLOWED_FILTERS.has(filter[1] as string)) return "unreadable_stream";
  }
  return encrypted ? "encrypted" : null;
}

/** The data of every `stream ... endstream` pair in the file. */
function* streamData(bytes: Buffer, text: string): Generator<Buffer> {
  let from = 0;
  for (;;) {
    const at = text.indexOf("stream", from);
    if (at < 0) return;
    from = at + 6;
    if (at >= 3 && text.startsWith("end", at - 3)) continue;
    let start = at + 6;
    if (text[start] === "\r") start++;
    if (text[start] !== "\n") continue;
    start++;
    const end = text.indexOf("endstream", start);
    yield bytes.subarray(start, end < 0 ? bytes.length : end);
    if (end > 0) from = end;
  }
}

/**
 * Looks inside a PDF for anything active before the operator opens it. It needs a `%PDF-` header and a trailer, refuses the names
 * that run or hide code (`/JavaScript`, `/JS`, `/OpenAction`, `/AA`, `/Launch`, `/EmbeddedFile`, `/RichMedia`) wherever they are,
 * including inside compressed streams (every stream is inflated and looked at too), and refuses a file it cannot see into: an
 * encrypted one, a stream with a filter it cannot unpack, one that inflates to more than a ticket could need.
 */
export function checkPdf(input: Uint8Array): PdfCheck {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, reason: "no_header" };
  const tail = bytes.subarray(Math.max(0, bytes.length - TAIL_BYTES)).toString("latin1");
  if (!tail.includes("%%EOF") || !tail.includes("startxref")) return { ok: false, reason: "no_trailer" };
  const text = bytes.toString("latin1");
  const direct = scanText(text);
  if (direct === "active_content") return { ok: false, reason: direct };
  let found: Finding = direct;
  let budget = MAX_TOTAL_BYTES;
  for (const data of streamData(bytes, text)) {
    let inflated: Buffer;
    try {
      // A cut-off stream still gives what it had; a stream that is not deflate data at all (a JPEG, plain text) throws and is skipped.
      inflated = inflateSync(data, { maxOutputLength: Math.min(MAX_STREAM_BYTES, budget), finishFlush: constants.Z_SYNC_FLUSH });
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return { ok: false, reason: "unreadable_stream" };
      continue;
    }
    budget -= inflated.length;
    const inside = scanText(inflated.toString("latin1"));
    if (inside === "active_content") return { ok: false, reason: inside };
    found ??= inside;
  }
  return found === null ? { ok: true } : { ok: false, reason: found };
}
