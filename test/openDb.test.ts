import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adjustableClock, fixedClock } from "../src/utils/clock.js";
import { openDb } from "../src/utils/openDb.js";

function pragma(db: ReturnType<typeof openDb>, name: string): unknown {
  const row = db.query(`PRAGMA ${name}`).get() as Record<string, unknown>;
  return Object.values(row)[0];
}

describe("openDb", () => {
  test("a writable handle has WAL, a busy timeout and foreign keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opendb-"));
    try {
      const db = openDb(path.join(dir, "a.sqlite"));
      expect(pragma(db, "journal_mode")).toBe("wal");
      expect(pragma(db, "busy_timeout")).toBe(5000);
      expect(pragma(db, "foreign_keys")).toBe(1);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a read-only handle cannot write and still waits and checks keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opendb-"));
    try {
      const file = path.join(dir, "b.sqlite");
      openDb(file).exec("CREATE TABLE t (id INTEGER)");
      const ro = openDb(file, { readonly: true });
      expect(pragma(ro, "busy_timeout")).toBe(5000);
      expect(() => ro.exec("INSERT INTO t VALUES (1)")).toThrow();
      ro.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("clocks", () => {
  test("a fixed clock moves only when told to", () => {
    const clock = fixedClock("2026-01-01T00:00:00Z");
    expect(clock().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    clock.advance(60_000);
    expect(clock().toISOString()).toBe("2026-01-01T00:01:00.000Z");
    clock.set("2026-02-01T00:00:00Z");
    expect(clock().toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("an adjustable clock runs from a base plus an offset and resets", () => {
    const base = fixedClock("2026-01-01T00:00:00Z");
    const clock = adjustableClock(base);
    clock.advance(3_600_000);
    expect(clock().toISOString()).toBe("2026-01-01T01:00:00.000Z");
    clock.set("2026-03-01T00:00:00Z");
    expect(clock().toISOString()).toBe("2026-03-01T00:00:00.000Z");
    base.advance(1000);
    expect(clock().toISOString()).toBe("2026-03-01T00:00:01.000Z");
    clock.reset();
    expect(clock().toISOString()).toBe("2026-01-01T00:00:01.000Z");
  });
});
