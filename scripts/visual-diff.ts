/**
 * `bun scripts/visual-diff.ts <baseline-dir> <candidate-dir> [--report <dir>] [--threshold 0.1] [--ignore x1,y1,x2,y2]...`
 *
 * Compares two folders of PNGs with odiff, file by file, matched on the path relative to each folder. Writes `report.json`, `report.md`
 * and a diff image per changed file into the report folder (default `visual-diff-report`). Exits 0 when every shot matches, 1 when any
 * shot changed, is missing from the candidate, has no baseline or changed size, and 2 on a usage error or when there is nothing to compare.
 * Each `--ignore` box (pixels, corners included) is left out of every comparison, for system chrome the app does not draw.
 */
import fs from "node:fs";
import path from "node:path";
import { compare } from "odiff-bin";

/** The planned threshold (plan F20): odiff's per-pixel colour tolerance, from 0 to 1. */
export const DEFAULT_THRESHOLD = 0.1;
export const DEFAULT_REPORT_DIR = "visual-diff-report";

/** A box in pixels, both corners included, as odiff takes it. */
export type Region = { x1: number; y1: number; x2: number; y2: number };
export type ShotStatus = "same" | "changed" | "layout-changed" | "missing" | "new";
export type ShotResult = { file: string; status: ShotStatus; diffCount?: number; diffPercentage?: number; diffImage?: string };
export type DiffReport = {
  baselineDir: string;
  candidateDir: string;
  threshold: number;
  ignore: Region[];
  counts: Record<ShotStatus, number>;
  ok: boolean;
  shots: ShotResult[];
};

/** Every `.png` under `dir`, as paths relative to it with forward slashes, sorted. */
function listPngs(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) found.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return found.sort();
}

/** Compares the two folders and writes the report. Throws when a folder is missing or both are empty. */
export async function compareFolders(
  baselineDir: string,
  candidateDir: string,
  options: { reportDir?: string; threshold?: number; ignore?: Region[] } = {},
): Promise<DiffReport> {
  const reportDir = options.reportDir ?? DEFAULT_REPORT_DIR;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const ignore = options.ignore ?? [];
  for (const dir of [baselineDir, candidateDir]) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`${dir} is not a folder`);
  }
  const baseline = listPngs(baselineDir);
  const candidate = listPngs(candidateDir);
  if (baseline.length === 0 && candidate.length === 0) throw new Error("Both folders hold no PNGs, so there is nothing to compare");

  fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(reportDir, "diffs"), { recursive: true });

  const shots: ShotResult[] = [];
  const candidateSet = new Set(candidate);
  for (const file of baseline) {
    if (!candidateSet.has(file)) {
      shots.push({ file, status: "missing" });
      continue;
    }
    const diffImage = path.join(reportDir, "diffs", file);
    fs.mkdirSync(path.dirname(diffImage), { recursive: true });
    const result = await compare(path.join(baselineDir, file), path.join(candidateDir, file), diffImage, {
      threshold,
      failOnLayoutDiff: true,
      noFailOnFsErrors: true,
      ...(ignore.length > 0 ? { ignoreRegions: ignore } : {}),
    });
    if (result.match) shots.push({ file, status: "same" });
    else if (result.reason === "pixel-diff") {
      shots.push({ file, status: "changed", diffCount: result.diffCount, diffPercentage: result.diffPercentage, diffImage });
    } else if (result.reason === "layout-diff") shots.push({ file, status: "layout-changed" });
    else throw new Error(`odiff could not read ${result.file}`);
  }
  const baselineSet = new Set(baseline);
  for (const file of candidate) if (!baselineSet.has(file)) shots.push({ file, status: "new" });
  shots.sort((a, b) => a.file.localeCompare(b.file));

  const counts: Record<ShotStatus, number> = { same: 0, changed: 0, "layout-changed": 0, missing: 0, new: 0 };
  for (const shot of shots) counts[shot.status] += 1;
  const report: DiffReport = { baselineDir, candidateDir, threshold, ignore, counts, ok: counts.same === shots.length, shots };

  fs.writeFileSync(path.join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, "report.md"), renderMarkdown(report));
  return report;
}

const NOTES: Record<ShotStatus, string> = {
  same: "matches",
  changed: "pixels differ",
  "layout-changed": "image size differs",
  missing: "in the baseline, not in the candidate",
  new: "in the candidate, no baseline yet",
};

function renderMarkdown(report: DiffReport): string {
  const { counts } = report;
  const lines = [
    `# Visual diff: ${report.ok ? "no differences" : "differences found"}`,
    "",
    `Baseline \`${report.baselineDir}\`, candidate \`${report.candidateDir}\`, odiff threshold ${report.threshold}.${report.ignore.map((r) => ` Box ${r.x1},${r.y1} to ${r.x2},${r.y2} is not compared.`).join("")}`,
    "",
    `${report.shots.length} shots: ${counts.same} same, ${counts.changed} changed, ${counts["layout-changed"]} changed size, ${counts.missing} missing, ${counts.new} new.`,
  ];
  const problems = report.shots.filter((shot) => shot.status !== "same");
  if (problems.length > 0) {
    lines.push("", "| Shot | Result | Different pixels |", "|---|---|---|");
    for (const shot of problems) {
      const pixels = shot.diffCount === undefined ? "" : `${shot.diffCount} (${shot.diffPercentage}%)`;
      lines.push(`| ${shot.file} | ${NOTES[shot.status]} | ${pixels} |`);
    }
    lines.push(
      "",
      "Diff images for changed shots are in `diffs/`. To accept a change on purpose, run `bun scripts/visual-accept.ts <run-id>` and review the commit.",
    );
  }
  return `${lines.join("\n")}\n`;
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** `x1,y1,x2,y2` as a Region, or undefined when it is not four whole numbers with each corner at or after the first. */
export function parseRegion(value: string): Region | undefined {
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return undefined;
  const [x1, y1, x2, y2] = parts.map(Number) as [number, number, number, number];
  return x2 >= x1 && y2 >= y1 ? { x1, y1, x2, y2 } : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const valueIndexes = new Set(args.flatMap((arg, index) => (["--report", "--threshold", "--ignore"].includes(arg) ? [index + 1] : [])));
  const ignoreValues = args.filter((_, index) => index > 0 && args[index - 1] === "--ignore");
  const ignore = ignoreValues.map(parseRegion);
  const positional = args.filter((arg, index) => !arg.startsWith("--") && !valueIndexes.has(index));
  const [baselineDir, candidateDir] = positional;
  const threshold = Number(readFlag(args, "--threshold") ?? DEFAULT_THRESHOLD);
  const regions = ignore.filter((region) => region !== undefined);
  if (!baselineDir || !candidateDir || positional.length > 2 || !(threshold >= 0 && threshold <= 1) || regions.length < ignore.length) {
    console.error(
      "Usage: bun scripts/visual-diff.ts <baseline-dir> <candidate-dir> [--report <dir>] [--threshold 0.1] [--ignore x1,y1,x2,y2]...",
    );
    return 2;
  }
  try {
    const reportDir = readFlag(args, "--report") ?? DEFAULT_REPORT_DIR;
    const report = await compareFolders(baselineDir, candidateDir, { reportDir, threshold, ignore: regions });
    for (const shot of report.shots) if (shot.status !== "same") console.log(`${shot.status.padEnd(14)} ${shot.file}`);
    const { counts } = report;
    console.log(
      `${report.shots.length} shots: ${counts.same} same, ${counts.changed + counts["layout-changed"]} changed, ${counts.missing} missing, ${counts.new} new. Report in ${reportDir}`,
    );
    return report.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) process.exit(await main());
