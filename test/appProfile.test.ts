import { describe, expect, test } from "bun:test";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { meResponseSchema, photoResponseSchema } from "@turnout/contract/app/me";
import { normalizeHandle } from "@turnout/contract/profile";
import { sniffImage } from "../src/app-api/upload.js";
import { BASE, PHONES, type TestApp, testApp } from "./appHelpers.js";
import { containsBytes, GPS_MARKER, jpegMarkers, makeHugePng, makePng, withExif } from "./imageFixtures.js";

const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;

async function signedIn(options?: Parameters<typeof testApp>[0]) {
  const t = await testApp(options);
  const tokens = await t.signIn(PHONES[0] as string);
  return { t, token: tokens.accessToken };
}

const me = async (t: TestApp, token: string) => meResponseSchema.parse(await (await t.call("GET", "/me", { token })).json());

const setProfile = (t: TestApp, token: string, body: unknown = { firstName: "Asha", gender: "woman", groupPref: "open" }) =>
  t.call("PATCH", "/me/profile", { token, body });

async function uploadJpeg(t: TestApp, token: string, bytes?: Uint8Array) {
  const picture = bytes ?? (await new Bun.Image(makePng(64, 48)).jpeg({ quality: 80 }).bytes());
  return t.call("PUT", "/me/photo", { token, rawBody: picture, headers: { "content-type": "image/jpeg" } });
}

/** The stored bytes a signed link points at, fetched through the files route. */
async function fetchLink(t: TestApp, url: string): Promise<Response> {
  return t.call("GET", url.replace(BASE, ""));
}

describe("PATCH /me/profile", () => {
  test("saves the name, gender and group type, and trims the name", async () => {
    const { t, token } = await signedIn();
    const response = await setProfile(t, token, { firstName: "  Asha  ", gender: "woman", groupPref: "women_only" });
    expect(response.status).toBe(200);
    const body = meResponseSchema.parse(await response.json());
    expect(body.profile).toMatchObject({ firstName: "Asha", gender: "woman", groupPref: "women_only" });
    expect(body.matchable.missing).toEqual(["photo", "handle"]);
  });

  test("a man asking for a women-only group is 400 women_only; a non-binary person may", async () => {
    const { t, token } = await signedIn();
    const refused = await setProfile(t, token, { firstName: "Ravi", gender: "man", groupPref: "women_only" });
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).code).toBe("women_only");
    expect((await setProfile(t, token, { firstName: "Sam", gender: "non_binary", groupPref: "women_only" })).status).toBe(200);
  });

  test("a name over 40 characters, an unknown gender and extra fields are 400", async () => {
    const { t, token } = await signedIn();
    for (const body of [
      { firstName: "x".repeat(41), gender: "woman", groupPref: "open" },
      { firstName: "Asha", gender: "other", groupPref: "open" },
      { firstName: "Asha", gender: "woman", groupPref: "open", status: "active" },
    ]) {
      expect((await setProfile(t, token, body)).status).toBe(400);
    }
  });
});

