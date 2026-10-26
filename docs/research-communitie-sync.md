# Research: sync, upsert, reconciliation and dedupe patterns

Companion to `SPEC.md` and `data-model.md`, scoped to the Communitie sync
vertical. This session's sandbox blocked outbound network calls (web search
and the Exa MCP tools both required an approval that had no one to grant),
so the citations below are official, stable references from training
knowledge rather than a live search session. They are all specs or vendor
docs, not blog posts, so they should still be current.

## Upsert

SQLite's native `INSERT ... ON CONFLICT (...) DO UPDATE SET ...` is the
standard way to make an insert idempotent on a natural key without a
read-then-write race. This project uses it against the unique constraint on
`(source, source_event_id, source_slot_id)`.

- SQLite UPSERT syntax: https://www.sqlite.org/lang_upsert.html
- Bun's built-in `bun:sqlite` module (used here instead of a native
  dependency like better-sqlite3): https://bun.com/docs/runtime/sqlite

## Soft-delete reconciliation ("stale" detection)

The common pattern for a pull-based sync against a source with no delta or
webhook API: stamp every row touched in a run with that run's id, then after
the upsert pass, anything *not* stamped this run was absent from the source.
Rather than delete immediately (a transient 500 or a paginated fetch that
got cut short would wrongly wipe live data), give a row one missed run as a
grace period and only flip it to a terminal "gone" state after two
consecutive misses. This project's `reconcileStale` implements exactly that
two-strikes rule, matching `data-model.md` section 3's "never delete, mark
`delisted`" rule and section 7's "not seen for two consecutive runs" rule.

This is the same shape as watermark-based CDC reconciliation used by ETL
tools that lack native delete detection (Fivetran, Airbyte, and most
REST-API connectors document this "mark and sweep" approach), and as the
"tombstone" pattern in eventually-consistent stores. The core idea has been
stable for decades: keep a monotonically increasing marker, and treat
"marker did not advance" as evidence of deletion, with a debounce period to
absorb transient fetch failures.

## Event dedupe

Two independent layers, matching `data-model.md` section 8:

1. **Exact key.** A unique constraint on the source's own identifiers. This
   fully prevents the same real occurrence from ever being stored twice,
   regardless of how many times the sync runs. This is the primary
   mechanism here: `(source_event_id, source_slot_id)`.
2. **Fuzzy secondary pass.** For near-duplicates that arrive under two
   different source ids (a re-submitted listing, a copy-pasted event), the
   standard lightweight approach is token-set (Jaccard) or edit-distance
   similarity on a normalized title, constrained to the same day and venue
   to avoid false positives. This project uses Jaccard similarity on
   whitespace-tokenized, lowercased, punctuation-stripped titles, which is
   cheap, dependency-free, and matches `data-model.md`'s own approach
   (Jaro-Winkler over normalized titles, constrained to same venue and a
   time window) closely enough for a single-source vertical. A full
   Jaro-Winkler or embedding-based fallback (section 8.2 steps 2 and 4) is
   deferred until a second source is added and cross-source collisions
   actually appear.

## Paginated JSON ingestion

Communitie's `POST /customers/events/search` takes `{citySlug, page, size}`
and (per the brief) defaults to a page size of 24, which reads as a
Spring Data `Pageable` request — a very common convention for Java/Kotlin
backends, typically returning a `Page<T>` envelope shaped like
`{content: [...], totalPages, totalElements, last, ...}`, though some
deployments return the array directly or under `events`/`data`. The fetch
client here defensively unwraps any of `content`, `events`, `data`, or a
bare array, and terminates pagination on the first page shorter than the
requested size (or empty), which is correct for both a `Page<T>` envelope
and a raw array response without needing `totalPages` to be present.

- Spring Data `Pageable`/`Page` reference (for the response shape this
  client anticipates): https://docs.spring.io/spring-data/commons/reference/repositories/core-extensions.html

## Polite crawling

`SPEC.md` section 9.3 sets the rate limit (no more than one request per
second per source) and requires an honest user agent with a contact URL.
The client here sleeps slightly over one second between search pages and
sends a descriptive `User-Agent` header with a contact email, following the
same convention as the RFC 9309 robots.txt spec's expectation that
automated clients identify themselves.

- RFC 9309 (Robots Exclusion Protocol, for the user-agent identification
  convention): https://www.rfc-editor.org/rfc/rfc9309
