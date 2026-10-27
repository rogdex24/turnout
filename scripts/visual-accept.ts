/**
 * `bun scripts/visual-accept.ts <run-id> [--repo owner/name] [--baselines <dir>]`
 *
 * Pulls the screenshots of a CI run into the visual baselines. Each artifact named `visual-shots-<target>` (one per device job, with
 * `<target>` one of android-small, android-large, ios-small, ios-large) replaces the folder `<baselines>/<target>`. The PNGs keep their
 * path inside the artifact, `<story>/<theme>-<text>.png`.
 *
 * Nothing is committed: the script leaves the change in the working tree for a reviewed commit. Review the diff images of the run
 * first (`bun scripts/visual-diff.ts`), because accepting a shot makes it the truth for every later run. Needs the GitHub CLI
 * (`gh auth login`) and git-lfs, so the PNGs are stored as LFS pointers (see .gitattributes).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Where the baselines live. Keep in step with .gitattributes and .lfsconfig. */
export const DEFAULT_BASELINES_DIR = "apps/mobile/.maestro/visual/baselines";
/** The CI artifact name prefix; the rest of the name is the target folder. */
export const ARTIFACT_PREFIX = "visual-shots-";

/** Every `.png` under `dir`, as paths relative to it. */
function listPngs(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) found.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return found.sort();
}

/**
 * Copies the PNGs of each downloaded artifact folder (`<downloaded>/visual-shots-<target>`) into `<baselinesDir>/<target>`, replacing
 * that target's old shots so a removed shot does not linger. Returns the target folders written and how many shots each got.
 */
export function placeShots(downloadedDir: string, baselinesDir: string): Record<string, number> {
  const placed: Record<string, number> = {};
  for (const entry of fs.readdirSync(downloadedDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(ARTIFACT_PREFIX)) continue;
    const target = entry.name.slice(ARTIFACT_PREFIX.length);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(target)) throw new Error(`Unexpected artifact name ${entry.name}`);
    const source = path.join(downloadedDir, entry.name);
    const shots = listPngs(source);
    if (shots.length === 0) throw new Error(`${entry.name} holds no PNGs`);
    const folder = path.join(baselinesDir, target);
    fs.rmSync(folder, { recursive: true, force: true });
    for (const shot of shots) {
      fs.mkdirSync(path.dirname(path.join(folder, shot)), { recursive: true });
      fs.copyFileSync(path.join(source, shot), path.join(folder, shot));
    }
    placed[target] = shots.length;
  }
  return placed;
}

function run(command: string[], what: string): string {
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(`${what} failed: ${result.stderr.toString().trim() || `exit code ${result.exitCode}`}`);
  return result.stdout.toString();
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const runId = args[0];
  if (!runId || !/^\d+$/.test(runId)) {
    console.error("Usage: bun scripts/visual-accept.ts <run-id> [--repo owner/name] [--baselines <dir>]");
    return 2;
  }
  const repo = readFlag(args, "--repo");
  const baselinesDir = readFlag(args, "--baselines") ?? DEFAULT_BASELINES_DIR;
  const repoFlags = repo ? ["-R", repo] : [];
  try {
    // Without git-lfs the PNGs would be committed as plain blobs and count against the repository size for good.
    run(["git", "lfs", "version"], "git lfs (install git-lfs and run `git lfs install`)");
    const dirty = run(["git", "status", "--porcelain", "--", baselinesDir], "git status").trim();
    if (dirty)
      throw new Error(
        `${baselinesDir} has uncommitted changes. Commit or discard them first so the accepted shots are a commit of their own.`,
      );

    const apiPath = repo ? `repos/${repo}/actions/runs/${runId}/artifacts` : `repos/{owner}/{repo}/actions/runs/${runId}/artifacts`;
    const names = run(["gh", "api", "--paginate", apiPath, "--jq", ".artifacts[].name"], "gh api")
      .split("\n")
      .map((name) => name.trim())
      .filter((name) => name.startsWith(ARTIFACT_PREFIX));
    if (names.length === 0) throw new Error(`Run ${runId} has no artifacts named ${ARTIFACT_PREFIX}<target>`);

    const downloaded = fs.mkdtempSync(path.join(os.tmpdir(), "visual-accept-"));
    try {
      // One download per artifact: `gh run download` with a single name extracts straight into --dir, with several it nests by name.
      for (const name of names)
        run(["gh", "run", "download", runId, ...repoFlags, "-n", name, "-D", path.join(downloaded, name)], `gh run download ${name}`);
      const placed = placeShots(downloaded, baselinesDir);
      for (const [target, count] of Object.entries(placed)) console.log(`${target}: ${count} shots`);
    } finally {
      fs.rmSync(downloaded, { recursive: true, force: true });
    }
    console.log(
      `\nShots written to ${baselinesDir}. Review them, then commit: git add ${baselinesDir} && git commit. Do not push without a review.`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
