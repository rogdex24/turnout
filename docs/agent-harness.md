# Task: an AI-agent harness as an ingestion source (Grok only)

The domain restructure has landed (`src/catalog`, `src/ingestion`,
`src/web`, `src/curation`, `src/utils`, dependency-cruiser in `bun run check`).
Read `AGENTS.md`, `src/ingestion/sync.ts`, `src/ingestion/sources/types.ts`,
`src/ingestion/sources/registry.ts` and one adapter (`luma.ts`) before writing code.
Baseline `bun run check` first.

## Goal

Let a coding-agent CLI the operator already pays for (Grok) find
Hyderabad events on sites that have no clean API (venue sites, organiser pages, small
listing sites) and hand them to the pipeline. The agent is one more source. It never
writes to the database. Its records go through the same health check, raw archive,
dedupe and listing rule as every other source.

The agent is untrusted. A JSON schema does not stop it inventing a date or a price, so
every record carries verbatim quotes from the page, and our code re-fetches the page
and rejects the record if the quotes are not on it.

## Shape

```
src/ingestion/agent/
  harness.ts      Harness port + the HARNESSES table (one entry per CLI)
  runHarness.ts   spawn one harness in a run directory, with a timeout; returns { exitCode, stdout, stderr, outPath }
  prompt.md       the task prompt template (seeds, output path, record format, rules)
  seeds.ts        the URLs the agent starts from, with a one-line note each
  record.ts       parseAgentRecord(unknown): AgentRecord | Rejection   (hand-written, like sources/shared.ts)
  verify.ts       verifyRecord(record, fetchImpl): Accepted | Quarantined | Rejected
  agentSource.ts  agentSource(harness): SourceAdapter  (glues the above, returns FetchedItem[])
```

The `SourceAdapter` contract does not change. Register one adapter per harness:
`agentSource(HARNESSES.grok)` under the name `agent:grok`. Agent sources are not in the default sync run; they run only when named:
`bun run src/cli.ts sync --sources agent:grok`. `SourceAdapter.optIn` and
`selectAdapters` in `ingestion/sync.ts` already do this; set `optIn: true` on each agent
adapter. The admin panel (built in parallel, see `docs/admin-panel.md`) lists sources from
the registry and reads `data/agent-runs/<syncRunId>-<harness>/report.json`, so keep that
path and give `report.json` this shape: `{ harness, startedAt, finishedAt, exitCode,
emitted, accepted, quarantined: [{ record, reason }], rejected: [{ line, reason }] }`.

### Harness port

```ts
export interface Harness {
  name: string;                                   // "grok"
  argv(prompt: string): string[];                 // full command line; cwd is the run dir
  timeoutMs: number;
}
```

Starting argv (verify each against `--help` of the installed version and adjust):

| Harness | argv |
|---|---|
| grok | `grok -p <prompt> --output-format json --max-turns 40 --always-approve` |

Tool scope: the agent needs web search, web fetch and writing one file in its run
directory. It does not need a shell. For each CLI, find the narrowest way to remove shell
and other tools (`grok --tools`) and use it. Document in a comment what each harness can still do. If a CLI
cannot remove shell access, say so in the final report; do not silently run it unrestricted.

Contract with the agent: it writes JSON Lines to `./events.jsonl` in its working
directory. We do not rely on stdout or on any CLI's schema flag, because CLIs disagree on
schema flags and output envelopes. Stdout and stderr are kept in the
run directory for debugging only.

Run directories: `data/agent-runs/<syncRunId>-<harness>/` holding `prompt.md` (as sent),
`events.jsonl`, `stdout.txt`, `stderr.txt`, `report.json`. Make sure `data/` stays gitignored.

### Record format (one JSON object per line)

```json
{
  "title": "Stand-up Night with ...",
  "starts_local": "2026-10-18T19:30",
  "ends_local": null,
  "venue_name": "Lamakaan",
  "address": "Banjara Hills, Hyderabad",
  "price_min": 499,
  "is_free": false,
  "category_hint": "comedy",
  "source_url": "https://...",
  "evidence": {
    "title": "verbatim text from the page",
    "date": "verbatim text from the page that states the date",
    "venue": "verbatim text from the page that states the venue",
    "price": "verbatim text, or null when price_min is null"
  }
}
```

