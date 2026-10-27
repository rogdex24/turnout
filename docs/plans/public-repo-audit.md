# Public repo audit

Status: the scan, the fixes and the history rewrite are done (2026-10-27). The repo is public. Two owner steps are still
open: the GitHub Support purge of `refs/pull/*` and the repository settings (see the sign-off checklist).

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
| Real people in fixtures | 2 Luma fixtures, about 118 name, handle, username and bio fields, covering 11 hosts (2 of them carry only a display name), plus 11 user ids and 3 uploaded avatar photos that link to real profiles | No | Replaced with constant fictional values, `usr-example000000NN` ids and a Luma default avatar on the branch. Old blobs wait for the rewrite |
| Real names in event text | 2 MeraEvents fixtures name a guest speaker in the event description | No. It is public event content, not contact data | Kept. Owner can ask for it to be replaced |
| Local absolute paths with a user name | 3 doc files, 1 each | No | Replaced with `/Users/example/` on the branch. Old blobs wait for the rewrite |
| Committed database (`data/verify/pilot-copy.sqlite` and its `-shm`, `-wal`) | 3 files, about 5.6 MB | No credentials found. 1766 raw payload rows across 6 tables; 4 payload bodies hold a phone-like number and 3 hold a contact keyword; no emails | Removed from the tree on the branch. `.gitignore` widened to `data/**/*.sqlite*`. History copy waits for the rewrite |
| Images (558 files) | 0 private screenshots found. 60 show the public takedown address in the page footer, which is intended. No phone numbers, tokens or local paths seen | No | Nothing to remove, so no doc links needed fixing |
| Commit author metadata | 2 authors: a personal name and address (2 commits) and a bot no-reply address (1 commit) | No | Owner decision, see open questions |
| Hidden pull request refs | `refs/pull/N/head` for every PR opened before the rewrite | No | A rewrite alone does not remove them. GitHub Support purges them before the flip |

The takedown address is public by design and is on the allowlist (`scripts/pii-allowlist.json`).

## What is fixed on the branch

- Fixtures and one source file scrubbed as above; every fixture test still passes.
- `.gitignore` covers `data/**/*.sqlite*`; the committed database files are removed from the tree.
- Guards so it does not come back: `test/noRealPhones.test.ts` (runs in `bun run check`), `scripts/pii-scan.ts` with
  `scripts/pii-allowlist.json`, `.gitleaks.toml`, and `docs/public-repo-checklist.md`.
- CI in `.github/workflows/ci.yml` with a `secrets` job that runs gitleaks 8.30.1 over the commits each push or PR adds and
  over the tree, from a binary checked against a pinned checksum. When the base commit is unknown (a first push or a
  force-push such as the rewrite) it scans all of the head's history, and any gitleaks error fails the job. The full
  history scan is run by hand after the rewrite.

## History rewrite (done 2026-10-27, 22:31 UTC)

The owner flipped the repo to public at about 22:19 UTC, before the rewrite ran. For about 12 minutes the old values were
public on `main`. They stay reachable through the hidden pull request refs until GitHub Support purges them.

What was run, on a fresh mirror with an untouched backup bundle kept outside the repo:

1. `main` was rebuilt as PR 1 plus the six PRs (2 to 7) that had merged into the PR 1 branch instead of `main`. The new tip
   has the same tree as that branch.
2. `git filter-repo` 2.47.0 with `--invert-paths --path-glob 'data/verify/pilot-copy.sqlite*'`, `--replace-text` and
   `--replace-message` (59 expressions, built from the old and scrubbed fixtures, kept outside the repo), and a mailmap
   that maps the personal author address to the owner's GitHub no-reply address.
3. Force-push of `main` only, then deletion of the seven merged `vorflux/*` branches.

Re-scan of the rewritten history before the push:

| Check | Result |
| --- | --- |
| gitleaks 8.30.1, `git` mode over all refs | No leaks |
| Each old literal value, searched in every commit | 0 hits |
| Old token and local path patterns, every commit | 0 hits |
| Personal email addresses, every commit | 0 |
| Phone-like numbers in history that are not in the tip | 0 (the tip ones are the allowed fictional and public values) |
| `sqlite` paths in `git log --all` | 0 |
| Commit author and committer addresses | GitHub no-reply addresses only |
| `bun scripts/pii-scan.ts` and `bun run check` on the new tip | Clean, 389 tests pass |
| CI on the new `main` (run 40595341731) | Pass |

## What the rewrite plan was

Everything above only changes the tip. The old values are still in earlier commits, and nothing is public yet, so the
rewrite is the fix.

1. Remove `data/verify/pilot-copy.sqlite*` from every commit (`--invert-paths`).
2. Replace the old values in old blobs with `git filter-repo --replace-text`. The expressions file has 37 lines: 1 phone,
   1 organiser name, 1 personal email, 1 token pattern, 1 local path pattern, 11 host names, 7 JSON field patterns,
   11 user ids and 3 avatar URLs.
   It holds the old values, so it stays at `/tmp/audit/replace.txt` (mode 600) and is never committed.
3. Rewrite the personal author name and address on 2 commits to the owner's GitHub no-reply address with a mailmap.
4. Ask GitHub Support to purge `refs/pull/*` and cached views.

A dry run on a throwaway copy of the mirror is recorded in `/tmp/audit/rewrite-plan.md`: after the rewrite, gitleaks over
all history and the PII sweep over all commits were clean, and none of the old values appeared in any blob.

## Sign-off checklist

Do in this order. The long form with commands is in `docs/public-repo-checklist.md`.

- [ ] Rotate any real secret first. The audit found none; confirm that against your own list of credentials.
- [x] Approve the rewrite plan, including the author metadata choice (2026-10-27: mailmap to the no-reply address).
- [x] Run the rewrite on a fresh mirror and re-scan it (gitleaks history, PII sweep, search for each old value).
- [x] Force-push heads and tags only, never `--mirror`.
- [ ] Recreate the repo or ask GitHub Support to purge `refs/pull/*` and cached views.
- [ ] Re-clone every working copy. The agent machine has a fresh clone; the owner's own clones still need it.
- [x] Flip the repo to public. (Done before the rewrite and the purge, out of order; see above.)
- [ ] Turn on secret scanning and push protection.
- [ ] Make `ci-gate` the required check on `main`.

## Owner decisions (2026-10-27)

1. The personal commit author address is replaced with the owner's GitHub no-reply address through a mailmap.
2. GitHub Support purges the hidden pull request refs. The repo stays private until the purge is confirmed.
3. The takedown address stays public and stays on the allowlist.
4. The local gitleaks check is the `gitleaks-staged` pre-commit job in `lefthook.yml` (added with the workspaces change).
