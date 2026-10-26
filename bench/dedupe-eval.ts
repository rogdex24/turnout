/**
 * Diffs dedupe decisions between the committed implementation and the working
 * tree, so a change to the match rule is reviewed pair by pair instead of by
 * eyeballing a group count.
 *
 *   bun run bench/dedupe-eval.ts                     # against HEAD
 *   bun run bench/dedupe-eval.ts <git-ref> <db-path>
 *
 * Exits non-zero if either side throws, so it can gate a change.
 */

import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupDuplicates as candidate } from "../src/catalog/dedupe.js";
import type { EventRow } from "../src/catalog/types.js";
import { hasColumn } from "../src/utils/db.js";

const ref = process.argv[2] ?? "HEAD";
const dbPath = process.argv[3] ?? "data/hydsocial.sqlite";

// Import a committed snapshot, including its own runtime dependencies.
const archive = Bun.spawnSync(["git", "archive", "--format=tar", ref, "src/catalog", "src/utils"]);
assert.equal(archive.exitCode, 0, archive.stderr.toString());
const dir = mkdtempSync(join(tmpdir(), "hydsocial-dedupe-"));
writeFileSync(join(dir, "baseline.tar"), archive.stdout);
const extract = Bun.spawnSync(["tar", "-xf", join(dir, "baseline.tar"), "-C", dir]);
assert.equal(extract.exitCode, 0, extract.stderr.toString());
const { groupDuplicates: baseline } = (await import(join(dir, "src/catalog/dedupe.ts"))) as {
  groupDuplicates: (rows: EventRow[]) => Map<string, string[]>;
};
rmSync(dir, { recursive: true, force: true });

/** Every unordered pair the grouping treats as the same real event. */
function mergedPairs(groups: Map<string, string[]>): Set<string> {
  const pairs = new Set<string>();
  for (const members of groups.values()) {
    const sorted = [...members].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) pairs.add(`${sorted[i]}\u0000${sorted[j]}`);
    }
  }
  return pairs;
}

const db = new Database(dbPath, { readonly: true, strict: true });
const rows = db
  .prepare(
    `SELECT id, source, source_event_id AS sourceEventId, title, venue_name AS venueName,
            starts_at AS startsAt, ${hasColumn(db, "event", "time_kind") ? "time_kind" : "'timed'"} AS timeKind, first_seen_at AS firstSeenAt
     FROM event WHERE status = 'active'`,
  )
  .all() as EventRow[];
const byId = new Map(rows.map((row) => [row.id, row]));

const before = mergedPairs(baseline(rows));
const after = mergedPairs(candidate(rows));
const added = [...after].filter((pair) => !before.has(pair));
const removed = [...before].filter((pair) => !after.has(pair));

const describe = (pair: string): string => {
  const [a, b] = pair.split("\u0000").map((id) => byId.get(id));
  if (!a || !b) return pair;
  const when = (row: EventRow) => row.startsAt.slice(5, 16).replace("T", " ");
  return `    ${a.source}/${b.source}\n      A ${when(a)} "${a.title}" @ ${a.venueName ?? "(none)"}\n      B ${when(b)} "${b.title}" @ ${b.venueName ?? "(none)"}`;
};

console.log(`Dedupe decision diff, ${ref} vs working tree, ${rows.length} active rows\n`);
console.log(`  pairs merged by baseline : ${before.size}`);
console.log(`  pairs merged by candidate: ${after.size}`);
console.log(`  newly merged             : ${added.length}`);
console.log(`  no longer merged         : ${removed.length}`);

for (const [label, pairs] of [
  ["NEWLY MERGED", added],
  ["NO LONGER MERGED", removed],
] as const) {
  if (pairs.length === 0) continue;
  console.log(`\n  ${label} (${pairs.length}), review each:`);
  for (const pair of pairs.slice(0, 40)) console.log(describe(pair));
  if (pairs.length > 40) console.log(`    ... and ${pairs.length - 40} more`);
}
db.close();