- Times are Hyderabad wall clock, no offset. Convert with `utils/time.ts` conventions.
- Unknown values are `null`. The prompt must say plainly: never guess, `null` is correct.
- `category_hint` is a hint only. It becomes the `categories` label passed to the
  existing `classify()`, which stays the single owner of the category decision.
- `sourceEventId` = a stable hash of the normalised `source_url` + `title`;
  `sourceSlotId` = the UTC start ISO. Re-running must upsert, not duplicate.

### Verification (the only gate)

For each parsed record:
1. Fetch `source_url` ourselves (`utils/http.ts`, our USER_AGENT, ~1 req/sec, one
   fetch per distinct URL per run).
2. Reduce the page to text (strip tags, collapse whitespace, decode entities, lowercase).
3. Each non-null evidence quote, normalised the same way, must be a substring of that text.
4. The parsed date must be consistent with `evidence.date` (the day-of-month number and
   month name or number appear in it). Keep this check simple and say what it misses.
5. Outcome:
   - all checks pass: Accepted, becomes a FetchedItem whose `raw` is the record plus the
     page text hash (so raw_payload archives what we verified against)
   - fetch failed (403, timeout, login wall): Quarantined, not published, listed in report.json
   - a quote is missing or the date disagrees: Rejected, listed in report.json with the reason
   - start in the past or more than MAX_DAYS_FROM_NOW ahead: Rejected

The harness failing (non-zero exit, timeout, no `events.jsonl`) makes the adapter throw,
which already marks that source failed and keeps it out of reconciliation. An empty but
valid file is a normal result that the health check judges.

### Delisting

Agent output varies run to run, so a record missing from one run is weak evidence the
event is gone. Agent sources should not delist on absence; their rows expire by date only.
Implement this as the smallest change to `sync.ts` reconciliation (for example skipping
sources whose registry entry says so), with a test.

## Tests (write them first, all offline)

Use a fake harness: a `Harness` whose argv runs `bun test/fixtures/fake-harness.ts <fixture>`
and copies a canned `events.jsonl` into the cwd. Verification uses an injected `fetchImpl`
serving fixture pages.

Cases that must exist:
- a correct record with all quotes on the page is accepted and stored as source `agent:fake`
- a record whose date is not on the page (fabricated) is rejected with a reason
- a record whose price quote is invented is rejected
- the page fetch returns 403: quarantined, not stored
- malformed JSON line, missing required field, wrong types: rejected, other lines still processed
- harness exits non-zero / times out / writes no file: the source is marked failed and none
  of its existing rows are delisted
- running the same output twice upserts (no duplicate rows)
- an agent row absent from the next run is not delisted

## Pilot

1. Propose 10 seed URLs in `seeds.ts`: Hyderabad venues and organisers whose events are
   NOT already covered by the Tier A sources (check by searching the local DB for the
   venue). Mark the file with a comment that the operator must review the list.
   **Then stop and report the list.** Do not start a live run until the operator replies
   with approval of the seeds. Everything before this point (code, tests, fake harness)
   must be finished and committed.
2. After approval, run `bun run src/cli.ts sync --db data/pilot.sqlite --sources agent:grok`.
   Do not use the main DB.
3. Produce a comparison in the final report, per harness: wall time, records emitted,
   accepted, quarantined, rejected (with the top rejection reasons), and how many accepted
   events were new versus duplicates of Tier A rows after dedupe. Spot-check 5 accepted
   events per harness by hand against the page and report any that are wrong.

If a CLI is not logged in or hits its quota, record that and continue with the others.

## Docs

- `AGENTS.md`: add the agent source to the module map and the invariant "agent output is
  published only after verify.ts finds every evidence quote on a page we fetched".
- `docs/open-questions.md`: add a question for the operator on whether each vendor's
  terms allow unattended use of a consumer subscription for this, status OPEN.

## Out of scope

Health-triggered adapter repair (the next brief). Instagram (needs login; the agent and
our verifier would both hit a wall). Any LLM API key usage. New runtime dependencies.
Changing `classify()`.

## Final report

Tree of `src/ingestion/agent/`, commits, `bun run check` summary, the pilot comparison
table, the tool restrictions each harness actually ran with, and anything left undone.
