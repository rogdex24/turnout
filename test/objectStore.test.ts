import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyFromFilePath, signedLinker, signFileLink, verifyFileLink } from "../src/app-api/fileLinks.js";
import { fixedClock } from "../src/utils/clock.js";
import { diskStore, isValidKey, memoryStore, type ObjectStore, s3Store, sweepOrphans } from "../src/utils/objectStore.js";

const SECRET = "test-link-secret-not-a-real-one";
const clock = fixedClock("2026-11-01T10:00:00Z");

/** A tiny S3 look-alike: path-style PUT, GET, HEAD, DELETE and ListObjectsV2. Enough for the store contract. */
function fakeS3() {
  const objects = new Map<string, { bytes: Uint8Array; type: string; modified: Date }>();
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const [, bucket, ...rest] = url.pathname.split("/");
      const key = decodeURIComponent(rest.join("/"));
      if (request.method === "GET" && key === "" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const matching = [...objects].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
        const items = matching
          .map(
            ([k, v]) =>
              `<Contents><Key>${k}</Key><LastModified>${v.modified.toISOString()}</LastModified><Size>${v.bytes.length}</Size></Contents>`,
          )
          .join("");
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${matching.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`;
        return new Response(xml, { headers: { "content-type": "application/xml" } });
      }
      if (request.method === "PUT") {
        objects.set(key, {
          bytes: new Uint8Array(await request.arrayBuffer()),
          type: request.headers.get("content-type") ?? "application/octet-stream",
          modified: new Date(),
        });
        return new Response(null, { status: 200, headers: { etag: '"x"' } });
      }
      const found = objects.get(key);
      if (request.method === "DELETE") {
        objects.delete(key);
        return new Response(null, { status: 204 });
      }
      if (!found) {
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>`, {
          status: 404,
          headers: { "content-type": "application/xml" },
        });
      }
      const headers = {
        "content-type": found.type,
        "content-length": String(found.bytes.length),
        "last-modified": found.modified.toUTCString(),
        etag: '"x"',
      };
      return request.method === "HEAD" ? new Response(null, { headers }) : new Response(Buffer.from(found.bytes), { headers });
    },
  });
  return { server, objects };
}

const dirs: string[] = [];
const s3 = fakeS3();
afterAll(() => {
  s3.server.stop(true);
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const link = { now: clock, link: signedLinker(SECRET, 300, clock) };
const stores: Array<[string, () => ObjectStore]> = [
  ["memory", () => memoryStore(link)],
  [
    "disk",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "turnout-files-"));
      dirs.push(dir);
      return diskStore({ dir, link: link.link });
    },
  ],
  [
    "s3",
    () => {
      s3.objects.clear();
      return s3Store(
        {
          bucket: "turnout-test",
          endpoint: `http://localhost:${s3.server.port}`,
          region: "auto",
          accessKeyId: "test-access-key",
          secretAccessKey: "test-secret-key",
        },
        { ttlSeconds: 300 },
      );
    },
  ],
];

const bytes = (...values: number[]) => new Uint8Array(values);

