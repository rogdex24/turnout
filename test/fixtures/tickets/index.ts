import { deflateSync } from "node:zlib";
import { makePng } from "../../imageFixtures.js";

/**
 * Ticket files for the upload tests, built in code so no binary file sits in the repository. Every name and number is made up.
 */

const text = (value: string): Buffer => Buffer.from(value, "latin1");

interface PdfObject {
  /** The object body without the `n 0 obj` and `endobj` lines. */
  body: Buffer | string;
}

/** A small, valid PDF: a catalog, one empty page, a classic cross-reference table and a trailer. `extra` objects are appended before the table. */
function buildPdf(options: { catalogExtra?: string; extra?: PdfObject[]; trailerExtra?: string } = {}): Buffer {
  const objects: (Buffer | string)[] = [
    `<< /Type /Catalog /Pages 2 0 R${options.catalogExtra ?? ""} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    ...(options.extra ?? []).map((object) => object.body),
  ];
  const parts: Buffer[] = [text("%PDF-1.4\n")];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([text(`${index + 1} 0 obj\n`), typeof body === "string" ? text(body) : body, text("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(text(xref));
  parts.push(text(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${options.trailerExtra ?? ""} >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}

/** A PDF with nothing active in it. */
export const cleanPdf = (): Buffer => buildPdf();

/** A clean PDF that also carries a deflated page content stream, as real tickets do. */
export function cleanPdfWithStream(): Buffer {
  const content = deflateSync(text("BT /F1 12 Tf 20 100 Td (Admit one) Tj ET"));
  return buildPdf({
    extra: [{ body: Buffer.concat([text(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`), content, text("\nendstream")]) }],
  });
}

/** A PDF that runs a script when it opens. */
export const pdfWithOpenAction = (): Buffer => buildPdf({ catalogExtra: " /OpenAction << /S /JavaScript /JS (app.alert(1)) >>" });

/** The same marker written with a hex escape in the name (`/Java#53cript`), which readers treat as `/JavaScript`. */
export const pdfWithEscapedName = (): Buffer => buildPdf({ catalogExtra: " /Names << /Java#53cript 9 0 R >>" });

/** The marker is only inside a compressed object stream, where a plain scan of the file cannot see it. */
export function pdfWithMarkerInStream(marker = "/JavaScript"): Buffer {
  const inner = deflateSync(text(`10 0 << /S ${marker} >>`));
  return buildPdf({
    extra: [{ body: Buffer.concat([text(`<< /Type /ObjStm /N 1 /First 5 /Length ${inner.length} /Filter /FlateDecode >>\nstream\n`), inner, text("\nendstream")]) }],
  });
}

/** A stream with a filter chain the check cannot unpack, so it cannot be looked inside. */
export function pdfWithOpaqueFilter(): Buffer {
  const data = text("78 9c 03 00 00 00 00 01>");
  return buildPdf({
    extra: [{ body: Buffer.concat([text(`<< /Length ${data.length} /Filter [/ASCIIHexDecode /FlateDecode] >>\nstream\n`), data, text("\nendstream")]) }],
  });
}

/** A PDF whose stream filter is an indirect reference: nothing says what it is without following it. */
export const pdfWithIndirectFilter = (): Buffer =>
  buildPdf({ extra: [{ body: Buffer.concat([text("<< /Length 3 /Filter 7 0 R >>\nstream\nabc\nendstream")]) }] });

/** A PDF that asks for a password. */
export const encryptedPdf = (): Buffer => buildPdf({ trailerExtra: " /Encrypt 8 0 R" });

/** A deflate bomb: a small stream that inflates to far more than any ticket needs. */
export function pdfWithDeflateBomb(): Buffer {
  const bomb = deflateSync(Buffer.alloc(40 * 1024 * 1024, 0x20));
  return buildPdf({
    extra: [{ body: Buffer.concat([text(`<< /Length ${bomb.length} /Filter /FlateDecode >>\nstream\n`), bomb, text("\nendstream")]) }],
  });
}

/** A PDF cut off before its trailer. */
export const truncatedPdf = (): Buffer => cleanPdf().subarray(0, 120);

/** A ZIP archive with a `.pdf` name on it: its first bytes are a ZIP's, not a PDF's. */
export const zipRenamedPdf = (): Buffer => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0]), Buffer.alloc(64, 0x20)]);

/** A screenshot. */
export const cleanPng = (): Buffer => makePng(64, 48);

/** A screenshot larger than the 2,000 px the stored copy is cut to. */
export const largePng = (): Buffer => makePng(2400, 1500);

/** One byte over the ticket limit. */
export const oversizedFile = (limit: number): Uint8Array => new Uint8Array(limit + 1);
