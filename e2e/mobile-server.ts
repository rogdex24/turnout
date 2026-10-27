/**
 * Seeded server for the mobile Maestro flows (`bun e2e/mobile-server.ts`): the real `serve` command on a temp SQLite file, on a free
 * port, seeded with the same fixture events as the browser tests. It prints the URL, runs until SIGINT or SIGTERM, then removes the file.
 * CI starts it in the background and passes the URL to the e2e build of the app.
 */
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seed } from "./server.js";

/** Extra flags for `serve`. Add `--no-ticker` here when `serve` gets its in-process ticker (plan section 3, process model), so the flows control time. */
const SERVE_FLAGS: string[] = [];

/**
 * M2 hook (S20): the app seed (members, plans, groups) and the fake OTP and push senders. `serveEnv` is where the sender switches go,
 * for example the fake OTP sender and the staging test token. Both are empty until M2 lands.
 */
function seedApp(_file: string): void {}
const serveEnv: Record<string, string> = {};

/**
 * A free port below the OS's ephemeral range (49152 and up), for the reason given in e2e/run.ts: a port picked from that range can be
 * handed out again to another listener before `serve` binds it.
 */
function freePort(): number {
  for (;;) {
    try {
      const probe = Bun.serve({ port: 20_000 + Math.floor(Math.random() * 20_000), fetch: () => new Response("") });
      const { port } = probe;
      probe.stop(true);
      return port!; // a Bun.serve with a numeric port always has one
    } catch {
      // taken: try another
    }
  }
}

export type MobileServer = { url: string; port: number; dbPath: string; stop: () => Promise<void> };

/** Seeds a temp database, starts `serve` on it and resolves once `/api/events` answers. */
export async function startMobileServer(options: { port?: number; timeoutMs?: number } = {}): Promise<MobileServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turnout-mobile-"));
  const dbPath = path.join(dir, "mobile.sqlite");
  // The real clock, so the fixture events are upcoming and show in the list.
  seed(dbPath, new Date());
  seedApp(dbPath);
  // The seed leaves a WAL file behind; checkpoint it so `serve`'s read-only handle sees one self-contained file.
  const db = new Database(dbPath, { strict: true });
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();

  const port = options.port ?? freePort();
  const child = Bun.spawn([process.execPath, "src/cli.ts", "serve", "--db", dbPath, "--port", String(port), ...SERVE_FLAGS], {
    env: { ...process.env, ...serveEnv },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const stop = async () => {
    child.kill();
    await child.exited;
    fs.rmSync(dir, { recursive: true, force: true });
  };

  const url = `http://localhost:${port}`;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`serve exited with code ${child.exitCode} before it answered`);
    }
    try {
      if ((await fetch(`${url}/api/events?limit=1`)).ok) return { url, port, dbPath, stop };
    } catch {
      // not listening yet
    }
    await Bun.sleep(200);
  }
  await stop();
  throw new Error(`serve did not answer on ${url} within the timeout`);
}

if (import.meta.main) {
  const server = await startMobileServer({ port: process.env.MOBILE_SERVER_PORT ? Number(process.env.MOBILE_SERVER_PORT) : undefined });
  console.log(`mobile server on ${server.url}`);
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
