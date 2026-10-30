import fs from "node:fs";
import path from "node:path";
import { startAdmin } from "./admin/start.js";
import { APP_PREFIX, type AppContext, appResponse, ConfigError, createAppContext, startTicker } from "./app-api/index.js";
import { addMuteRule, countMuted, isMuteField, listMuteRules, MUTE_FIELDS, removeMuteRule } from "./curation/mute.js";
import { nominatimGeocoder } from "./ingestion/geocode/nominatim.js";
import { runGeocode } from "./ingestion/geocode/runGeocode.js";
import { runSync } from "./ingestion/sync.js";
import { migrate } from "./migrate.js";
import { openDb } from "./utils/openDb.js";
import { isUuid } from "./utils/uuid.js";
import { appLinksFromEnv, rejectedAppLinkVars } from "./web/appLinks.js";
import { siteResponse } from "./web/index.js";
import { buildMapAssets } from "./web/map/assets.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "hydsocial.sqlite");

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** Args that are not a flag or a flag's value, so --note "x" cannot leak into a rule value. */
function positionalArgs(args: string[]): string[] {
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!; // i < args.length
    if (arg.startsWith("--")) {
      i += 1;
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

/** Mute rules hide events from everything the site serves. Sync still ingests them. */
function runMute(dbPath: string, args: string[]): void {
  const [action, field, ...valueParts] = positionalArgs(args);
  const db = openDb(dbPath);
  try {
    migrate(db);

    if (!action || action === "list") {
      const rules = listMuteRules(db);
      if (rules.length === 0) {
        console.log("No mute rules. Everything ingested is served.");
        return;
      }
      for (const rule of rules) {
        const hidden = countMuted(db, rule.field, rule.value);
        console.log(
          `  ${rule.field}=${rule.value}  hides ${hidden} active event${hidden === 1 ? "" : "s"}${rule.note ? `  (${rule.note})` : ""}`,
        );
      }
      return;
    }

    const value = valueParts.join(" ");
    if (!field || !isMuteField(field) || !value) {
      console.error(`Usage: mute ${action} <${MUTE_FIELDS.join("|")}> <value>`);
      process.exitCode = 1;
      return;
    }

    if (action === "add") {
      const hidden = countMuted(db, field, value);
      addMuteRule(db, field, value, readFlag(args, "--note"));
      console.log(`Muted ${field}="${value}". ${hidden} active event${hidden === 1 ? "" : "s"} will stop being served.`);
      return;
    }
    if (action === "remove") {
      console.log(
        removeMuteRule(db, field, value)
          ? `Unmuted ${field}="${value}". Its events are served again; no re-sync needed.`
          : `No rule matched ${field}="${value}".`,
      );
      return;
    }
    console.error(`Unknown mute action "${action}". Expected list, add or remove.`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

async function runGeocodeCommand(dbPath: string, args: string[]): Promise<void> {
  const db = openDb(dbPath);
  try {
    migrate(db);
    const limit = readFlag(args, "--limit");
    const dryRun = args.includes("--dry-run");
    const result = await runGeocode({
      db,
      geocoders: [nominatimGeocoder()],
      limit: limit ? Number(limit) : undefined,
      dryRun,
      log: console.log,
    });
    console.log(
      `${dryRun ? "Dry run: " : ""}considered=${result.considered} resolved=${result.resolved} failed=${result.failed} unchanged=${result.unchanged}`,
    );
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (command !== "sync" && command !== "serve" && command !== "mute" && command !== "geocode" && command !== "admin") {
    console.error(
      "Usage: bun run src/cli.ts <sync|serve|mute|geocode|admin> [--db <path>] [--port <port>] [--sources communitie,district,allevents,luma,townscript,meraevents,bookmyshow,growezy] [--run-id <uuid>] [--no-ticker]",
    );
    console.error(`       mute list | mute add <${MUTE_FIELDS.join("|")}> <value> [--note <text>] | mute remove <field> <value>`);
    process.exitCode = 1;
    return;
  }

  const dbPath = readFlag(rest, "--db") ?? DEFAULT_DB_PATH;
  if (command === "mute") {
    runMute(dbPath, rest);
    return;
  }
  if (command === "geocode") {
    await runGeocodeCommand(dbPath, rest);
    return;
  }
  if (command === "admin") {
    const port = Number(readFlag(rest, "--port") ?? 3001);
    // Same as serve: the panel opens the file read-only, so bring the schema up first.
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const migrator = openDb(dbPath);
    migrate(migrator);
    migrator.close();
    try {
      const { server } = startAdmin({ dbPath, port, env: process.env });
      console.log(`Admin panel for ${dbPath} at http://${server.hostname}:${server.port}`);
    } catch (error) {
      console.error(String(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    }
    return;
  }
  if (command === "serve") {
    const port = Number(readFlag(rest, "--port") ?? 3000);
    // Bring the schema up to date on a writable handle first. The site reads through a read-only
    // handle, so without this an existing database is missing any table a newer build introduced
    // and every query against it fails.
    const migrator = openDb(dbPath);
    migrate(migrator);
    migrator.close();
    await buildMapAssets();
    const siteDb = openDb(dbPath, { readonly: true });
    // The app API is the one writer in this process; it gets its own handle (WAL, busy_timeout, foreign keys).
    let app: AppContext;
    try {
      app = await createAppContext({ db: openDb(dbPath), env: process.env, requireEnv: true });
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    if (app.config.ephemeral.length > 0) {
      console.warn(`Not set, so random for this run (sessions end at a restart): ${app.config.ephemeral.join(", ")}`);
    }
    const appLinks = appLinksFromEnv(process.env);
    const rejectedLinks = rejectedAppLinkVars(process.env);
    if (rejectedLinks.length > 0) {
      console.warn(`Ignored a malformed value, so app link files may be 404: ${rejectedLinks.join(", ")}`);
    }
    const stopTicker = rest.includes("--no-ticker") ? undefined : startTicker(app);
    const server = Bun.serve({
      port,
      // A photo is at most 10 MB; the app API refuses bigger ones itself, and this stops a bigger body being buffered at all.
      maxRequestBodySize: 12 * 1024 * 1024,
      // iOS reuses an idle connection and does not retry a POST or PATCH when the server closed it first (error -1005).
      // Bun closes after 10 s by default; 255 s is its maximum (CI run 41083720068 lost a settings PATCH this way).
      idleTimeout: 255,
      fetch: (request, bunServer) =>
        new URL(request.url).pathname.startsWith(APP_PREFIX)
          ? appResponse(app, request, bunServer.requestIP(request)?.address ?? null)
          : siteResponse(siteDb, request, app.now, { grievance: app.config.grievance, appLinks, supportEmail: app.config.support.email }),
    });
    process.once("SIGTERM", () => {
      stopTicker?.();
      server.stop();
    });
    console.log(`Serving ${dbPath} at http://localhost:${port}`);
    return;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  migrate(db);

  const sourcesFlag = readFlag(rest, "--sources");
  const sources = sourcesFlag
    ? sourcesFlag
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const runId = readFlag(rest, "--run-id");
  if (runId !== undefined && !isUuid(runId)) {
    console.error("--run-id must be a uuid");
    process.exitCode = 1;
    db.close();
    return;
  }

  try {
    const result = await runSync({ db, sources, runId, dataDir: path.dirname(path.resolve(dbPath)) });
    console.log(
      `Sync complete: fetched=${result.fetched} created=${result.created} updated=${result.updated} delisted=${result.delisted} runId=${result.runId}`,
    );
    if (Object.keys(result.sourceErrors).length) {
      console.error("Source errors:", result.sourceErrors);
    }
    const row = db.prepare("SELECT COUNT(*) AS count FROM event WHERE status = 'active'").get() as {
      count: number;
    };
    const bySource = db
      .prepare("SELECT source, COUNT(*) AS count FROM event WHERE status = 'active' GROUP BY source ORDER BY source")
      .all() as { source: string; count: number }[];
    console.log(`Active events in ${dbPath}: ${row.count}`);
    for (const entry of bySource) console.log(`  ${entry.source}: ${entry.count}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exitCode = 1;
});
