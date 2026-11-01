import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/migrate.js";

test("dedupe evaluation loads the committed catalog implementation and rejects a bad ref", () => {
  const dir = mkdtempSync(join(tmpdir(), "hydsocial-eval-test-"));
  try {
    const dbPath = join(dir, "events.sqlite");
    const db = new Database(dbPath, { create: true });
    migrate(db);
    db.close();
    const good = Bun.spawnSync([process.execPath, "run", "bench/dedupe-eval.ts", "HEAD", dbPath]);
    expect(good.exitCode).toBe(0);
    expect(good.stdout.toString()).toContain("pairs merged by baseline");
    expect(good.stdout.toString()).toContain("pairs merged by candidate");
    const bad = Bun.spawnSync([process.execPath, "run", "bench/dedupe-eval.ts", "not-a-real-ref", dbPath]);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr.toString()).toContain("not-a-real-ref");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The test checks which journal mode each case used and that every row landed, not how fast the disk is. The plain case
// syncs once per row, about 1,600 fsyncs, which took 21 of the 46 s of `bun test` on disk. A RAM-backed /dev/shm, where
// there is one, makes it take well under a second.
const writeTestRoot = existsSync("/dev/shm") ? "/dev/shm" : tmpdir();

test("write benchmark actually uses DELETE for plain and transaction cases", () => {
  const dir = mkdtempSync(join(writeTestRoot, "hydsocial-write-test-"));
  try {
    const result = Bun.spawnSync([process.execPath, "run", "bench/write-path.ts"], { env: { ...process.env, TMPDIR: dir } });
    expect(result.exitCode).toBe(0);
    for (const label of ["plain", "tx", "wal", "waltx"]) {
      const file = readdirSync(dir).find((name) => name.startsWith(`hydsocial-bench-${label}-`) && name.endsWith(".sqlite"));
      expect(file).toBeDefined();
      const db = new Database(join(dir, file!), { readonly: true });
      expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: label.startsWith("wal") ? "wal" : "delete" });
      expect(db.query("SELECT COUNT(*) AS n FROM event").get()).toEqual({ n: 800 });
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
