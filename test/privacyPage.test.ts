import { describe, expect, test } from "bun:test";
import { NOTICE_PARAGRAPHS, NOTICE_TEXT, NOTICE_VERSION } from "@turnout/contract/app/notice";
import { openDb } from "../src/utils/openDb.js";
import { siteResponse } from "../src/web/index.js";
import { BASE, testApp } from "./appHelpers.js";

const GRIEVANCE = { name: "A. Officer", address: "1 Example Road", email: "grievance@example.com", phone: "+1 202 555 0100" };
const page = async (options?: Parameters<typeof siteResponse>[3]) => {
  const response = siteResponse(openDb(":memory:"), new Request("http://localhost/privacy"), () => new Date(), options);
  return { response, html: await response.text() };
};
// The page escapes quotes and angle brackets, so compare against the text as a browser would show it.
const plain = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

describe("/privacy and the notice", () => {
  test("the page carries the version, every paragraph and the grievance block", async () => {
    const { response, html } = await page({ grievance: GRIEVANCE });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const shown = plain(html);
    expect(shown).toContain(NOTICE_VERSION);
    for (const paragraph of NOTICE_PARAGRAPHS) expect(shown).toContain(paragraph);
    for (const value of Object.values(GRIEVANCE)) expect(shown).toContain(value);
    expect(html).toContain("mailto:grievance@example.com");
  });

  test("without settings the page says the details are not set", async () => {
    const { html } = await page();
    expect(html).toContain("Details not set");
  });

  test("a trailing slash works and the notice is only at the one path", async () => {
    const response = siteResponse(openDb(":memory:"), new Request("http://localhost/privacy/"));
    expect(response.status).toBe(200);
    expect(siteResponse(openDb(":memory:"), new Request("http://localhost/privacy/extra")).status).toBe(404);
  });

  test("the version is a date and the text names what is kept, who sees it, WhatsApp and the ban hash", () => {
    expect(NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const phrase of [
      "phone number",
      "first name",
      "gender",
      "one photo",
      "handle",
      "WhatsApp, a service of Meta",
      "one-way scrambled form of your phone number",
      "delete your account",
      "do not sell your data",
      "grievance officer",
      "30 days after the show",
      "for one year",
    ]) {
      expect(NOTICE_TEXT).toContain(phrase);
    }
  });

  test("the text uses none of the banned words and no em dash", () => {
    expect(NOTICE_TEXT).not.toMatch(/verified|id check|id-checked|kyc|—/i);
  });

  test("docs/privacy-policy.md holds the same version and paragraphs", async () => {
    const doc = await Bun.file(new URL("../docs/privacy-policy.md", import.meta.url)).text();
    expect(doc).toContain(`Version ${NOTICE_VERSION}`);
    for (const paragraph of NOTICE_PARAGRAPHS) expect(doc).toContain(paragraph);
    expect(doc).not.toContain("—");
  });

  test("GET /config serves the same version and text", async () => {
    const t = await testApp();
    const body = (await (await t.call("GET", "/config")).json()) as { notice: { version: string; text: string } };
    expect(body.notice).toEqual({ version: NOTICE_VERSION, text: NOTICE_TEXT });
    expect(BASE).toBe("/api/app/v1");
  });
});
