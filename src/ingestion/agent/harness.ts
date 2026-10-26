/** One coding-agent CLI the operator already pays for. */
export interface Harness {
  name: string; // "grok"
  /** Full command line. The working directory is the run directory. */
  argv(prompt: string): string[];
  timeoutMs: number;
  /** Extra environment for the child, on top of ours. */
  env?: Record<string, string>;
}

const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * What grok can still do, as configured here (flags checked against grok 1.0.50
 * --help and docs, and run live in the pilot): --tools is an allowlist of built-in
 * tools, web_search, web_fetch and write_file. No shell, no file edit, no subagents.
 * Per its docs, MCP tools stay available, so any MCP server in the operator's grok
 * config is still reachable (a Playwright server loaded in the pilot). write_file is
 * not confined to the run directory by a flag. It also loads the operator's global
 * rules and skills; the prompt does not depend on any of that.
 *
 * Adding a harness later is one entry in this table plus one registry line.
 */
export const HARNESSES = {
  grok: {
    name: "grok",
    argv: (prompt) => [
      "grok",
      "-p",
      prompt,
      "--output-format",
      "json",
      "--max-turns",
      "40",
      "--always-approve",
      "--tools",
      "web_search,web_fetch,write_file",
      "--no-subagents",
    ],
    timeoutMs: TIMEOUT_MS,
    env: { GROK_MEMORY: "0", GROK_WEB_FETCH: "1" },
  },
} satisfies Record<string, Harness>;
