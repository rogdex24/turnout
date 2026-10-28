import { describe, expect, test } from "bun:test";
import { checkPdf, sniffTicketFile } from "../src/app-api/ticketFile.js";
import {
  cleanPdf,
  cleanPdfWithStream,
  cleanPng,
  encryptedPdf,
  pdfWithDeflateBomb,
  pdfWithEscapedName,
  pdfWithIndirectFilter,
  pdfWithMarkerInStream,
  pdfWithOpaqueFilter,
  pdfWithOpenAction,
  truncatedPdf,
  zipRenamedPdf,
} from "./fixtures/tickets/index.js";

describe("sniffTicketFile", () => {
  test("names a file by its first bytes", () => {
    expect(sniffTicketFile(cleanPdf())).toBe("pdf");
    expect(sniffTicketFile(cleanPng())).toBe("png");
    expect(sniffTicketFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  });

  test("a ZIP with a .pdf name, an empty file and plain text are nothing", () => {
    expect(sniffTicketFile(zipRenamedPdf())).toBeNull();
    expect(sniffTicketFile(new Uint8Array(0))).toBeNull();
    expect(sniffTicketFile(Buffer.from("hello"))).toBeNull();
  });
});

describe("checkPdf", () => {
  test("a plain PDF and one with a deflated content stream pass", () => {
    expect(checkPdf(cleanPdf())).toEqual({ ok: true });
    expect(checkPdf(cleanPdfWithStream())).toEqual({ ok: true });
  });

  test("a PDF that runs something when it opens is refused", () => {
    expect(checkPdf(pdfWithOpenAction())).toEqual({ ok: false, reason: "active_content" });
  });

  test("a marker written with a hex escape in its name is still found", () => {
    expect(checkPdf(pdfWithEscapedName())).toEqual({ ok: false, reason: "active_content" });
  });

  test("every banned name is found inside a compressed stream", () => {
    for (const marker of ["/JavaScript", "/JS", "/OpenAction", "/AA", "/Launch", "/EmbeddedFile", "/RichMedia"]) {
      expect(checkPdf(pdfWithMarkerInStream(marker))).toEqual({ ok: false, reason: "active_content" });
    }
  });

  test("a longer name that only starts like a banned one is not a match", () => {
    expect(checkPdf(pdfWithMarkerInStream("/JSONData"))).toEqual({ ok: true });
    expect(checkPdf(pdfWithMarkerInStream("/AAPL"))).toEqual({ ok: true });
  });

  test("a stream it cannot look inside, an indirect filter and an encrypted file are refused", () => {
    expect(checkPdf(pdfWithOpaqueFilter())).toEqual({ ok: false, reason: "unreadable_stream" });
    expect(checkPdf(pdfWithIndirectFilter())).toEqual({ ok: false, reason: "unreadable_stream" });
    expect(checkPdf(encryptedPdf())).toEqual({ ok: false, reason: "encrypted" });
  });

  test("a deflate bomb is refused without being unpacked in full", () => {
    expect(checkPdf(pdfWithDeflateBomb())).toEqual({ ok: false, reason: "unreadable_stream" });
  });

  test("a file with no header or no trailer is refused", () => {
    expect(checkPdf(truncatedPdf())).toEqual({ ok: false, reason: "no_trailer" });
    expect(checkPdf(zipRenamedPdf())).toEqual({ ok: false, reason: "no_header" });
    expect(checkPdf(new Uint8Array(0))).toEqual({ ok: false, reason: "no_header" });
  });
});
