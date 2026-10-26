import fs from "node:fs";
import path from "node:path";
import type { Harness } from "./harness.js";

export interface HarnessRun {
  exitCode: number | null; // null when the timeout killed it
  timedOut: boolean;
  stdout: string;
  stderr: string;
  /** Where the agent was told to write; exists only if it did. */
  outPath: string;
}

/** Runs one harness in runDir, which receives prompt.md, stdout.txt and stderr.txt. */
export async function runHarness(harness: Harness, prompt: string, runDir: string): Promise<HarnessRun> {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "prompt.md"), prompt);

  const child = Bun.spawn(harness.argv(prompt), {
    cwd: runDir,
    env: { ...process.env, ...harness.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, harness.timeoutMs);

  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const exitCode = await child.exited;
  clearTimeout(timer);

  fs.writeFileSync(path.join(runDir, "stdout.txt"), stdout);
  fs.writeFileSync(path.join(runDir, "stderr.txt"), stderr);
  return { exitCode: timedOut ? null : exitCode, timedOut, stdout, stderr, outPath: path.join(runDir, "events.jsonl") };
}
