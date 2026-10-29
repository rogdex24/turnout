import fs from "node:fs";
import path from "node:path";

const appDir = path.join(__dirname, "app");
const boardHtml = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "design", "mobile-board", "board.html"), "utf8");
const boardIds = new Set([...boardHtml.matchAll(/id="(B\d+(?:\.\d+)?)"/g)].map((m) => m[1]));

/**
 * Route files with no screen on the board: the native link filter, the e2e stand-in for tapping a notification, and the
 * Storybook workbench, which preview and production builds fold away (src/app/storybook.tsx).
 */
const NO_SCREEN = new Set(["+native-intent.tsx", path.join("(app)", "push.tsx"), "storybook.tsx"]);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(full) : entry.name.endsWith(".tsx") ? [full] : [];
  });
}

test("every route file starts with a Board line that names a step in the design board", () => {
  const problems: string[] = [];
  for (const file of routeFiles(appDir)) {
    const rel = path.relative(appDir, file);
    if (NO_SCREEN.has(rel)) continue;
    const first = fs.readFileSync(file, "utf8").split("\n")[0] ?? "";
    const id = /^\/\/ Board: (B\d+(?:\.\d+)?)(?:\s|$)/.exec(first)?.[1];
    if (!id) problems.push(`${rel}: first line is not "// Board: B<step>"`);
    else if (!boardIds.has(id)) problems.push(`${rel}: ${id} is not in docs/design/mobile-board/board.html`);
  }
  expect(problems).toEqual([]);
});

test("the files exempt from the Board line exist, so the list cannot go stale", () => {
  for (const rel of NO_SCREEN) expect(fs.existsSync(path.join(appDir, rel))).toBe(true);
});

test("the board has steps to trace to", () => {
  expect(boardIds.size).toBeGreaterThan(40);
});
