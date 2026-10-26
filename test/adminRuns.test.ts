import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HttpError } from "../src/admin/api.js";
import { type Child, createRunStarter, type SpawnFn } from "../src/admin/runs.js";
import { memoryDb } from "./helpers.js";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function setup() {
  const db = memoryDb();
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-logs-"));
  const calls: { argv: string[]; cwd: string; logPath: string }[] = [];
  const exits: (() => void)[] = [];
  const spawn: SpawnFn = (argv, options) => {
    calls.push({ argv, ...options });
    const child: Child = { exited: new Promise<void>((resolve) => exits.push(resolve)) };
    return child;
  };
  const start = createRunStarter({
    db,
    dbPath: "/data/x.sqlite",
    logDir,
    spawn,
    makeId: () => ID,
    now: () => new Date("2026-09-12T10:00:00.000Z"),
  });
  return { db, logDir, calls, exits, start };
}

const status = (fn: () => unknown): number | "ok" => {
  try {
    fn();
    return "ok";
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
};

test("start spawns the sync CLI against the same db with the run id, logging to data/admin-runs", () => {
  const { start, calls, logDir } = setup();
  const result = start({ sources: ["communitie", "luma", "luma"] });
  expect(result.runId).toBe(ID);
  expect(result.logPath).toBe(path.join(logDir, "2026-09-12T10-00-00-000Z.log"));
  expect(calls).toHaveLength(1);
  const { argv } = calls[0]!;
  expect(argv.slice(1)).toEqual([
    "run",
    expect.stringMatching(/src\/cli\.ts$/),
    "sync",
    "--db",
    "/data/x.sqlite",
    "--sources",
    "communitie,luma",
    "--run-id",
    ID,
  ]);
});

test("unknown or malformed sources are 400 and nothing is spawned", () => {
  const { start, calls } = setup();
  for (const body of [null, {}, { sources: [] }, { sources: "luma" }, { sources: [1] }, { sources: ["nope"] }]) {
    expect({ body, result: status(() => start(body)) }).toEqual({ body, result: 400 });
  }
  expect(calls).toHaveLength(0);
});

test("409 while a sync_run is running, and the stale window frees the panel", () => {
  const { start, db, calls } = setup();
  db.prepare("INSERT INTO sync_run (id, started_at, status) VALUES ('r1', '2026-09-12T09:00:00.000Z', 'running')").run();
  expect(status(() => start({ sources: ["luma"] }))).toBe(409);
  expect(calls).toHaveLength(0);

  // Over six hours old: runSync would abandon it, so it must not block.
  db.prepare("UPDATE sync_run SET started_at = '2026-09-12T03:00:00.000Z'").run();
  expect(status(() => start({ sources: ["luma"] }))).toBe("ok");
});

test("409 for a second request before the child has written its sync_run row", async () => {
  const { start, exits, calls } = setup();
  start({ sources: ["luma"] });
  expect(status(() => start({ sources: ["luma"] }))).toBe(409);
  exits[0]!();
  await Promise.resolve();
  await Promise.resolve();
  expect(status(() => start({ sources: ["luma"] }))).toBe("ok");
  expect(calls).toHaveLength(2);
});
