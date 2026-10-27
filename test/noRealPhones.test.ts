import { expect, test } from "bun:test";
import { type PiiAllowlist, scanFiles, scanText, trackedFiles } from "../scripts/pii-scan.js";
import { TAKEDOWN_EMAIL } from "../src/web/config.js";

const ROOT = new URL("..", import.meta.url).pathname;
// Built from parts so this file holds no real-looking value itself.
const mobile = (head: string, tail: string): string => `${head}${tail}`;
const allow: PiiAllowlist = { emailDomains: ["example.com"], emails: [], phoneSha256: [] };

test("no tracked file holds a real-looking Indian mobile number or a non-example email", () => {
  const findings = scanFiles(ROOT, trackedFiles(ROOT));
  expect(findings.map((f) => `${f.path}:${f.line} ${f.kind}`)).toEqual([]);
});

test("the scan flags mobile numbers in the common shapes", () => {
  const digits = mobile("98765", "43210");
  for (const shape of [digits, `+91 ${digits}`, `+91-${digits}`, `91${digits}`, `${digits.slice(0, 5)} ${digits.slice(5)}`]) {
    expect(scanText("a.txt", `call ${shape} now`, allow)).toEqual([{ path: "a.txt", line: 1, kind: "phone" }]);
  }
});

test("the scan leaves fictional numbers, ids, coordinates and timestamps alone", () => {
  for (const text of [
    "555-0101",
    "+91 555 0101",
    "1234567890",
    "id 18765432109876",
    "lat 17.3850001234",
    "abc_9876543210_x",
    "1700000000000",
  ]) {
    expect(scanText("a.txt", text, allow)).toEqual([]);
  }
});

test("the scan flags non-example emails and reports the line, not the value", () => {
  const text = `line one\nwrite to ${["someone", "gmail.com"].join("@")} please`;
  expect(scanText("a.txt", text, allow)).toEqual([{ path: "a.txt", line: 2, kind: "email" }]);
});

test("the scan allows example addresses, file names with @ and the published takedown address", () => {
  const text = `ana@example.com sprite@2x.png ${TAKEDOWN_EMAIL}`;
  expect(scanText("a.txt", text, allow)).toEqual([]);
});