describe.each(stores)("%s store contract", (_name, make) => {
  test("put then get returns the same bytes", async () => {
    const store = make();
    await store.put("photos/m1/a.jpg", bytes(1, 2, 3), "image/jpeg");
    const found = await store.get("photos/m1/a.jpg");
    expect(found).not.toBeNull();
    expect([...found!.bytes]).toEqual([1, 2, 3]);
    expect(found!.contentType).toBe("image/jpeg");
  });

  test("a missing key is null, and deleting it is fine", async () => {
    const store = make();
    expect(await store.get("photos/m1/none.jpg")).toBeNull();
    await store.delete("photos/m1/none.jpg");
  });

  test("put replaces, delete removes", async () => {
    const store = make();
    await store.put("photos/m1/a.jpg", bytes(1), "image/jpeg");
    await store.put("photos/m1/a.jpg", bytes(9, 9), "image/jpeg");
    expect([...(await store.get("photos/m1/a.jpg"))!.bytes]).toEqual([9, 9]);
    await store.delete("photos/m1/a.jpg");
    expect(await store.get("photos/m1/a.jpg")).toBeNull();
  });

  test("list returns the keys under a prefix, sorted", async () => {
    const store = make();
    await store.put("photos/m2/b.jpg", bytes(1), "image/jpeg");
    await store.put("photos/m1/a.jpg", bytes(1, 2), "image/jpeg");
    await store.put("tickets/p1/t.png", bytes(1, 2, 3), "image/png");
    expect((await store.list("photos/")).map((entry) => entry.key)).toEqual(["photos/m1/a.jpg", "photos/m2/b.jpg"]);
    expect((await store.list("")).map((entry) => entry.key)).toEqual(["photos/m1/a.jpg", "photos/m2/b.jpg", "tickets/p1/t.png"]);
    const entry = (await store.list("tickets/"))[0]!;
    expect(entry.size).toBe(3);
    expect(entry.modifiedAt).toBeGreaterThan(0);
  });

  test("keys that could leave the store are refused", async () => {
    const store = make();
    for (const key of ["../x.jpg", "/abs.jpg", "a/../b.jpg", "a//b.jpg", "A.jpg", "a b.jpg", "", "a.tmp"]) {
      await expect(store.put(key, bytes(1), "image/jpeg")).rejects.toThrow("invalid object key");
    }
  });

  test("linkFor gives a link that names the key", () => {
    const store = make();
    expect(store.linkFor("photos/m1/a.jpg")).toContain("photos/m1/a.jpg");
  });
});

describe("signed links (disk and memory)", () => {
  const key = "photos/m1/a.jpg";
  const now = new Date("2026-11-01T10:00:00Z");
  const url = (path: string) => new URL(`http://localhost${path}`);

  test("a fresh link verifies and carries the key", () => {
    const parsed = url(signFileLink(SECRET, key, now, 300));
    expect(keyFromFilePath(parsed.pathname)).toBe(key);
    expect(verifyFileLink(SECRET, key, parsed.searchParams.get("exp"), parsed.searchParams.get("sig"), now)).toBe(true);
  });

  test("a changed key, a changed expiry, a bad signature or another secret gives false", () => {
    const parsed = url(signFileLink(SECRET, key, now, 300));
    const exp = parsed.searchParams.get("exp");
    const sig = parsed.searchParams.get("sig");
    expect(verifyFileLink(SECRET, "photos/m1/b.jpg", exp, sig, now)).toBe(false);
    expect(verifyFileLink(SECRET, key, String(Number(exp) + 60), sig, now)).toBe(false);
    expect(verifyFileLink(SECRET, key, exp, `${sig}x`, now)).toBe(false);
    expect(verifyFileLink(SECRET, key, exp, "", now)).toBe(false);
    expect(verifyFileLink("another-secret", key, exp, sig, now)).toBe(false);
    expect(verifyFileLink(SECRET, key, null, sig, now)).toBe(false);
    expect(verifyFileLink(SECRET, key, "soon", sig, now)).toBe(false);
  });

  test("a link expires after five minutes, to the second", () => {
    const parsed = url(signFileLink(SECRET, key, now, 300));
    const exp = parsed.searchParams.get("exp");
    const sig = parsed.searchParams.get("sig");
    expect(verifyFileLink(SECRET, key, exp, sig, new Date(now.getTime() + 299_000))).toBe(true);
    expect(verifyFileLink(SECRET, key, exp, sig, new Date(now.getTime() + 300_000))).toBe(false);
  });

  test("paths that are not file keys give null", () => {
    expect(keyFromFilePath("/api/app/v1/me")).toBeNull();
    expect(keyFromFilePath("/api/app/v1/files/../secret")).toBeNull();
    expect(keyFromFilePath("/api/app/v1/files/%2e%2e/secret")).toBeNull();
    expect(keyFromFilePath("/api/app/v1/files/%E0%A4%A")).toBeNull();
    expect(keyFromFilePath("/api/app/v1/files/")).toBeNull();
  });
});

