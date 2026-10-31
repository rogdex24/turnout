/**
 * Load smoke for the app API (M5 S23): members poll their group thread while the ticker runs, against a local seeded server.
 *
 *   bun run load-smoke [--members 300] [--seconds 120] [--interval 5] [--tick-every 5]
 *
 * It builds a temp SQLite file with one group of six per show (300 members is 50 shows), starts the real `serve` command on it as a
 * staging server with its own ticker on, and has every member read `GET /groups/:id/messages` every `--interval` seconds, each on
 * its own offset. A thread read also writes (the member's presence), so this is 300 members' worth of writers behind one lock.
 * Beside the polls it forces a ticker pass over all the shows every `--tick-every` seconds (the real one is every 30), and runs a
 * second writer handle that commits a batch of event updates every two seconds, standing in for the sync and the operator panel,
 * which are the other processes that share the file.
 *
 * The plan's bar: p95 of the polls under 150 ms and no SQLITE_BUSY. A BUSY from the writer handle, a 5xx, or the server's log naming
 * SQLITE_BUSY or "database is locked" counts. The first fix for a miss is a longer poll interval in the app, not a bigger pool.
 * The exit code is 1 when the bar is missed. The load generator shares the machine with the server, so on a small machine the
 * numbers are worse than a real host's: say so when quoting them.
 *
 * Reduced scale: `--members 60 --seconds 60` is a few seconds of setup and a minute of load.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { loadAppConfig } from "../src/app-api/env.js";
import { signAccessToken } from "../src/app-api/tokens.js";
import { migrate } from "../src/migrate.js";
import { submitHandle } from "../src/social/handles.js";
import { createMember } from "../src/social/members.js";
import { approveHandle, approveTicket } from "../src/social/operator.js";
import { createPlan } from "../src/social/plans.js";
import { insertSession } from "../src/social/sessions.js";
import { postMessage } from "../src/social/thread.js";
import { tick } from "../src/social/tick.js";
import { addTicket } from "../src/social/tickets.js";
import { openDb } from "../src/utils/openDb.js";

const GROUP_SIZE = 6;
const GENDERS = ["woman", "man", "woman", "man", "non_binary", "woman"] as const;
const P95_BAR_MS = 150;
/** Groups form for a show a few days out (a plan cannot be made inside the last 24 hours). */
const FORM_IN_MS = 5 * 24 * 3_600_000;
/** Then the show is moved to this long from now: inside the thread's window (it opens at T-3h) for the whole run. */
const SHOW_IN_MS = 2.5 * 3_600_000;
const API = "/api/app/v1";

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value;
}

const members = Math.ceil(flag("members", 300) / GROUP_SIZE) * GROUP_SIZE;
const shows = members / GROUP_SIZE;
const seconds = flag("seconds", 120);
const intervalMs = flag("interval", 5) * 1000;
const tickEveryMs = flag("tick-every", 5) * 1000;
// One access token has to last the whole run.
if (seconds > 13 * 60) throw new Error("--seconds is at most 780: an access token lasts 15 minutes");

function percentile(sorted: number[], p: number): number {
  return sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] as number);
}

function describe(samples: number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const fmt = (n: number) => n.toFixed(1);
  return `n=${sorted.length} p50=${fmt(percentile(sorted, 0.5))}ms p95=${fmt(percentile(sorted, 0.95))}ms p99=${fmt(percentile(sorted, 0.99))}ms max=${fmt(sorted.at(-1) ?? 0)}ms`;
}

/** The numbers are only ever rows in a temp file: nothing is sent to them. */
/**
 * Only 555-0100 to 555-0199 is set aside for fiction in each North American area code, so the members spread over a few area
 * codes: 100 numbers each, 800 in all. No number here can belong to a real person.
 */
const FICTIONAL_AREAS = ["202", "212", "312", "415", "503", "617", "702", "808"];
const MAX_MEMBERS = FICTIONAL_AREAS.length * 100;

function phoneOf(index: number): string {
  const area = FICTIONAL_AREAS[Math.floor(index / 100)];
  if (area === undefined) throw new Error(`At most ${MAX_MEMBERS} members have a fictional number`);
  return `+1${area}55501${String(index % 100).padStart(2, "0")}`;
}

/** One entry per member: the access token and the group to poll. */
interface Caller {
  token: string;
  groupId: string;
}

