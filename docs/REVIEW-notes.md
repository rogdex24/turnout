# Phase 1 review notes (2026-09-08 ~05:10 IST)

## What was checked
- `src/sync.ts` store / reconcile / dedupe
- `src/dedupe.ts` fuzzy grouping
- `src/site.ts` listing + detail
- `src/area.ts` inference
- Tier A adapters under `src/sources/` (spot-check; fixtures already cover parse paths)

## Findings

### Already correct
- Listing and detail already filter `is_canonical = 1` — fuzzy-dedupe losers do not double-list.
- Failed sources are isolated; reconcile only touches succeeded sources (no mass delist on adapter death).
- Fuzzy dedupe skips same-source multi-slot pairs; busy venue clusters raise the title threshold.

### Fixed this pass
- **Empty-venue hold:** `src/site.ts` filters null/empty/TBD `venue_name` on listing and detail; DB rows unchanged.
- **`area=other` ~25% → ~8.5%.** Expanded `AREA_ALIASES` from live DB venue/address samples (HITEX/HICC, Knowledge City/Raidurg, Red Rhino, Mindspace/Smaaash, Lakdikapul/FTCCI, Gandipet/Narsingi, Khajaguda, KPHB, Golconda, etc.).
- **Alias order bug:** broad `Serilingampalle(M)` and early `Hitech City` tokens were stealing clearer neighbourhoods (e.g. Starbucks Gachibowli → hitec-city; Smaaash Inorbit → hitec-city). Reordered: known venues + neighbourhood tokens before corridor/mandal leftovers. Regression tests added.
- Re-backfilled `event.area` via `.agent-runs/backfill-area.mjs`.

### Not bugs / deferred
- **Public JSON `/api/events`:** SPEC puts JSON endpoint, ICS, `llms.txt`, MCP in **Phase 2**, not Phase 1. Skipped.
- Remaining `area=other` (~74) is mostly TBA / Online / bare "Hyderabad" / out-of-enum locales (Himayatnagar, Shadnagar, Ramachandrapuram). Needs a venue table (Phase 2) more than more regex.
- Detail URLs for non-canonical duplicates 404 by design (listing only links canonical).
- ~~Empty `venue_name` on listing~~ **DONE:** listing + detail hold null/empty/TBD venues (still in DB; ~12 rows). Test: `listing and detail hold empty-venue rows`.

### Minor watchlist (not changed)
- `categories LIKE '%"comedy"%'` is fine for enum slugs; stay away from free-text category filters.
- Dedupe is O(n²); fine at ~900 active, revisit if multi-k.
- BookMyShow still needs curl --http1.1 live (Bun fetch → CF 403) — documented in research note.