describe("disk store", () => {
  test("files are mode 0600, written through a temp name, and no temp file is left", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turnout-files-"));
    dirs.push(dir);
    const store = diskStore({ dir, link: link.link });
    await store.put("photos/m1/a.jpg", bytes(1, 2, 3), "image/jpeg");
    expect(statSync(join(dir, "photos/m1/a.jpg")).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(dir, "photos/m1"))).toEqual(["a.jpg"]);
  });

  test("a failed write leaves no temp file and the old files alone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turnout-files-"));
    dirs.push(dir);
    const store = diskStore({ dir, link: link.link });
    await store.put("photos/m1/a.jpg", bytes(1), "image/jpeg");
    // A directory sits where the file should go, so the rename fails after the temp write.
    await Bun.$`mkdir -p ${join(dir, "photos/m1/b.jpg")}`;
    await expect(store.put("photos/m1/b.jpg", bytes(2), "image/jpeg")).rejects.toThrow();
    expect(readdirSync(join(dir, "photos/m1")).filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
    expect(existsSync(join(dir, "photos/m1/a.jpg"))).toBe(true);
  });

  test("list skips in-flight temp files and the key stays served as its extension says", async () => {
    const dir = mkdtempSync(join(tmpdir(), "turnout-files-"));
    dirs.push(dir);
    const store = diskStore({ dir, link: link.link });
    await store.put("tickets/p1/t.pdf", bytes(1), "application/pdf");
    await Bun.write(join(dir, "tickets/p1/t.pdf.abc.tmp"), bytes(1));
    expect((await store.list("")).map((entry) => entry.key)).toEqual(["tickets/p1/t.pdf"]);
    expect((await store.get("tickets/p1/t.pdf"))!.contentType).toBe("application/pdf");
  });
});

describe("the nightly sweep", () => {
  let store: ObjectStore;
  const now = new Date("2026-11-01T10:00:00Z");
  beforeAll(() => {
    store = memoryStore({ ...link, now: fixedClock("2026-11-01T06:00:00Z") });
  });

  test("deletes old files no row points at and keeps referenced and recent ones", async () => {
    await store.put("photos/m1/kept.jpg", bytes(1), "image/jpeg");
    await store.put("photos/m1/orphan.jpg", bytes(1), "image/jpeg");
    const recent = memoryStore({ ...link, now: fixedClock("2026-11-01T09:30:00Z") });
    await recent.put("photos/m1/new.jpg", bytes(1), "image/jpeg");

    const removed = await sweepOrphans(store, new Set(["photos/m1/kept.jpg"]), now, ["photos/"]);
    expect(removed).toEqual(["photos/m1/orphan.jpg"]);
    expect((await store.list("")).map((entry) => entry.key)).toEqual(["photos/m1/kept.jpg"]);

    // A file written 30 minutes ago may still be waiting for its row.
    expect(await sweepOrphans(recent, new Set(), now, ["photos/"])).toEqual([]);
    expect(await sweepOrphans(recent, new Set(), new Date("2026-11-01T10:31:00Z"), ["photos/"])).toEqual(["photos/m1/new.jpg"]);
  });

  test("looks only at the listed prefixes, so an object elsewhere in the store is never touched", async () => {
    const mixed = memoryStore({ ...link, now: fixedClock("2026-11-01T06:00:00Z") });
    await mixed.put("photos/a.jpg", bytes(1), "image/jpeg");
    await mixed.put("tickets/p1/t.png", bytes(1), "image/png");
    await mixed.put("exports/all.csv", bytes(1), "text/csv");
    expect(await sweepOrphans(mixed, new Set(), now, ["photos/"])).toEqual(["photos/a.jpg"]);
    expect((await mixed.list("")).map((entry) => entry.key)).toEqual(["exports/all.csv", "tickets/p1/t.png"]);
  });

  test("a key that is not a valid key is skipped, not thrown on, and the rest of the pass still runs", async () => {
    const inner = memoryStore({ ...link, now: fixedClock("2026-11-01T06:00:00Z") });
    await inner.put("photos/old.jpg", bytes(1), "image/jpeg");
    const odd = ["photos/UPPER.JPG", "photos/has space.jpg", "photos/../escape.jpg"];
    const store: ObjectStore = {
      ...inner,
      list: async (prefix) => [...odd.map((key) => ({ key, size: 1, modifiedAt: 0 })), ...(await inner.list(prefix))],
      delete: async (key) => {
        if (!isValidKey(key)) throw new Error(`invalid object key: ${key}`);
        await inner.delete(key);
      },
    };
    expect(await sweepOrphans(store, new Set(), now, ["photos/"])).toEqual(["photos/old.jpg"]);
  });
});
