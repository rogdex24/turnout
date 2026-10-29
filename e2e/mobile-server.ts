/**
 * Seeded server for the mobile Maestro flows (`bun e2e/mobile-server.ts`): the real `serve` command on a temp SQLite file, on a free
 * port, seeded with the same fixture events as the browser tests plus the staging seed (scripts/seed-staging.ts: three shows that a
 * group can be made for and members in every state), as a staging server: the fake sign-in sender, `--no-ticker` and the `/__test/*`
 * routes behind a token made fresh for each run. It prints the URL and the token, runs until SIGINT or SIGTERM, then removes the files.
 * CI starts it in the background and passes the URL to the e2e build of the app.
 */
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SEED_PHONES, seedStaging, UNDELIVERABLE_PHONE } from "../scripts/seed-staging.js";
import { diskStore } from "../src/utils/objectStore.js";
import { openDb } from "../src/utils/openDb.js";
import { startOperator } from "./mobile-operator.js";
import { seed } from "./server.js";

/** `--no-ticker` keeps the background upkeep off, so the flows decide when time moves (`POST /__test/clock`). */
const SERVE_FLAGS: string[] = ["--no-ticker"];

/**
 * The staging settings (S20): the fake sender (it sends nothing, and the flows read the code from `POST /__test/otp`), the seed's
 * numbers on the allowlist, its undeliverable number, the files in the temp directory and a test token made fresh for each run.
 */
function serveEnv(dir: string, testToken: string): Record<string, string> {
  return {
    TURNOUT_ENV: "staging",
    OTP_SENDER: "fake",
    STAGING_TEST_TOKEN: testToken,
    TEST_PHONE_ALLOWLIST: SEED_PHONES.join(","),
    FAKE_UNDELIVERABLE_PHONES: UNDELIVERABLE_PHONE,
    FILES_DIR: path.join(dir, "files"),
    OBJECT_STORE: "disk",
  };
}

/** The shows and the members in every state (scripts/seed-staging.ts), with the photos written to the temp files directory. */
async function seedApp(file: string, dir: string): Promise<void> {
  const db = openDb(file);
  try {
    await seedStaging(db, diskStore({ dir: path.join(dir, "files"), link: () => "" }), new Date());
  } finally {
    db.close();
  }
}

/**
 * A free port below the OS's ephemeral range (49152 and up), for the reason given in e2e/run.ts: a port picked from that range can be
 * handed out again to another listener before `serve` binds it. The next port is free too, for the operator's routes.
 */
function freePort(): number {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    try {
      for (const candidate of [port, port + 1]) Bun.serve({ port: candidate, fetch: () => new Response("") }).stop(true);
      return port;
    } catch {
      // taken: try another
    }
  }
}

/** `testToken` goes in the `x-staging-test-token` header of the `/__test/*` routes. It is new for each run and not written anywhere. */
export type MobileServer = {
  url: string;
  port: number;
  /** The operator's side of the flows (e2e/mobile-operator.ts), on the port after the server's. */
  operatorUrl: string;
  dbPath: string;
  testToken: string;
  stop: () => Promise<void>;
};

/** Seeds a temp database, starts `serve` on it and resolves once `/api/events` answers. */
export async function startMobileServer(options: { port?: number; timeoutMs?: number } = {}): Promise<MobileServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turnout-mobile-"));
  const dbPath = path.join(dir, "mobile.sqlite");
  // The real clock, so the fixture events are upcoming and show in the list.
  seed(dbPath, new Date());
  await seedApp(dbPath, dir);
  // The seed leaves a WAL file behind; checkpoint it so `serve`'s read-only handle sees one self-contained file.
  const db = new Database(dbPath, { strict: true });
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();

  const testToken = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const port = options.port ?? freePort();
  const child = Bun.spawn([process.execPath, "src/cli.ts", "serve", "--db", dbPath, "--port", String(port), ...SERVE_FLAGS], {
    env: { ...process.env, ...serveEnv(dir, testToken) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let operator: ReturnType<typeof startOperator> | undefined;
  const stop = async () => {
    operator?.stop();
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
      if ((await fetch(`${url}/api/events?limit=1`)).ok) {
        operator = startOperator({
          dbPath,
          filesDir: path.join(dir, "files"),
          token: testToken,
          port: port + 1,
          serverNow: async () => {
            const response = await fetch(`${url}/api/app/v1/__test/clock`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-staging-test-token": testToken },
              body: "{}",
            });
            return new Date(((await response.json()) as { now: string }).now);
          },
        });
        return { url, port, operatorUrl: operator.url, dbPath, testToken, stop };
      }
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
  console.log(`operator on ${server.operatorUrl}`);
  console.log(`STAGING_TEST_TOKEN=${server.testToken}`);
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