async function seed(db: ReturnType<typeof openDb>, env: Record<string, string>): Promise<Caller[]> {
  const now = new Date();
  const startsAt = new Date(now.getTime() + FORM_IN_MS).toISOString();
  const stamp = now.toISOString();
  const memberIds: string[] = [];
  db.transaction(() => {
    for (let s = 0; s < shows; s++) {
      const event = `load-show-${s}`;
      const venue = `venue-${event}`;
      db.query(
        `INSERT INTO venue (id, name, name_key, geocode_state, lat, lng, created_at, updated_at) VALUES (?, ?, ?, 'resolved', 17.4165, 78.4392, ?, ?)`,
      ).run(venue, `Hall ${s}`, `hall-${s}`, stamp, stamp);
      db.query(
        `INSERT INTO event (id, source, source_event_id, source_slot_id, title, starts_at, time_kind, venue_id, venue_name, category, price_min, is_free,
           dedupe_group_id, source_url, content_hash, first_seen_at, last_seen_at, last_seen_run_id, updated_at)
         VALUES (?, 'communitie', ?, '0', ?, ?, 'timed', ?, ?, 'comedy', 999, 0, NULL, ?, 'h', ?, ?, 'run', ?)`,
      ).run(event, event, `Load show ${s}`, startsAt, venue, `Hall ${s}`, `https://example.test/${event}`, stamp, stamp, stamp);
    }
  })();
  for (let i = 0; i < members; i++) {
    const member = createMember(db, phoneOf(i), now);
    memberIds.push(member.id);
    db.query("UPDATE profile SET first_name = ?, gender = ?, photo_key = ? WHERE member_id = ?").run(
      `Load${i}`,
      GENDERS[i % GROUP_SIZE] as string,
      `photos/${randomBytes(12).toString("hex")}.jpg`,
      member.id,
    );
    submitHandle(db, member.id, "instagram", `load_${i}`, now, 99);
    approveHandle(db, member.id, now);
    const made = createPlan(db, { memberId: member.id, eventId: `load-show-${Math.floor(i / GROUP_SIZE)}`, groupType: "open", now });
    if (!made.ok) throw new Error(`plan not made: ${made.error}`);
    const sent = addTicket(db, {
      plan: made.plan,
      objectKey: `tickets/${made.plan.id}.jpg`,
      mime: "image/jpeg",
      bytes: 1000,
      sha256: `sha-${made.plan.id}`,
      now,
    });
    if (!sent.ok) throw new Error(`ticket not added: ${sent.error}`);
    const reviewed = approveTicket(db, sent.ticket.id, now);
    if (!reviewed.ok) throw new Error(`ticket not approved: ${reviewed.error}`);
  }
  tick(db, now);
  const groups = db.query("SELECT group_id, member_id FROM group_member").all() as { group_id: string; member_id: string }[];
  const groupOf = new Map(groups.map((row) => [row.member_id, row.group_id]));
  if (groupOf.size !== members) throw new Error(`${groupOf.size} of ${members} members are in a group: the seed did not form them`);
  // The same show, now close: the thread is open and the server's ticker has a lock and a reveal to run for every group.
  const soon = new Date(now.getTime() + SHOW_IN_MS).toISOString();
  for (const table of ["show_group", "event"]) db.query(`UPDATE ${table} SET starts_at = ?`).run(soon);
  db.query("UPDATE plan SET show_starts_at = ?").run(soon);
  // A thread with something in it, so a poll is not an empty read: ten messages in each group.
  for (const groupId of new Set(groupOf.values())) {
    const people = groups.filter((row) => row.group_id === groupId);
    for (let m = 0; m < 10; m++) {
      const who = people[m % people.length] as { member_id: string };
      const result = postMessage(db, groupId, who.member_id, { body: `message ${m}`, clientId: randomBytes(8).toString("hex") }, now);
      if (!result.ok) throw new Error(`message not stored: ${result.error}`);
    }
  }
  const config = await loadAppConfig(env);
  const callers: Caller[] = [];
  for (const id of memberIds) {
    const sessionId = crypto.randomUUID();
    insertSession(db, { id: sessionId, memberId: id, refreshHash: randomBytes(16).toString("hex"), now, refreshDays: 1 });
    const { token } = await signAccessToken(config, { memberId: id, sessionId }, now);
    callers.push({ token, groupId: groupOf.get(id) as string });
  }
  return callers;
}