describe("PUT /me/handle", () => {
  test("a pasted link becomes the bare handle and waits for review", async () => {
    const { t, token } = await signedIn();
    const response = await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: "instagram.com/some.name/?hl=en" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "pending" });
    const body = await me(t, token);
    expect(body.handle).toEqual({ state: "pending", kind: "instagram", handle: "some.name", rejectReason: null });
  });

  test("normalizeHandle covers the usual spellings", () => {
    expect(normalizeHandle("instagram", "instagram.com/some.name/?hl=en")).toBe("some.name");
    expect(normalizeHandle("instagram", "https://www.instagram.com/Some.Name/")).toBe("some.name");
    expect(normalizeHandle("instagram", "@Some_Name")).toBe("some_name");
    expect(normalizeHandle("instagram", "instagram.com/p/abc")).toBeNull();
    expect(normalizeHandle("instagram", "two words")).toBeNull();
    expect(normalizeHandle("linkedin", "https://www.linkedin.com/in/some-name-123/?trk=x")).toBe("some-name-123");
    expect(normalizeHandle("linkedin", "ab")).toBeNull();
  });

  test("a bad handle is 400 bad_handle", async () => {
    const { t, token } = await signedIn();
    const response = await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: "not a handle!" } });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("bad_handle");
  });

  test("a rejected handle can be sent again and goes back to pending", async () => {
    const { t, token } = await signedIn();
    await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: "first.try" } });
    t.db.query("UPDATE social_handle SET status = 'rejected', reject_reason = 'not_found'").run();
    expect((await me(t, token)).handle).toMatchObject({ state: "rejected", rejectReason: "not_found" });
    await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: "second.try" } });
    expect((await me(t, token)).handle).toEqual({ state: "pending", kind: "instagram", handle: "second.try", rejectReason: null });
  });

  test("the 4th change in an IST day is 429", async () => {
    const { t, token } = await signedIn();
    for (let i = 0; i < 3; i++)
      expect((await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: `name${i}` } })).status).toBe(200);
    const fourth = await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: "name9" } });
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get("retry-after")).toBe(String(12.5 * 3600));
    expect((await me(t, token)).handle.handle).toBe("name2");
  });

  test("it is locked with 409 handle_locked while the member is in a locked group", async () => {
    const { t, token } = await signedIn();
    const put = (handle: string) => t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle } });
    expect((await put("free.to.change")).status).toBe(200);
    const stamp = t.clock().toISOString();
    const memberId = (t.db.query("SELECT id FROM member").get() as { id: string }).id;
    t.db
      .query(
        "INSERT INTO venue (id, name, name_key, geocode_state, created_at, updated_at) VALUES ('v1', 'Hall', 'hall', 'resolved', ?, ?)",
      )
      .run(stamp, stamp);
    t.db
      .query(
        `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, time_kind, venue_id, venue_name, category, source_url, content_hash,
           first_seen_at, last_seen_at, last_seen_run_id, updated_at)
         VALUES ('e1', 'e1', '0', 'A show', '2026-11-20T14:00:00.000Z', 'timed', 'v1', 'Hall', 'comedy', 'https://example.test/x', 'h', ?, ?, 'run', ?)`,
      )
      .run(stamp, stamp, stamp);
    t.db
      .query(
        `INSERT INTO plan (id, member_id, event_id, dedupe_key, group_type, state, show_title, show_starts_at, venue_name, created_at, updated_at)
         VALUES ('p1', ?, 'e1', 'e1', 'open', 'group_confirmed', 'A show', '2026-11-20T14:00:00.000Z', 'Hall', ?, ?)`,
      )
      .run(memberId, stamp, stamp);
    t.db
      .query(
        "INSERT INTO show_group (id, event_id, starts_at, group_type, created_at, updated_at) VALUES ('g1', 'e1', '2026-11-20T14:00:00.000Z', 'open', ?, ?)",
      )
      .run(stamp, stamp);
    t.db
      .query("INSERT INTO group_member (id, group_id, member_id, plan_id, member_ref, joined_at) VALUES ('gm1', 'g1', ?, 'p1', 'r1', ?)")
      .run(memberId, stamp);
    const locked = await put("changed.mind");
    expect(locked.status).toBe(409);
    expect((await errorOf(locked)).code).toBe("handle_locked");
    expect((await me(t, token)).handle.handle).toBe("free.to.change");
    t.db.query("UPDATE show_group SET state = 'done' WHERE id = 'g1'").run();
    expect((await put("changed.mind")).status).toBe(200);
  });
});

