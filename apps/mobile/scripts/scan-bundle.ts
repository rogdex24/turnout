/**
 * Scans an `expo export` directory for secrets and development settings that must not ship in the JS bundle.
 *
 *   bunx expo export --platform android --output-dir /tmp/turnout-export
 *   bun scripts/scan-bundle.ts /tmp/turnout-export [--release] [--forbid <text>]...
 *
 * `--release` also fails on the development and e2e identifiers (DEV_ONLY_STRINGS), for a preview or production export.
 * It prints rule, file and the first four characters of a hit, never the whole value, and exits 1 on any finding.
 * Rules and the reasoning are in config/bundleScan.ts and docs/security/masvs-app.md (MASVS-CODE).
 */
import fs from "node:fs";
import path from "node:path";
import { DEV_ONLY_STRINGS, type Finding, scanBytes } from "../config/bundleScan";

/** Images and fonts are assets, not code. The bundle, the CSS and the manifest are what carry strings. */
const SKIPPED = /\.(?:png|jpe?g|gif|webp|ico|ttf|otf|woff2?|mp3|mp4)$/i;

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function parseArgs(argv: string[]): { dir: string; forbid: string[] } {
  let dir: string | undefined;
  const forbid: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--release") forbid.push(...DEV_ONLY_STRINGS);
    else if (arg === "--forbid") {
      const value = argv[++i];
      if (!value) throw new Error("--forbid needs a value");
      forbid.push(value);
    } else if (arg && !arg.startsWith("--") && !dir) dir = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!dir) throw new Error("usage: bun scripts/scan-bundle.ts <export dir> [--release] [--forbid <text>]...");
  return { dir, forbid };
}

function main(): number {
  const { dir, forbid } = parseArgs(process.argv.slice(2));
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) throw new Error(`no such directory: ${root}`);
  const findings: Finding[] = [];
  let scanned = 0;
  let bundles = 0;
  for (const file of walk(root)) {
    if (SKIPPED.test(file)) continue;
    const rel = path.relative(root, file);
    if (/\.(?:hbc|js|bundle)$/.test(file)) bundles++;
    findings.push(...scanBytes(fs.readFileSync(file), rel, forbid));
    scanned++;
  }
  // An export with no bundle would pass for the wrong reason, so that is a failure too.
  if (bundles === 0) throw new Error(`no JS bundle under ${root}. Did the export run?`);
  for (const f of findings) console.error(`${f.file}: ${f.rule}: ${f.redacted}`);
  console.log(
    `scanned ${scanned} files (${bundles} bundle${bundles === 1 ? "" : "s"}), ${findings.length} finding${findings.length === 1 ? "" : "s"}`,
  );
  return findings.length === 0 ? 0 : 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