/** A port below the ephemeral range, so another listener cannot be handed it before `serve` binds it. */
function freePort(): number {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    try {
      Bun.serve({ port, fetch: () => new Response("") }).stop(true);
      return port;
    } catch {
      // taken: try another
    }
  }
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turnout-load-"));
  const dbPath = path.join(dir, "load.sqlite");
  const pair = await generateKeyPair("ES256", { extractable: true });
  const testToken = randomBytes(24).toString("base64url");
  const env: Record<string, string> = {
    TURNOUT_ENV: "staging",
    OTP_SENDER: "fake",
    OBJECT_STORE: "disk",
    FILES_DIR: path.join(dir, "files"),
    STAGING_TEST_TOKEN: testToken,
    AUTH_JWT_PRIVATE_KEY: await exportPKCS8(pair.privateKey),
    AUTH_JWT_PUBLIC_KEY: await exportSPKI(pair.publicKey),
  };

  const db = openDb(dbPath);
  migrate(db);
  console.log(`seeding ${members} members in ${shows} groups`);
  const callers = await seed(db, env);
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");

  const port = freePort();
  const serverLog: string[] = [];
  const child = Bun.spawn([process.execPath, "src/cli.ts", "serve", "--db", dbPath, "--port", String(port)], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      serverLog.push(decoder.decode(value));
    }
  };
  void collect(child.stdout);
  void collect(child.stderr);
  const base = `http://localhost:${port}`;
  let failed = false;
  try {
    const deadline = Date.now() + 90_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`serve exited with code ${child.exitCode}: ${serverLog.join("").slice(-500)}`);
      if (Date.now() > deadline) throw new Error("serve did not answer within 90 seconds");
      try {
        if ((await fetch(`${base}/api/events?limit=1`)).ok) break;
      } catch {
        // not listening yet
      }
      await Bun.sleep(200);
    }

    const polls: number[] = [];
    const passes: number[] = [];
    const statuses = new Map<number, number>();
    let busy = 0;
    let stopping = false;
    const count = (status: number) => statuses.set(status, (statuses.get(status) ?? 0) + 1);

    const poll = async (caller: Caller) => {
      const started = performance.now();
      try {
        const response = await fetch(`${base}${API}/groups/${caller.groupId}/messages`, {
          headers: { authorization: `Bearer ${caller.token}` },
        });
        await response.arrayBuffer();
        polls.push(performance.now() - started);
        count(response.status);
      } catch {
        count(0);
      }
    };
    const pollers = callers.map(async (caller) => {
      await Bun.sleep(Math.random() * intervalMs);
      while (!stopping) {
        const next = Date.now() + intervalMs;
        await poll(caller);
        await Bun.sleep(Math.max(0, next - Date.now()));
      }
    });
    const ticker = (async () => {
      while (!stopping) {
        await Bun.sleep(tickEveryMs);
        const started = performance.now();
        try {
          const response = await fetch(`${base}${API}/__test/clock`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-staging-test-token": testToken },
            body: JSON.stringify({ tick: true }),
          });
          await response.arrayBuffer();
          passes.push(performance.now() - started);
          if (!response.ok) count(response.status);
        } catch {
          count(0);
        }
      }
    })();
    // The other writer processes: a batch of event updates, as a sync run commits them.
    const writer = openDb(dbPath);
    const writes = (async () => {
      while (!stopping) {
        await Bun.sleep(2000);
        try {
          writer.transaction(() => {
            writer.query("UPDATE event SET last_seen_at = ?").run(new Date().toISOString());
          })();
        } catch (error) {
          if (String(error).includes("SQLITE_BUSY") || String(error).includes("database is locked")) busy += 1;
          else throw error;
        }
      }
    })();

    console.log(
      `polling for ${seconds}s: ${callers.length} members every ${intervalMs / 1000}s, a ticker pass every ${tickEveryMs / 1000}s`,
    );
    await Bun.sleep(seconds * 1000);
    stopping = true;
    await Promise.all([...pollers, ticker, writes]);
    writer.close();

    const logged = serverLog.join("");
    const busyInLog = (logged.match(/SQLITE_BUSY|database is locked/g) ?? []).length;
    const serverErrors = [...statuses.entries()].filter(([status]) => status >= 500 || status === 0).reduce((sum, [, n]) => sum + n, 0);
    const notOk = [...statuses.entries()].filter(([status]) => status !== 200).reduce((sum, [, n]) => sum + n, 0);
    const p95 = percentile(
      [...polls].sort((a, b) => a - b),
      0.95,
    );
    console.log("");
    console.log(
      `scale:        ${members} members, ${shows} shows, poll every ${intervalMs / 1000}s, ${seconds}s, ${os.cpus().length} cpus`,
    );
    console.log(`polls:        ${describe(polls)}`);
    console.log(`ticker pass:  ${describe(passes)}`);
    console.log(`statuses:     ${[...statuses.entries()].map(([status, n]) => `${status} x${n}`).join(", ")}`);
    console.log(`SQLITE_BUSY:  ${busy} from the second writer, ${busyInLog} in the server log, ${serverErrors} 5xx or failed requests`);
    failed = p95 >= P95_BAR_MS || busy + busyInLog + serverErrors > 0 || notOk > 0 || polls.length === 0;
    console.log(
      failed
        ? `MISS: the bar is p95 under ${P95_BAR_MS} ms, no SQLITE_BUSY and every poll 200. Lengthen the app's poll interval first.`
        : `PASS: p95 ${p95.toFixed(1)} ms is under ${P95_BAR_MS} ms, no SQLITE_BUSY, every poll 200.`,
    );
  } finally {
    child.kill();
    await child.exited;
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exitCode = failed ? 1 : 0;
}

await main();