describe("PUT /me/photo", () => {
  test("a JPEG is re-encoded, stored under an opaque key, linked with a signed URL, and the link serves the picture", async () => {
    const { t, token } = await signedIn();
    const response = await uploadJpeg(t, token);
    expect(response.status).toBe(200);
    const { photo } = photoResponseSchema.parse(await response.json());
    expect(photo.url.startsWith(`${BASE}/files/photos/`)).toBe(true);
    expect(photo.url).toMatch(/\?exp=\d+&sig=[\w-]+$/);
    expect(photo.expiresAt).toBe("2026-10-27T06:05:00.000Z");
    const file = await fetchLink(t, photo.url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(await new Bun.Image(bytes).metadata()).toMatchObject({ format: "jpeg", width: 64, height: 48 });
    expect((await me(t, token)).profile.photo).not.toBeNull();
  });

  test("GPS and every other EXIF field are gone from what is stored", async () => {
    const { t, token } = await signedIn();
    const plain = await new Bun.Image(makePng(64, 48)).jpeg({ quality: 80 }).bytes();
    const tagged = withExif(plain);
    expect(jpegMarkers(tagged)).toContain(0xe1);
    expect(containsBytes(tagged, Buffer.from("Exif\0\0", "binary"))).toBe(true);
    const { photo } = photoResponseSchema.parse(await (await uploadJpeg(t, token, tagged)).json());
    const stored = new Uint8Array(await (await fetchLink(t, photo.url)).arrayBuffer());
    expect(jpegMarkers(stored)).not.toContain(0xe1);
    expect(containsBytes(stored, Buffer.from("Exif\0\0", "binary"))).toBe(false);
    const gps = Buffer.alloc(24);
    GPS_MARKER.forEach((value, index) => {
      gps.writeUInt32LE(value, index * 8);
      gps.writeUInt32LE(1, index * 8 + 4);
    });
    expect(containsBytes(stored, gps)).toBe(false);
  });

  test("a picture taken sideways (EXIF orientation 6) is turned upright", async () => {
    const { t, token } = await signedIn();
    const plain = await new Bun.Image(makePng(40, 20)).jpeg({ quality: 80 }).bytes();
    const { photo } = photoResponseSchema.parse(await (await uploadJpeg(t, token, withExif(plain, 6))).json());
    const stored = new Uint8Array(await (await fetchLink(t, photo.url)).arrayBuffer());
    expect(await new Bun.Image(stored).metadata()).toMatchObject({ width: 20, height: 40 });
  });

  test("a PNG is accepted and a large picture is cut to 1080 px on its long side", async () => {
    const { t, token } = await signedIn();
    const response = await t.call("PUT", "/me/photo", { token, rawBody: makePng(2000, 1500) });
    expect(response.status).toBe(200);
    const { photo } = photoResponseSchema.parse(await response.json());
    const stored = new Uint8Array(await (await fetchLink(t, photo.url)).arrayBuffer());
    expect(await new Bun.Image(stored).metadata()).toMatchObject({ format: "jpeg", width: 1080, height: 810 });
  });

  test("the stored key is photos/<ulid>.jpg: no member id, and a different key for each upload", async () => {
    const { t, token } = await signedIn();
    const memberId = (t.db.query("SELECT id FROM member").get() as { id: string }).id;
    await uploadJpeg(t, token);
    t.clock.advance(1000);
    await uploadJpeg(t, token);
    const key = (t.db.query("SELECT photo_key FROM profile").get() as { photo_key: string }).photo_key;
    expect(key).toMatch(/^photos\/[0-9a-z]{26}\.jpg$/);
    expect(key).not.toContain(memberId.toLowerCase());
    const { photo } = photoResponseSchema.parse(await (await t.call("GET", "/me/photo", { token })).json());
    expect(photo.url).not.toContain(memberId.toLowerCase());
  });

  test("a picture over 40 megapixels is 413 file_too_large from its header, before any decode, and nothing is stored", async () => {
    const { t, token } = await signedIn();
    const huge = makeHugePng(8000, 5001);
    expect(huge.length).toBeLessThan(200);
    const response = await t.call("PUT", "/me/photo", { token, rawBody: huge });
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("file_too_large");
    expect((await t.app.store.list("photos/")).length).toBe(0);
    // Exactly 40 megapixels passes the size check; the empty pixel data then fails to decode, which is a 400 and not a 413.
    const edge = await t.call("PUT", "/me/photo", { token, rawBody: makeHugePng(8000, 5000) });
    expect(edge.status).toBe(400);
    expect((await errorOf(edge)).code).toBe("unsupported_type");
  });

  test("the limit is 10 uploads per member per IST day, then 429 with Retry-After, and a new day starts fresh", async () => {
    const { t, token } = await signedIn();
    const limit = t.app.config.tunables.rate.photoUploadPerMemberDay.limit;
    expect(limit).toBe(10);
    for (let i = 0; i < limit; i++) expect((await uploadJpeg(t, token)).status).toBe(200);
    const refused = await uploadJpeg(t, token);
    expect(refused.status).toBe(429);
    expect((await errorOf(refused)).code).toBe("rate_limited");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another member is not held back by this one.
    const other = await t.signIn(PHONES[1] as string);
    expect((await uploadJpeg(t, other.accessToken)).status).toBe(200);
    t.clock.advance(24 * 60 * 60 * 1000);
    const nextDay = await t.signIn(PHONES[0] as string);
    expect((await uploadJpeg(t, nextDay.accessToken)).status).toBe(200);
  });

  test("a PDF renamed .jpg is 400 unsupported_type and nothing is stored", async () => {
    const { t, token } = await signedIn();
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
    const response = await t.call("PUT", "/me/photo", {
      token,
      rawBody: pdf,
      headers: { "content-type": "image/jpeg", "x-file-name": "me.jpg" },
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("unsupported_type");
    expect((await t.app.store.list("photos/")).length).toBe(0);
    expect((await me(t, token)).profile.photo).toBeNull();
  });

  test("a file with a JPEG start and junk after it is 400, not a 500", async () => {
    const { t, token } = await signedIn();
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("this is not a picture")]);
    const response = await t.call("PUT", "/me/photo", { token, rawBody: junk });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("unsupported_type");
  });

  test("an 11 MB body is refused 413 before it is fully read", async () => {
    const { t, token } = await signedIn();
    // With a declared length: refused without touching the body.
    const declared = await t.call("PUT", "/me/photo", { token, rawBody: new Uint8Array(11 * 1024 * 1024) });
    expect(declared.status).toBe(413);
    expect((await errorOf(declared)).code).toBe("file_too_large");
    // Without a length: counted as it streams, and the stream is cancelled at the limit.
    let sent = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
        if (sent >= 50 * chunk.length) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const streamed = await t.app.store.list("photos/");
    expect(streamed.length).toBe(0);
    const response = await t.call("PUT", "/me/photo", { token, rawBody: stream, headers: { "content-type": "application/octet-stream" } });
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(15 * chunk.length);
    expect((await t.app.store.list("photos/")).length).toBe(0);
  });

  test("a new photo replaces the old file and sends an approved handle back to pending", async () => {
    const { t, token } = await signedIn();
    await setProfile(t, token);
    await t.call("PUT", "/me/handle", { token, body: { kind: "instagram", handle: "some.name" } });
    await uploadJpeg(t, token);
    t.db.query("UPDATE social_handle SET status = 'approved', reviewed_at = ?, reviewed_by = 'operator'").run(t.clock().toISOString());
    expect((await me(t, token)).matchable).toEqual({ ok: true, missing: [] });
    const [firstKey] = await t.app.store.list("photos/");
    t.clock.advance(1000);
    await uploadJpeg(t, token);
    const keys = await t.app.store.list("photos/");
    expect(keys).toHaveLength(1);
    expect(keys[0]?.key).not.toBe(firstKey?.key);
    const after = await me(t, token);
    expect(after.handle.state).toBe("pending");
    expect(after.matchable).toEqual({ ok: false, missing: ["handle"] });
  });

  test("GET /me/photo gives a fresh link; 404 with no photo", async () => {
    const { t, token } = await signedIn();
    expect((await t.call("GET", "/me/photo", { token })).status).toBe(404);
    await uploadJpeg(t, token);
    t.clock.advance(4 * 60 * 1000);
    const { photo } = photoResponseSchema.parse(await (await t.call("GET", "/me/photo", { token })).json());
    expect(photo.expiresAt).toBe("2026-10-27T06:09:00.000Z");
  });
});

describe("signed file links", () => {
  async function linkFor() {
    const { t, token } = await signedIn();
    const { photo } = photoResponseSchema.parse(await (await uploadJpeg(t, token)).json());
    return { t, url: photo.url };
  }

  test("a good link works; a tampered signature, key or expiry and an expired link are all the same 404", async () => {
    const { t, url } = await linkFor();
    expect((await fetchLink(t, url)).status).toBe(200);
    const parsed = new URL(url, "http://x");
    const sig = parsed.searchParams.get("sig") as string;
    const exp = Number(parsed.searchParams.get("exp"));
    const tamperedSig = url.replace(sig, `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`);
    const tamperedExp = url.replace(`exp=${exp}`, `exp=${exp + 3600}`);
    const otherKey = url.replace(/photos\/[^/?]+\.jpg/, "photos/someone-else.jpg");
    const noSig = url.split("&sig=")[0] as string;
    const shortSig = url.replace(sig, sig.slice(0, 5));
    for (const bad of [tamperedSig, tamperedExp, otherKey, noSig, shortSig]) {
      const response = await fetchLink(t, bad);
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("not_found");
    }
    t.clock.advance(5 * 60 * 1000 + 1000);
    expect((await fetchLink(t, url)).status).toBe(404);
  });

  test("a path trying to leave the folder is 404", async () => {
    const { t, url } = await linkFor();
    const query = url.slice(url.indexOf("?"));
    for (const path of ["/files/%2e%2e/%2e%2e/etc/passwd", "/files/photos/%2e%2e/%2e%2e/x", "/files/photos%2f..%2fx"]) {
      expect((await t.call("GET", `${path}${query}`)).status).toBe(404);
    }
  });
});

describe("sniffImage", () => {
  test("goes by the first bytes, not the name", () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
    expect(sniffImage(heic)).toBe("heic");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
    expect(sniffImage(makePng(2, 2))).toBe("png");
    expect(sniffImage(Buffer.from("GIF89a......"))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    expect(sniffImage(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)]))).toBeNull();
  });
});
