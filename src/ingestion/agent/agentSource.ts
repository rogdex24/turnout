import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FetchLike } from "../../utils/http.js";
import { istCalendarDate } from "../../utils/time.js";
import type { FetchedItem, SourceAdapter } from "../sources/types.js";
import type { Harness } from "./harness.js";
import { type AgentRecord, isRejection, parseAgentRecord } from "./record.js";
import { runHarness } from "./runHarness.js";
import { SEEDS, type Seed } from "./seeds.js";
import { makePageLoader, verifyRecord } from "./verify.js";

const PAGE_SLEEP_MS = 1000;
const PROMPT_TEMPLATE = fs.readFileSync(path.join(import.meta.dir, "prompt.md"), "utf8");

export interface AgentSourceOptions {
  seeds?: Seed[];
  /** Used to re-fetch pages. Defaults to fetch. */
  fetchImpl?: FetchLike;
}

export interface AgentReport {
  harness: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  emitted: number;
  accepted: number;
  quarantined: { record: AgentRecord; reason: string }[];
  rejected: { line: number; reason: string }[];
}

export function renderPrompt(seeds: Seed[], now: Date): string {
  const today = istCalendarDate(now);
  const tomorrow = istCalendarDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const list = seeds.map((seed) => `- ${seed.url} : ${seed.note}`).join("\n");
  return PROMPT_TEMPLATE.replace("{{SEEDS}}", list).replaceAll("{{TODAY}}", today).replaceAll("{{TOMORROW}}", tomorrow);
}

/** One harness as a source. Opt-in, and its rows expire by date, not by absence. */
export function agentSource(harness: Harness, options: AgentSourceOptions = {}): SourceAdapter {
  return {
    name: `agent:${harness.name}`,
    optIn: true,
    noDelist: true,
    async fetch({ fetchImpl, sleepMs, now, runId, dataDir }): Promise<FetchedItem[]> {
      const clock = now?.() ?? new Date();
      const runDir = path.resolve(dataDir ?? "data", "agent-runs", `${runId ?? randomUUID()}-${harness.name}`);
      const report: AgentReport = {
        harness: harness.name,
        startedAt: clock.toISOString(),
        finishedAt: clock.toISOString(),
        exitCode: null,
        emitted: 0,
        accepted: 0,
        quarantined: [],
        rejected: [],
      };
      const writeReport = () => {
        report.finishedAt = (now?.() ?? new Date()).toISOString();
        fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));
      };

      const prompt = renderPrompt(options.seeds ?? SEEDS, clock);
      const run = await runHarness(harness, prompt, runDir);
      report.exitCode = run.exitCode;
      const failure = run.timedOut
        ? `${harness.name} timed out after ${harness.timeoutMs} ms`
        : run.exitCode !== 0
          ? `${harness.name} exited ${run.exitCode}: ${run.stderr.trim().slice(-300)}`
          : !fs.existsSync(run.outPath)
            ? `${harness.name} wrote no events.jsonl`
            : null;
      if (failure) {
        writeReport();
        throw new Error(failure);
      }

      const loadPage = makePageLoader(options.fetchImpl ?? fetchImpl ?? fetch, sleepMs ?? PAGE_SLEEP_MS);
      const items: FetchedItem[] = [];
      const lines = fs.readFileSync(run.outPath, "utf8").split("\n");
      for (const [index, text] of lines.entries()) {
        if (!text.trim()) continue;
        const line = index + 1;
        report.emitted += 1;
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          report.rejected.push({ line, reason: "line is not valid JSON" });
          continue;
        }
        const record = parseAgentRecord(json);
        if (isRejection(record)) {
          report.rejected.push({ line, reason: record.reason });
          continue;
        }
        const verdict = await verifyRecord(record, loadPage, clock);
        if (verdict.kind === "accepted") {
          items.push(verdict.item);
          report.accepted += 1;
        } else if (verdict.kind === "quarantined") {
          report.quarantined.push({ record, reason: verdict.reason });
        } else {
          report.rejected.push({ line, reason: verdict.reason });
        }
      }
      writeReport();
      return items;
    },
  };
}
