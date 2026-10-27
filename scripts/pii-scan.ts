/**
 * Fails when a tracked file holds a real-looking Indian mobile number or an email address that is not an example
 * address. Fixtures, docs and tests use 555-01xx numbers and example.com emails (docs/public-repo-checklist.md).
 * `bun scripts/pii-scan.ts` scans every tracked and new unignored text file and prints path:line and the kind, never the value.
 * Public business contacts that are meant to be public go in scripts/pii-allowlist.json.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { TAKEDOWN_EMAIL } from "../src/web/config.js";

export type PiiKind = "phone" | "email";
export interface PiiFinding {
  path: string;
  line: number;
  kind: PiiKind;
}
export interface PiiAllowlist {
  /** Email domains that are never personal: the RFC 2606 example names and the GitHub and Anthropic no-reply senders. */
  emailDomains: string[];
  /** Full addresses that are published on purpose (the takedown address), each with the reason. */
  emails: { value: string; reason: string }[];
  /** SHA-256 of a public business phone number in digits only (country code dropped), so the number is not in the repo. */
  phoneSha256: { sha256: string; reason: string }[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** 10 digits starting 6 to 9, with an optional +91, 91 or 0091 prefix and an optional 5+5 split. Not inside a longer token. */
const PHONE = /(?<![\w.+-])(?:(?:\+|00)?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w-]|\.\d)/g;
/** `image@2x.png`, `name@1.2.3` and similar are not addresses. */
const FILE_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|cjs|ts|tsx|json|md|html|woff2?|ttf|map)$/i;
const SKIPPED_FILE = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|sqlite[\w-]*|db|lock|lockb|pdf)$|(?:^|\/)bun\.lock$/i;

export const ALLOWLIST_PATH = new URL("./pii-allowlist.json", import.meta.url);

export function loadAllowlist(): PiiAllowlist {
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8")) as PiiAllowlist;
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const phoneDigits = (value: string): string => value.replace(/\D/g, "").slice(-10);

function emailAllowed(email: string, allow: PiiAllowlist): boolean {
  const lower = email.toLowerCase();
  const domain = lower.slice(lower.lastIndexOf("@") + 1);
  if (FILE_EXTENSION.test(domain)) return true;
  if (lower === TAKEDOWN_EMAIL.toLowerCase()) return true;
  if (allow.emailDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  return allow.emails.some((e) => e.value.toLowerCase() === lower);
}

/** Scans one file's text. Returns where each unallowed value sits, never the value. */
export function scanText(path: string, text: string, allow: PiiAllowlist = loadAllowlist()): PiiFinding[] {
  const findings: PiiFinding[] = [];
  const lineAt = (index: number): number => {
    let line = 1;
    for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) line++;
    return line;
  };
  for (const m of text.matchAll(EMAIL)) {
    if (!emailAllowed(m[0], allow)) findings.push({ path, line: lineAt(m.index), kind: "email" });
  }
  for (const m of text.matchAll(PHONE)) {
    const hash = sha256(phoneDigits(m[0]));
    if (!allow.phoneSha256.some((p) => p.sha256 === hash)) findings.push({ path, line: lineAt(m.index), kind: "phone" });
  }
  return findings;
}

export function scanFiles(root: string, paths: string[], allow: PiiAllowlist = loadAllowlist()): PiiFinding[] {
  const findings: PiiFinding[] = [];
  for (const path of paths) {
    if (SKIPPED_FILE.test(path)) continue;
    let text: string;
    try {
      text = fs.readFileSync(`${root}/${path}`, "utf8");
    } catch {
      continue;
    }
    findings.push(...scanText(path, text, allow));
  }
  return findings;
}

/** Tracked files plus new files that are not ignored, so a file is scanned before it is first added. */
export function trackedFiles(root: string): string[] {
  const out = Bun.spawnSync(["git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (out.exitCode !== 0) throw new Error(`git ls-files failed: ${out.stderr.toString().trim()}`);
  return out.stdout
    .toString()
    .split("\0")
    .filter((p) => p !== "" && fs.existsSync(`${root}/${p}`));
}

if (import.meta.main) {
  const root = new URL("..", import.meta.url).pathname;
  const findings = scanFiles(root, trackedFiles(root));
  for (const f of findings) console.error(`${f.path}:${f.line}: ${f.kind} that is not a fictional or allowlisted value`);
  if (findings.length > 0) {
    console.error(`${findings.length} finding(s). Use 555-01xx numbers and example.com emails (docs/public-repo-checklist.md).`);
    process.exit(1);
  }
  console.log("pii-scan: no real-looking phone numbers or emails in tracked files");
}
