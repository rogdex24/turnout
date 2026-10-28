import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "../src/migrate.js";
import { openDb } from "../src/utils/openDb.js";
import { memoryDb } from "./helpers.js";

const SOCIAL_TABLES = ["member", "auth_session", "otp_challenge", "profile", "social_handle", "consent_record", "rate_bucket"];
const NOW = "2026-01-01T00:00:00.000Z";

function schemaSnapshot(db: ReturnType<typeof openDb>): string {
  const rows = db.query("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all();
  return JSON.stringify(rows);
}

function insertMember(db: ReturnType<typeof openDb>, id: string, phone: string | null = `+120255501${id.slice(1).padStart(2, "0")}`) {
  db.query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    phone,
    phone === null ? "deleted" : "active",
    NOW,
    NOW,
  );
}

describe("social schema", () => {
  test("migrating twice on a fresh database changes nothing", () => {
    const db = memoryDb();
    const first = schemaSnapshot(db);
    migrate(db);
    expect(schemaSnapshot(db)).toBe(first);
    for (const table of SOCIAL_TABLES) {
      expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).not.toBeNull();
    }
  });

  test("a database from before the social tables gains them once and then stays the same", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-schema-"));
    try {
      const file = path.join(dir, "old.sqlite");
      const old = openDb(file);
      migrate(old);
      for (const table of SOCIAL_TABLES) old.exec(`DROP TABLE ${table}`);
      old.close();

      const db = openDb(file);
      migrate(db);
      const once = schemaSnapshot(db);
      migrate(db);
      expect(schemaSnapshot(db)).toBe(once);
      expect(db.query("SELECT COUNT(*) AS n FROM member").get()).toEqual({ n: 0 });
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("foreign keys are enforced", () => {
    const db = memoryDb();
    expect(() => db.query("INSERT INTO profile (member_id, created_at, updated_at) VALUES ('nobody', ?, ?)").run(NOW, NOW)).toThrow(
      /FOREIGN KEY/,
    );
    expect(() =>
      db
        .query("INSERT INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES ('c1', 'nobody', 'v1', 'service', ?)")
        .run(NOW),
    ).toThrow(/FOREIGN KEY/);
  });

  test("deleting a member removes sessions, profile and handle but not consent", () => {
    const db = memoryDb();
    insertMember(db, "m1");
    db.query("INSERT INTO profile (member_id, created_at, updated_at) VALUES ('m1', ?, ?)").run(NOW, NOW);
    db.query(
      "INSERT INTO auth_session (id, member_id, refresh_hash, created_at, last_used_at, expires_at) VALUES ('s1', 'm1', 'h', ?, ?, ?)",
    ).run(NOW, NOW, NOW);
    db.query("INSERT INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES ('c1', 'm1', 'v1', 'service', ?)").run(
      NOW,
    );
    expect(() => db.query("DELETE FROM member WHERE id = 'm1'").run()).toThrow(/FOREIGN KEY/);
    db.query("DELETE FROM profile WHERE member_id = 'm1'").run();
    db.query("DELETE FROM auth_session WHERE member_id = 'm1'").run();
    db.query("UPDATE member SET status = 'deleted', phone_e164 = NULL WHERE id = 'm1'").run();
    expect(db.query("SELECT status, phone_e164 FROM member WHERE id = 'm1'").get()).toEqual({
      status: "deleted",
      phone_e164: null,
    });
  });

  test("checks reject bad values", () => {
    const db = memoryDb();
    insertMember(db, "m1");
    expect(() => insertMember(db, "m2", "+12025550150")).not.toThrow();
    expect(() => insertMember(db, "m3", "+12025550150")).toThrow(/UNIQUE/);
    expect(() => insertMember(db, "m4", null)).not.toThrow();
    expect(() =>
      db.query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES ('m5', NULL, 'active', ?, ?)").run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db.query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES ('m6', '9876', 'active', ?, ?)").run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES ('m7', '+12025550107', 'vip', ?, ?)")
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db.query("INSERT INTO profile (member_id, gender, created_at, updated_at) VALUES ('m1', 'other', ?, ?)").run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .query(
          "INSERT INTO social_handle (member_id, kind, handle, status, reject_reason, submitted_at, submissions_day, updated_at) VALUES ('m1', 'instagram', 'a.b', 'approved', 'not_found', ?, '2026-01-01', ?)",
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .query(
          "INSERT INTO otp_challenge (id, phone_hash, purpose, code_hmac, created_at, expires_at, delivery_status) VALUES ('o1', 'h', 'sign_in', 'c', ?, ?, 'bounced')",
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
  });

  test("a consent is recorded once per member, notice version and purpose", () => {
    const db = memoryDb();
    insertMember(db, "m1");
    const sql = "INSERT INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES (?, 'm1', 'v1', 'service', ?)";
    db.query(sql).run("c1", NOW);
    expect(() => db.query(sql).run("c2", NOW)).toThrow(/UNIQUE/);
  });

  test("no table column holds a raw code", () => {
    const db = memoryDb();
    const columns = (db.query("PRAGMA table_info(otp_challenge)").all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain("code");
    expect(columns).not.toContain("phone_e164");
  });
});

describe("data map", () => {
  const map = fs.readFileSync(path.join(import.meta.dir, "..", "docs", "data-map.md"), "utf8");
  const mapped = new Set([...map.matchAll(/^\| `([a-z_0-9]+\.[a-z_0-9]+)` \|/gm)].map((m) => m[1] as string));

  test("every column of every social table is in docs/data-map.md", () => {
    const db = memoryDb();
    const actual: string[] = [];
    for (const table of SOCIAL_TABLES) {
      for (const col of db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]) {
        actual.push(`${table}.${col.name}`);
      }
    }
    expect(actual.filter((name) => !mapped.has(name))).toEqual([]);
  });

  test("docs/data-map.md lists no column that is gone", () => {
    const db = memoryDb();
    const actual = new Set<string>();
    for (const table of SOCIAL_TABLES) {
      for (const col of db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]) {
        actual.add(`${table}.${col.name}`);
      }
    }
    expect([...mapped].filter((name) => !actual.has(name))).toEqual([]);
  });
});
