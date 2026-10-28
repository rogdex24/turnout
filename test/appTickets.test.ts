import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { planSchema } from "@turnout/contract/app/plans";
import { MAX_TICKET_BYTES } from "@turnout/contract/ticket";
import { rejectTicket } from "../src/social/operator.js";
import { type TestApp, testApp } from "./appHelpers.js";
import { cleanPdf, cleanPng, encryptedPdf, largePng, oversizedFile, pdfWithOpenAction, zipRenamedPdf } from "./fixtures/tickets/index.js";
import { makePlan, memberSession, type Session } from "./helpers/appFixture.js";
import { SHOW_START, seedShow } from "./helpers/socialFixture.js";
import { containsBytes, GPS_MARKER, jpegMarkers, withExif } from "./imageFixtures.js";

const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;
const HOUR = 3_600_000;
const EXIF_HEADER = Buffer.from("Exif\0\0", "binary");

async function setup(show: { source?: string } = {}) {
  const t = await testApp();
  seedShow(t.db, { id: "show-a", ...show });
  const a = await memberSession(t, 0);
  return { t, a, plan: await makePlan(t, a, "show-a") };
}

const put = (t: TestApp, who: Session, planId: string, bytes: Uint8Array) =>
  t.call("PUT", `/plans/${planId}/ticket`, { token: who.token, rawBody: bytes });

const tickets = (t: TestApp) =>
  t.db.query("SELECT id, object_key, mime, bytes, sha256, status FROM ticket_proof ORDER BY uploaded_at, id").all() as {
    id: string;
    object_key: string | null;
    mime: string;
    bytes: number;
    sha256: string | null;
    status: string;
  }[];

