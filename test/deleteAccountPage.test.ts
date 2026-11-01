import { describe, expect, test } from "bun:test";
import { DELETION_ERASED, DELETION_KEPT } from "@turnout/contract/app/deletion";
import { deleteAccount } from "../apps/mobile/src/copy/deleteAccount.js";
import { nav } from "../apps/mobile/src/copy/nav.js";
import { you } from "../apps/mobile/src/copy/you.js";
import { openDb } from "../src/utils/openDb.js";
import { siteResponse } from "../src/web/index.js";

const GRIEVANCE = { name: "A. Officer", address: "1 Example Road", email: "grievance@example.com", phone: "+1 202 555 0100" };
const get = (path: string, options?: Parameters<typeof siteResponse>[3]) =>
  siteResponse(openDb(":memory:"), new Request(`http://localhost${path}`), () => new Date(), options);
// The page escapes quotes, so compare against the text as a browser would show it.
const plain = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

describe("/delete-account, the store deletion URL", () => {
  test("the page lists what is deleted and what is kept, word for word as the app shows it, and the contact", async () => {
    const response = get("/delete-account", { grievance: GRIEVANCE });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const shown = plain(await response.text());
    for (const item of [...DELETION_ERASED, ...DELETION_KEPT]) expect(shown).toContain(item);
    expect(shown).toContain("mailto:grievance@example.com");
    expect(shown).toContain('href="/privacy"');
    expect(shown).not.toContain("—");
  });

  test("the steps name the app's own tab and buttons, so the page cannot drift from the app", async () => {
    const shown = plain(await get("/delete-account").text());
    expect(shown).toContain(`the ${nav.tabs.you} tab`);
    expect(shown).toContain(`Tap ${you.deleteAccount}`);
    expect(shown).toContain(`Tap ${deleteAccount.confirm.send}`);
    expect(shown).toContain("the same deletion as in the app");
  });

  test("without settings the contact says the details are not set, and only the one path answers", async () => {
    expect(await get("/delete-account").text()).toContain("Details not set");
    expect(get("/delete-account/").status).toBe(200);
    expect(get("/delete-account/extra").status).toBe(404);
  });
});
