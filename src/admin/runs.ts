/**
 * Starts a sync in a child process. The child owns the write path; the admin's
 * own connection never writes sync tables. The sync_run row, not the child's
 * exit code, is the source of truth for how the run went.
 */
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ABANDONED_RUN_HOURS } from "../ingestion/schema.js";
import { SOURCE_ADAPTERS } from "../ingestion/sources/registry.js";
import { HttpError } from "./api.js";

export interface Child {
  exited: Promise<unknown>;
}

/** Injected so tests never start a real sync. */
export type SpawnFn = (argv: string[], options: { cwd: string; logPath: string }) => Child;

export const spawnDetached: SpawnFn = (argv, { cwd, logPath }) => {
  const log = fs.openSync(logPath, "a");
  try {
    const child = Bun.spawn(argv, { cwd, stdin: "ignore", stdout: log, stderr: log, detached: true });
    child.unref();
    return child;
  } finally {
    fs.closeSync(log); // the child holds its own copy of the descriptor
  }
};

const CLI_PATH = new URL("../cli.ts", import.meta.url).pathname;

export interface RunStarterOptions {
  /** Read handle: used for the 409 check only. */
  db: Database;
  dbPath: string;
  logDir: string;
  spawn?: SpawnFn;
  now?: () => Date;
  makeId?: () => string;
}

export type StartRun = (body: unknown) => { runId: string; logPath: string };

export function createRunStarter(options: RunStarterOptions): StartRun {
  const { db, dbPath, logDir } = options;
  const spawn = options.spawn ?? spawnDetached;
  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? randomUUID;
  // The child inserts its sync_run row a moment after it starts. Until then two
  // quick requests would both pass the database check, so remember our own child.
  let inFlight = false;

  return (body) => {
    const sources = parseSources(body);

    const cutoff = new Date(now().getTime() - ABANDONED_RUN_HOURS * 60 * 60 * 1000).toISOString();
    // Same window runSync uses to abandon a stuck row, so a crashed child cannot block the panel.
    const running = db.prepare("SELECT 1 FROM sync_run WHERE status = 'running' AND started_at >= ?").get(cutoff);
    if (inFlight || running) throw new HttpError(409, "a sync is already running");

    fs.mkdirSync(logDir, { recursive: true });
    const runId = makeId();
    const logPath = path.join(logDir, `${now().toISOString().replace(/[:.]/g, "-")}.log`);
    const argv = [process.execPath, "run", CLI_PATH, "sync", "--db", dbPath, "--sources", sources.join(","), "--run-id", runId];

    const child = spawn(argv, { cwd: process.cwd(), logPath });
    inFlight = true;
    void child.exited.finally(() => {
      inFlight = false;
    });
    return { runId, logPath };
  };
}

function parseSources(body: unknown): string[] {
  const sources = typeof body === "object" && body !== null ? (body as { sources?: unknown }).sources : undefined;
  if (!Array.isArray(sources) || sources.length === 0 || sources.some((name) => typeof name !== "string")) {
    throw new HttpError(400, "sources must be a non-empty array of source names");
  }
  const known = new Set(SOURCE_ADAPTERS.map((adapter) => adapter.name));
  for (const name of sources as string[]) {
    if (!known.has(name)) throw new HttpError(400, `unknown source "${name}"`);
  }
  return [...new Set(sources as string[])];
}
