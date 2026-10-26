// Stands in for an agent CLI. Run in the harness run directory as
// `bun fake-harness.ts <events.jsonl path | !fail | !nofile | !hang>`.
import fs from "node:fs";

const arg = process.argv[2]!;
if (arg === "!fail") {
  console.error("boom");
  process.exit(1);
}
if (arg === "!hang") await new Promise((resolve) => setTimeout(resolve, 60_000));
else if (arg !== "!nofile") fs.copyFileSync(arg, "events.jsonl");
