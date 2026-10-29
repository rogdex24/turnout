/**
 * The rules behind `bun scripts/scan-bundle.ts`, which looks through an `expo export` directory for secrets that must not
 * ship in the JS bundle. They are plain functions so Jest can test them. A Hermes bundle is bytecode, so the scan reads the
 * printable runs out of the bytes (the string table is stored as plain text) and matches without anchors.
 */

export interface ScanRule {
  name: string;
  pattern: RegExp;
}

/** Things that are secret or private by shape. Each pattern is global so every hit in a text is reported. */
export const RULES: readonly ScanRule[] = [
  { name: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "aws-access-key", pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g },
  { name: "private-key-block", pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { name: "slack-token", pattern: /xox[abprs]-[0-9A-Za-z-]{10,}/g },
  { name: "github-token", pattern: /gh[pousr]_[0-9A-Za-z]{36,}/g },
  { name: "stripe-secret-key", pattern: /[sr]k_live_[0-9A-Za-z]{16,}/g },
  { name: "meta-access-token", pattern: /(?<![0-9A-Za-z+/])EAA[0-9A-Za-z]{100,}(?![0-9A-Za-z+/=])/g },
  { name: "jwt", pattern: /eyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/g },
  { name: "url-with-password", pattern: /https?:\/\/[^\s/:@"']+:[^\s/@"']{3,}@[^\s/"']+/g },
  { name: "private-network-url", pattern: /https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+\.\d+/g },
  {
    name: "inline-secret",
    pattern: /(?:secret|password|passwd|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*["'][0-9A-Za-z+/_=-]{20,}["']/gi,
  },
];

/** What a development or e2e build points at. A preview or production bundle that holds one was built with the wrong variant. */
export const DEV_ONLY_STRINGS: readonly string[] = [
  "10.0.2.2",
  "com.turnout.app.dev",
  "com.turnout.app.e2e",
  "turnout-dev://",
  "turnout-e2e://",
  "EXPO_PUBLIC_ALLOW_CAPTURE=1",
];

export interface Finding {
  rule: string;
  /** Where it was found: a path relative to the export directory. */
  file: string;
  /** The first four characters and the length, never the whole value, so a log cannot leak what the scan found. */
  redacted: string;
}

const redact = (value: string) => `${value.slice(0, 4)}...(${value.length} chars)`;

/** Runs of printable ASCII at least `minLength` long. Everything else (bytecode, images) splits the runs. */
export function printableRuns(bytes: Uint8Array, minLength = 8): string[] {
  const runs: string[] = [];
  let start = -1;
  for (let i = 0; i <= bytes.length; i++) {
    const byte = bytes[i];
    const printable = byte !== undefined && byte >= 0x20 && byte < 0x7f;
    if (printable) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= minLength) runs.push(Buffer.from(bytes.subarray(start, i)).toString("latin1"));
      start = -1;
    }
  }
  return runs;
}

/** Matches every rule and every forbidden string against one text. */
export function scanText(text: string, file: string, forbid: readonly string[] = []): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) findings.push({ rule: rule.name, file, redacted: redact(match[0]) });
  }
  for (const needle of forbid) {
    if (text.includes(needle)) findings.push({ rule: "forbidden-string", file, redacted: needle });
  }
  return findings;
}

/** Scans a file's bytes: as text when it has no NUL bytes, as printable runs otherwise. Runs are joined so a match is never split. */
export function scanBytes(bytes: Uint8Array, file: string, forbid: readonly string[] = []): Finding[] {
  const text = bytes.includes(0) ? printableRuns(bytes).join("\n") : Buffer.from(bytes).toString("utf8");
  return scanText(text, file, forbid);
}
