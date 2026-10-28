import { mkdirSync } from "node:fs";
import { readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Clock } from "./clock.js";

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface StoredEntry {
  key: string;
  size: number;
  /** Epoch milliseconds of the last write. The sweep leaves recent files alone. */
  modifiedAt: number;
}

/**
 * Where photos and ticket proofs live. Rows keep the key, never a URL. `linkFor` makes a short-lived
 * link to one object; everything else is plain put/get/delete/list.
 */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** null when there is no such object. */
  get(key: string): Promise<StoredObject | null>;
  /** Deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StoredEntry[]>;
  linkFor(key: string): string;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  pdf: "application/pdf",
};

/** The content type a key's extension stands for. Anything else is served as opaque bytes. */
export function contentTypeForKey(key: string): string {
  const extension = key.split(".").pop() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]*(?:\/[a-z0-9][a-z0-9_.-]*)*$/;

/** Keys are lower-case path-like names. No leading slash, no dot segments, nothing that can leave the store's root. `.tmp` is the disk store's in-flight suffix. */
export function isValidKey(key: string): boolean {
  return key.length > 0 && key.length <= 200 && KEY_PATTERN.test(key) && !key.includes("..") && !key.endsWith(".tmp");
}

function checkKey(key: string): void {
  if (!isValidKey(key)) throw new Error(`invalid object key: ${key}`);
}

export interface LocalStoreOptions {
  now: Clock;
  /** Makes the link for a key. The app API passes a signer for its files route (`fileLinks.ts`). */
  link: (key: string) => string;
}

/** Everything in memory. For tests and the staging fake; nothing survives a restart. */
export function memoryStore({ now, link }: LocalStoreOptions): ObjectStore {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string; modifiedAt: number }>();
  return {
    async put(key, bytes, contentType) {
      checkKey(key);
      objects.set(key, { bytes: new Uint8Array(bytes), contentType, modifiedAt: now().getTime() });
    },
    async get(key) {
      checkKey(key);
      const found = objects.get(key);
      return found ? { bytes: new Uint8Array(found.bytes), contentType: found.contentType } : null;
    },
    async delete(key) {
      checkKey(key);
      objects.delete(key);
    },
    async list(prefix) {
      return [...objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, size: value.bytes.length, modifiedAt: value.modifiedAt }))
        .sort((a, b) => a.key.localeCompare(b.key));
    },
    linkFor(key) {
      checkKey(key);
      return link(key);
    },
  };
}

/** Files under one directory on the server's disk: written to a temp name, then renamed, mode 0600. */
export function diskStore({ dir, link }: Pick<LocalStoreOptions, "link"> & { dir: string }): ObjectStore {
  const pathFor = (key: string) => {
    checkKey(key);
    return join(dir, key);
  };
  // The store only ever writes valid keys, so a stray name (a temp file, a hand-placed file) is skipped on listing.
  const isTemp = (name: string) => name.endsWith(".tmp");

  async function walk(directory: string, relative: string, out: StoredEntry[]): Promise<void> {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return;
    }
    for (const name of names) {
      const key = relative ? `${relative}/${name}` : name;
      const info = await stat(join(directory, name));
      if (info.isDirectory()) await walk(join(directory, name), key, out);
      else if (!isTemp(name) && isValidKey(key)) out.push({ key, size: info.size, modifiedAt: info.mtimeMs });
    }
  }

  return {
    async put(key, bytes, _contentType) {
      const target = pathFor(key);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      const temp = `${target}.${crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temp, bytes, { mode: 0o600 });
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },
    async get(key) {
      const file = Bun.file(pathFor(key));
      if (!(await file.exists())) return null;
      return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: contentTypeForKey(key) };
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    async list(prefix) {
      const out: StoredEntry[] = [];
      await walk(dir, "", out);
      return out.filter((entry) => entry.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key));
    },
    linkFor(key) {
      checkKey(key);
      return link(key);
    },
  };
}

export interface S3Config {
  bucket: string;
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** An S3-compatible bucket. Links are presigned bucket URLs, so the app downloads straight from the bucket. */
export function s3Store(config: S3Config, { ttlSeconds }: { ttlSeconds: number }): ObjectStore {
  const client = new Bun.S3Client({
    bucket: config.bucket,
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  return {
    async put(key, bytes, contentType) {
      checkKey(key);
      await client.write(key, bytes, { type: contentType });
    },
    async get(key) {
      checkKey(key);
      const file = client.file(key);
      if (!(await file.exists())) return null;
      return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || contentTypeForKey(key) };
    },
    async delete(key) {
      checkKey(key);
      await client.delete(key);
    },
    async list(prefix) {
      const out: StoredEntry[] = [];
      let token: string | undefined;
      do {
        const page = await client.list({ prefix, continuationToken: token });
        for (const item of page.contents ?? []) {
          out.push({ key: item.key, size: item.size ?? 0, modifiedAt: item.lastModified ? Date.parse(item.lastModified) : 0 });
        }
        token = page.isTruncated ? page.nextContinuationToken : undefined;
      } while (token);
      return out.sort((a, b) => a.key.localeCompare(b.key));
    },
    linkFor(key) {
      checkKey(key);
      return client.presign(key, { method: "GET", expiresIn: ttlSeconds });
    },
  };
}

/** Deletes objects no row points at, once they are older than the grace period (an upload can land before its row). */
export async function sweepOrphans(
  store: ObjectStore,
  referencedKeys: Set<string>,
  now: Date,
  graceMs = 60 * 60 * 1000,
): Promise<string[]> {
  const removed: string[] = [];
  for (const entry of await store.list("")) {
    if (referencedKeys.has(entry.key) || now.getTime() - entry.modifiedAt < graceMs) continue;
    await store.delete(entry.key);
    removed.push(entry.key);
  }
  return removed;
}
