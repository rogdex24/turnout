import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

/** Run depcruise on a throwaway tree that holds the repo's rules and a few fixture files. */
function cruise(files: Record<string, string>): { exitCode: number; output: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "depcruise-"));
  try {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, ".dependency-cruiser.json"), "utf8"));
    delete config.options.tsConfig;
    fs.writeFileSync(path.join(dir, ".dependency-cruiser.json"), JSON.stringify(config));
    for (const [name, source] of Object.entries(files)) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }
    const result = Bun.spawnSync([path.join(ROOT, "node_modules/.bin/depcruise"), "--config", ".dependency-cruiser.json", "src"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    });
    return { exitCode: result.exitCode, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("dependency rules for the social layers", () => {
  test("a clean tree passes", () => {
    const result = cruise({
      "src/social/model/tunables.ts": "export const x = 1;\n",
      "src/social/model/eligibility.ts": 'import { x } from "./tunables.js";\nexport const y = x;\n',
      "src/web/page.ts": 'import { y } from "../social/model/eligibility.js";\nexport const z = y;\n',
    });
    expect(result.output).not.toContain("error");
    expect(result.exitCode).toBe(0);
  });

  test("bun:sqlite in src/social/model fails", () => {
    const result = cruise({
      "src/social/model/x.ts": 'import { Database } from "bun:sqlite";\nexport const d = Database;\n',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/social-model-(no-io|no-bun)/);
  });

  test("src/web in src/app-api fails", () => {
    const result = cruise({
      "src/web/page.ts": "export const page = 1;\n",
      "src/app-api/x.ts": 'import { page } from "../web/page.js";\nexport const p = page;\n',
      "src/cli.ts": 'import { p } from "./app-api/x.js";\nexport const c = p;\n',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("app-api-layer");
  });

  test("src/web may import only eligibility and tunables from the social model", () => {
    const result = cruise({
      "src/social/model/handle.ts": "export const h = 1;\n",
      "src/web/page.ts": 'import { h } from "../social/model/handle.js";\nexport const p = h;\n',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("web-reads-social-model-rules-only");
  });

  test("the DB layer cannot reach the HTTP layer", () => {
    const result = cruise({
      "src/app-api/x.ts": "export const a = 1;\n",
      "src/social/members.ts": 'import { a } from "../app-api/x.js";\nexport const m = a;\n',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("social-layer");
  });

  test("only cli.ts may import src/app-api", () => {
    const result = cruise({
      "src/app-api/x.ts": "export const a = 1;\n",
      "src/other.ts": 'import { a } from "./app-api/x.js";\nexport const o = a;\n',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("only-cli-imports-app-api");
  });
});
