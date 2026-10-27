# Public repo checklist

Read this before the repo is made public, and again before any PR that adds fixtures, screenshots, docs or data files.
The one-off audit that produced this list is in `docs/plans/public-repo-audit.md`.

## Rules for every change

1. Fictional phone numbers use the 555-01xx range (for example 555-0101). Fictional emails use `example.com`. Fictional
   people and organisations get obviously fake names ("Example Host").
2. Captured samples of third-party pages and APIs are scrubbed before they are committed: contact fields, host and attendee
   names, social handles, session or access tokens, signed URLs, and anything else that belongs to a real person.
3. Database files never go in git. `.gitignore` covers `data/**/*.sqlite*` (the main file and its `-shm` and `-wal` files).
   Snapshots that matter live outside the repo.
4. Screenshots show only the fixture server or fictional data. Check them for real names, emails, phone numbers, tokens and
   local paths before committing. A footer with the public takedown address is fine.
5. Docs do not contain local absolute paths with a user name. Write `/Users/example/...` if a path is needed.
6. No real credential ever goes in a file, a commit message or a test. Use environment variables and a placeholder.
7. The only real contact address allowed in the repo is the published takedown address
   (`TAKEDOWN_EMAIL` in `src/web/config.ts`). Public business phone numbers, if ever needed, go in
   `scripts/pii-allowlist.json` as a SHA-256 of the digits so the number itself stays out of the repo.

## Automatic guards

| Guard | What it catches | Where it runs |
| --- | --- | --- |
| `test/noRealPhones.test.ts` | Real-looking Indian mobile numbers and non-example emails in tracked files | `bun run check`, so pre-commit and CI `check` |
| `scripts/pii-scan.ts` | The same scan, runnable by hand (`bun scripts/pii-scan.ts`); prints path, line and kind, never the value | by hand |
| `.gitleaks.toml` with the default rules | API keys, tokens, private keys. CI scans the tree and the commits each PR or push adds; the full history scan is by hand | CI `secrets` job; by hand with the commands below |
| `.gitignore` `data/**/*.sqlite*` | Database files | git |

By hand, with gitleaks 8.30.1 installed:

```
gitleaks dir --redact --no-banner .
gitleaks git --redact --no-banner --log-opts="--all" .
bun scripts/pii-scan.ts
```

`--redact` keeps secret values out of the output. Do not paste raw gitleaks reports into issues or chat.

## Before the repo goes public

Do these in order. Steps 1 to 3 need the owner; do not skip ahead.

1. **Rotate first.** If any scan finds a real secret, rotate or revoke it at the provider before anything else. A rewrite
   does not make a leaked secret safe, because forks, clones and caches may already hold it.
2. **Approve the history rewrite.** The plan lives in `/tmp/audit/rewrite-plan.md` on the machine that ran the audit and is
   summarised in `docs/plans/public-repo-audit.md`. It removes the database files from every commit and replaces scrubbed
   fixture values and local paths in old blobs. The replacement expressions file is never committed, because it holds the
   old values.
3. **Rewrite on a fresh mirror, then re-scan.**
   - `git clone --mirror <origin> turnout.git`, and keep an untouched second copy as a backup.
   - Record the version: `git filter-repo --version` (the dry run used 2.47.0).
   - Run `git filter-repo --invert-paths --path-glob 'data/verify/pilot-copy.sqlite*' --replace-text <expressions file>`
     with the audited expressions file kept outside the repo.
   - Re-scan the result: `gitleaks git --redact --log-opts="--all"`, the PII sweep over every commit, and a search of all
     blobs for each old value (the audit script does this). Everything must come back empty.
4. **Push heads and tags only.** From the rewritten mirror:
   `git push --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'`. Do not use `git push --mirror`:
   GitHub rejects updates to its hidden `refs/pull/*` refs and the push would fail or half-apply.
5. **Deal with pull request refs.** GitHub keeps `refs/pull/<n>/head` and still serves the old objects after a rewrite, so the
   old blobs stay reachable by SHA. Either recreate the repository from the rewritten mirror (new repo, same name after
   deleting the old one), or ask GitHub Support to run a sensitive data removal and purge cached views. Do this before the
   flip. Closed or merged PRs count.
6. **Re-clone everywhere.** Every other clone and worktree must be deleted and cloned again. An old clone that is pushed back
   re-introduces the old history.
7. **Flip the repo public.** Settings, General, Danger Zone, Change visibility.
8. **Turn on secret scanning and push protection.** Settings, Code security. They only work on the public repo (or with
   Advanced Security) and are the last line of defence for new commits.
9. **Mark `ci-gate` as the required status check** on `main`, so the `secrets` job blocks merges.

## Commit author metadata

Git history carries each author's name and email. The audit found two authors. If a personal address should not be public,
add a `--mailmap` file to the rewrite. For this repo the owner chose the mailmap to the GitHub no-reply address
(see the owner decisions in the audit plan).