describe("PUT /plans/:planId/ticket", () => {
  test("a screenshot is stored as a smaller JPEG with no position in it, and the plan moves to checking_ticket", async () => {
    const { t, a, plan } = await setup();
    const picture = withExif(await new Bun.Image(largePng()).jpeg({ quality: 90 }).bytes());
    expect(containsBytes(picture, EXIF_HEADER)).toBe(true);
    const response = await put(t, a, plan.id, picture);
    expect(response.status).toBe(200);
    expect(planSchema.parse(await response.json())).toMatchObject({
      id: plan.id,
      state: "checking_ticket",
      ticket: { state: "pending", rejectReason: null },
    });
    const [row] = tickets(t);
    expect(row).toMatchObject({ mime: "image/jpeg", status: "pending" });
    const stored = await t.app.store.get(row?.object_key as string);
    expect(stored?.contentType).toBe("image/jpeg");
    const bytes = stored?.bytes as Uint8Array;
    expect(jpegMarkers(bytes)).not.toContain(0xe1);
    expect(containsBytes(bytes, EXIF_HEADER)).toBe(false);
    const gps = Buffer.alloc(24);
    GPS_MARKER.forEach((value, index) => {
      gps.writeUInt32LE(value, index * 8);
      gps.writeUInt32LE(1, index * 8 + 4);
    });
    expect(containsBytes(bytes, gps)).toBe(false);
    const size = await new Bun.Image(bytes).metadata();
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(2000);
    expect(row?.object_key).toMatch(/^tickets\/[0-9a-z]+\.jpg$/);
  });

  test("a PNG and a clean PDF are taken for a show that takes a PDF, and the PDF is stored as sent", async () => {
    const { t, a, plan } = await setup();
    expect((await put(t, a, plan.id, cleanPng())).status).toBe(200);
    // The plan is checking now, so make a second member's plan for the PDF.
    const b = await memberSession(t, 1);
    const other = await makePlan(t, b, "show-a");
    const pdf = cleanPdf();
    expect((await put(t, b, other.id, pdf)).status).toBe(200);
    const row = tickets(t).find((r) => r.mime === "application/pdf");
    expect(row?.object_key).toMatch(/\.pdf$/);
    expect(Buffer.from((await t.app.store.get(row?.object_key as string))?.bytes as Uint8Array).equals(pdf)).toBe(true);
  });

  test("a PDF for a BookMyShow show is 400 screenshot_required", async () => {
    const { t, a, plan } = await setup({ source: "bookmyshow" });
    const response = await put(t, a, plan.id, cleanPdf());
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("screenshot_required");
    expect(tickets(t)).toEqual([]);
  });

  test("a PDF with active content, an encrypted one and a renamed zip are refused and nothing is stored", async () => {
    const { t, a, plan } = await setup();
    for (const [bytes, code] of [
      [pdfWithOpenAction(), "bad_ticket"],
      [encryptedPdf(), "bad_ticket"],
      [zipRenamedPdf(), "unsupported_type"],
    ] as const) {
      const response = await put(t, a, plan.id, bytes);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe(code);
    }
    expect(tickets(t)).toEqual([]);
    expect(await t.app.store.list("tickets/")).toEqual([]);
  });

  test("an empty body is 400, a file over the limit is 413 file_too_large, and a type that is not a picture is 400", async () => {
    const { t, a, plan } = await setup();
    expect((await put(t, a, plan.id, new Uint8Array(0))).status).toBe(400);
    const big = await put(t, a, plan.id, oversizedFile(MAX_TICKET_BYTES));
    expect(big.status).toBe(413);
    expect((await errorOf(big)).code).toBe("file_too_large");
    const text = await put(t, a, plan.id, new TextEncoder().encode("not a ticket"));
    expect(text.status).toBe(400);
    expect((await errorOf(text)).code).toBe("unsupported_type");
  });

  test("another member's plan is 404 and nothing is stored", async () => {
    const { t, plan } = await setup();
    const b = await memberSession(t, 1);
    expect((await put(t, b, plan.id, cleanPng())).status).toBe(404);
    expect((await put(t, b, "01hzzzzzzzzzzzzzzzzzzzzzzz", cleanPng())).status).toBe(404);
    expect(tickets(t)).toEqual([]);
  });

  test("from T-24h it is 409 too_late", async () => {
    const { t, a, plan } = await setup();
    t.clock.set(new Date(Date.parse(SHOW_START) - 24 * HOUR));
    const token = (await t.signIn(a.phone)).accessToken;
    const response = await put(t, { ...a, token }, plan.id, cleanPng());
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("too_late");
    expect(tickets(t)).toEqual([]);
  });

  test("the same file sent again while it is being checked is the same answer, not a second ticket", async () => {
    const { t, a, plan } = await setup();
    const file = cleanPng();
    const first = planSchema.parse(await (await put(t, a, plan.id, file)).json());
    const retry = await put(t, a, plan.id, file);
    expect(retry.status).toBe(200);
    expect(planSchema.parse(await retry.json())).toEqual(first);
    expect(tickets(t)).toHaveLength(1);
  });

  test("a different file while one is being checked is 409 plan_closed", async () => {
    const { t, a, plan } = await setup();
    await put(t, a, plan.id, cleanPng());
    const other = await new Bun.Image(largePng()).jpeg({ quality: 70 }).bytes();
    const response = await put(t, a, plan.id, other);
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("plan_closed");
    expect(tickets(t)).toHaveLength(1);
    expect(await t.app.store.list("tickets/")).toHaveLength(1);
  });

  test("after a rejection a new file goes back to checking, and the old file is superseded", async () => {
    const { t, a, plan } = await setup();
    await put(t, a, plan.id, cleanPng());
    const [first] = tickets(t);
    expect(rejectTicket(t.db, first?.id as string, "unreadable", t.clock()).ok).toBe(true);
    const rejected = planSchema.parse(await (await t.call("GET", `/plans/${plan.id}`, { token: a.token })).json());
    expect(rejected).toMatchObject({ state: "ticket_rejected", ticket: { state: "rejected", rejectReason: "unreadable" } });
    const again = await put(t, a, plan.id, await new Bun.Image(largePng()).jpeg({ quality: 70 }).bytes());
    expect(again.status).toBe(200);
    expect(planSchema.parse(await again.json())).toMatchObject({ state: "checking_ticket", ticket: { state: "pending" } });
    expect(tickets(t)).toHaveLength(2);
  });

  test("five files an hour for a plan, then 429; bad files do not count", async () => {
    const { t, a, plan } = await setup();
    for (let i = 0; i < 3; i++) expect((await put(t, a, plan.id, new TextEncoder().encode("x"))).status).toBe(400);
    for (let i = 0; i < 5; i++) {
      const file = await new Bun.Image(largePng()).jpeg({ quality: 50 + i }).bytes();
      expect((await put(t, a, plan.id, file)).status).toBe(200);
      rejectTicket(t.db, tickets(t).at(-1)?.id as string, "unreadable", t.clock());
    }
    const sixth = await put(t, a, plan.id, await new Bun.Image(largePng()).jpeg({ quality: 40 }).bytes());
    expect(sixth.status).toBe(429);
    expect((await errorOf(sixth)).code).toBe("rate_limited");
    expect(tickets(t)).toHaveLength(5);
  });

  test("twenty files a day for a member across plans, then 429", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    let quality = 30;
    for (let n = 0; n < 4; n++) {
      seedShow(t.db, { id: `show-${n}` });
      const plan = await makePlan(t, a, `show-${n}`);
      for (let i = 0; i < 5; i++) {
        const file = await new Bun.Image(largePng()).jpeg({ quality: quality++ }).bytes();
        expect((await put(t, a, plan.id, file)).status).toBe(200);
        rejectTicket(t.db, tickets(t).at(-1)?.id as string, "unreadable", t.clock());
      }
      expect((await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token })).status).toBe(200);
    }
    seedShow(t.db, { id: "show-last" });
    const plan = await makePlan(t, a, "show-last");
    const response = await put(t, a, plan.id, await new Bun.Image(largePng()).jpeg({ quality: 99 }).bytes());
    expect(response.status).toBe(429);
    expect(tickets(t)).toHaveLength(20);
  });

  test("no response, to anyone, holds a ticket key, a ticket link or the file", async () => {
    const { t, a, plan } = await setup();
    const sent = await put(t, a, plan.id, cleanPng());
    const [row] = tickets(t);
    const key = row?.object_key as string;
    const texts = [
      await sent.text(),
      await (await t.call("GET", `/plans/${plan.id}`, { token: a.token })).text(),
      await (await t.call("GET", "/plans", { token: a.token })).text(),
      await (await t.call("GET", "/shows/show-a", { token: a.token })).text(),
    ];
    for (const text of texts) {
      expect(text).not.toContain("tickets/");
      expect(text).not.toContain(key.slice("tickets/".length));
    }
  });

  test("even a correctly signed link to a ticket key is the same 404 from the files route", async () => {
    const { t, a, plan } = await setup();
    await put(t, a, plan.id, cleanPng());
    const key = tickets(t)[0]?.object_key as string;
    const link = t.app.store.linkFor(key);
    expect(link).toContain(key);
    const served = await t.call("GET", link.replace("/api/app/v1", ""));
    expect(served.status).toBe(404);
    const missing = await t.call("GET", "/files/photos/nothing.jpg");
    expect(await served.json()).toEqual(await missing.json());
  });
});
