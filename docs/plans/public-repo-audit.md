# Public repo audit

Status: day 1 scan and day 2 non-destructive fixes done on branch `vorflux/m1-public-repo-audit`, 2026-10-27.
The history rewrite is planned and dry-run tested, and waits for the owner's approval.

This file lists findings by category with counts. It never contains the values. Raw paths and line numbers are kept outside
the repo (`/tmp/audit/findings.md` on the audit machine). The standing rules and the sign-off steps are in
`docs/public-repo-checklist.md`.

## What was scanned

- All history of the mirror: 4 commits on 2 branches, plus the hidden `refs/pull/1/head` (it points at the same tip as the PR branch).
- The working tree, with gitleaks 8.30.1 (`git` and `dir` modes, default rules) and a PII sweep (Indian mobile number and email patterns) over every tracked text file.
- The database file committed under `data/verify/`, queried read-only for counts only.
- Every committed image (558 files under `docs/`), by OCR for text plus contact sheets viewed by eye.

## Findings by category

| Category | Count | Real secret to rotate? | Status |
| --- | --- | --- | --- |
| API keys, tokens, private keys (gitleaks) | 1 rule hit in 1 fixture file, same hit in history and tree | No. It is a public image-access token that a third-party site embeds in its own page, captured in a sample | Replaced with a placeholder UUID on the branch (2 occurrences). Old blob waits for the rewrite |
| Phone-like numbers in fixtures | 2 fixture files, 1 distinct number (a real organiser contact captured from a listing page) | Not a secret; it is personal data | Replaced with `555-0101` on the branch. Old blobs wait for the rewrite |
| Emails in source | 1 (a personal address used as the HTTP contact in the User-Agent string, `src/utils/http.ts`) | Not a secret; personal data | Changed to the published takedown address on the branch. Old blob waits for the rewrite |
| Real people in fixtures | 2 Luma fixtures, about 63 name, handle and bio fields, covering 9 hosts | No | Replaced with constant fictional values on the branch. Old blobs wait for the rewrite. Host avatar URLs on the Luma CDN remain; they identify nobody by themselves |
| Local absolute paths with a user name | 3 doc files, 1 each | No | Replaced with `/Users/example/` on the branch. Old blobs wait for the rewrite |
| Committed database (`data/verify/pilot-copy.sqlite` and its `-shm`, `-wal`) | 3 files, about 5.6 MB | No credentials found. 1766 raw payload rows across 6 tables; 4 payload bodies hold a phone-like number and 3 hold a contact keyword; no emails | Removed from the tree on the branch. `.gitignore` widened to `data/**/*.sqlite*`. History copy waits for the rewrite |
| Images (558 files) | 0 private screenshots found. 60 show the public takedown address in the page footer, which is intended. No phone numbers, tokens or local paths seen | No | Nothing to remove, so no doc links needed fixing |
| Commit author metadata | 2 authors: a personal name and address (2 commits) and a bot no-reply address (1 commit) | No | Owner decision, see open questions |
| Hidden pull request ref | 1 (`refs/pull/1/head`) | No | A rewrite alone does not remove it. See the sign-off steps |

The takedown address is public by design and is on the allowlist (`scripts/pii-allowlist.json`).

## What is fixed on the branch

- Fixtures and one source file scrubbed as above; every fixture test still passes.
- `.gitignore` covers `data/**/*.sqlite*`; the committed database files are removed from the tree.
- Guards so it does not come back: `test/noRealPhones.test.ts` (runs in `bun run check`), `scripts/pii-scan.ts` with
  `scripts/pii-allowlist.json`, `.gitleaks.toml`, and `docs/public-repo-checklist.md`.
- CI in `.github/workflows/ci.yml` with a `secrets` job that runs gitleaks 8.30.1 over history and the tree, from a binary
  checked against a pinned checksum.

## What waits for the history rewrite

Everything above only changes the tip. The old values are still in earlier commits, and nothing is public yet, so the
rewrite is the fix.

1. Remove `data/verify/pilot-copy.sqlite*` from every commit (`--invert-paths`).
2. Replace the old values in old blobs with `git filter-repo --replace-text`. The expressions file has 21 lines: 1 phone,
   1 organiser name, 1 personal email, 1 token pattern, 1 local path pattern, 9 host names, and 7 JSON field patterns.
   It holds the old values, so it stays at `/tmp/audit/replace.txt` (mode 600) and is never committed.
3. Optionally rewrite author metadata with a mailmap (owner's call).
4. Deal with `refs/pull/1/head`, by recreating the repo or a GitHub Support purge.

A dry run on a throwaway copy of the mirror is recorded in `/tmp/audit/rewrite-plan.md`: after the rewrite, gitleaks over
all history and the PII sweep over all commits were clean, and none of the old values appeared in any blob.

## Sign-off checklist

Do in this order. The long form with commands is in `docs/public-repo-checklist.md`.

- [ ] Rotate any real secret first. The audit found none; confirm that against your own list of credentials.
- [ ] Approve the rewrite plan, including the author metadata choice.
- [ ] Run the rewrite on a fresh mirror and re-scan it (gitleaks history, PII sweep, search for each old value).
- [ ] Force-push heads and tags only, never `--mirror`.
- [ ] Recreate the repo or ask GitHub Support to purge `refs/pull/*` and cached views.
- [ ] Re-clone every working copy.
- [ ] Flip the repo to public.
- [ ] Turn on secret scanning and push protection.
- [ ] Make `ci-gate` the required check on `main`.

## Open questions for the owner

1. Do you want the personal commit author address replaced (mailmap), or kept as is?
2. Recreate the repo or ask GitHub Support to purge the hidden pull request ref?
3. Is the real takedown address meant to stay public? It is on the allowlist on that assumption.
4. A pre-commit gitleaks hook is not in `lefthook.yml`, which another stream owns. Add one there if you want a local check
   as well as CI.
