import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NOW, seed } from "../e2e/server.js";
import { appLinksFromEnv } from "../src/web/appLinks.js";
import { siteResponse } from "../src/web/index.js";

/** A16: the "Go with a group" link on eligible event pages only, and the page it lands on without the app. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydsocial-go-"));
const file = path.join(dir, "fixture.sqlite");
seed(file);
const db = new Database(file, { readonly: true, strict: true });
afterAll(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const HOST = { APP_LINKS_HOST: "go.example.com" };
const PLAY = "https://play.google.com/store/apps/details?id=com.turnout.app";
const html = (route: string, env: Record<string, string> = HOST, supportEmail = "help@example.com", at = NOW) => {
  const response = siteResponse(db, new Request(`http://localhost${route}`), () => at, { appLinks: appLinksFromEnv(env), supportEmail });
  return { status: response.status, text: response.text() };
};
const BLURB = "Meet 3 to 5 others with tickets at a cafe nearby, an hour before.";

describe("the event page", () => {
  // e1 is music at 499 rupees with a placed venue, 30 hours out; e2 has no price; e3 is free; e7 is a sport.
  test("an eligible event has the link to the go host with src=web and the one-line promise", async () => {
    const page = await html("/e/e1").text;
    expect(page).toContain('href="https://go.example.com/e/e1/go?src=web"');
    expect(page).toContain("Go with a group");
    expect(page).toContain(BLURB);
  });

  test("an event with no price, a free event and a sport have no link", async () => {
    for (const id of ["e2", "e3", "e7"]) {
      const page = await html(`/e/${id}`).text;
      expect(page).not.toContain("Go with a group");
      expect(page).not.toContain("/go?src=web");
    }
  });

  test("an event inside the last 24 hours has no link", async () => {
    const late = new Date(NOW.getTime() + 10 * 3_600_000);
    expect(await html("/e/e1", HOST, "help@example.com", late).text).not.toContain("Go with a group");
  });

  test("without a go host there is no link, so it never points at nothing", async () => {
    expect(await html("/e/e1", {}).text).not.toContain("Go with a group");
  });

  test("the link is the page's one secondary action for groups: View source stays the primary button", async () => {
    const page = await html("/e/e1").text;
    expect(page).toMatch(/<a class="button secondary" href="https:\/\/go\.example\.com\/e\/e1\/go\?src=web"/);
    expect(page.match(/button primary/g)).toHaveLength(1);
  });
});

describe("/e/<id>/go", () => {
  test("before the app is public: the title, one sentence, the testing line with a contact link and a way back, and no store badge", async () => {
    const { status, text } = html("/e/e1/go");
    expect(status).toBe(200);
    const page = await text;
    expect(page).toContain("<h1>Jazz night</h1>");
    expect(page).toContain("Go with a group is in the Turnout app.");
    expect(page).toContain("The app is in testing on Android.");
    expect(page).toContain('href="mailto:help@example.com"');
    expect(page).toContain('href="/e/e1"');
    expect(page).not.toContain("Google Play");
    expect(page).not.toMatch(/App Store|apps\.apple\.com/);
  });

  test("once the app is public: the Play link replaces the testing line", async () => {
    const page = await html("/e/e1/go", { ...HOST, PLAY_STORE_URL: PLAY }).text;
    expect(page).toContain(`href="${PLAY}"`);
    expect(page).toContain("Get it on Google Play");
    expect(page).not.toContain("in testing");
    expect(page).not.toMatch(/App Store|apps\.apple\.com/);
  });

  test("an event that does not exist is the site's not found page", async () => {
    const { status, text } = html("/e/nope/go");
    expect(status).toBe(404);
    expect(await text).toContain("No event at this URL.");
  });

  test("a trailing slash is the same page", () => {
    expect(html("/e/e1/go/").status).toBe(200);
  });
});
