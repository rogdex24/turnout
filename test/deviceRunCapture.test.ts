import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs device-run.sh for android-small with stub adb and maestro on PATH. The stub adb reads stdin the way the real `adb shell`
// does, and the stub maestro leaves the first story of every batch without a shot, so the capture retries it on its own and calls
// the wait from inside the story loop. In run 41222043095 that wait read the rest of the story list and 49 stories went unshot.
const source = path.join(import.meta.dir, "..", "apps", "mobile", ".maestro");
let root: string;

// The smallest bytes find_shot accepts: it only checks that the file ends with the PNG end chunk.
const IEND = "\\x00\\x00\\x00\\x00\\x49\\x45\\x4e\\x44\\xae\\x42\\x60\\x82";

const stubAdb = `#!/usr/bin/env bash
cat > /dev/null
exit 0
`;

// Flow run (a folder that is not visual-run): passes. Batch run: a shot for every story but the first. One story: its shot.
const stubMaestro = `#!/usr/bin/env bash
out=""
args=("$@")
for i in "\${!args[@]}"; do [ "\${args[$i]}" = --test-output-dir ] && out="\${args[$((i + 1))]}"; done
target="\${args[\${#args[@]}-1]}"
shoot() { mkdir -p "$out/shots"; printf '${IEND}' > "$out/shots/$1.png"; }
if [ -d "$target" ] && [ "$(basename "$target")" = visual-run ]; then
  first=1
  for flow in "$target"/*.yaml; do
    if [ "$first" = 1 ]; then first=0; continue; fi
    shoot "$(basename "$flow" .yaml)"
  done
  exit 1
elif [ -f "$target" ]; then
  shoot "$(basename "$target" .yaml)"
fi
exit 0
`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "device-run-"));
  const here = path.join(root, "maestro");
  fs.mkdirSync(path.join(here, "visual"), { recursive: true });
  fs.cpSync(path.join(source, "ci"), path.join(here, "ci"), { recursive: true });
  fs.copyFileSync(path.join(source, "config.yaml"), path.join(here, "config.yaml"));
  for (const file of ["stories.json", "capture-story.yaml"]) {
    fs.copyFileSync(path.join(source, "visual", file), path.join(here, "visual", file));
  }
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "adb"), stubAdb, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "maestro"), stubMaestro, { mode: 0o755 });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test("the capture shoots every story in every cell when a retry runs inside the story loop", async () => {
  const shots = path.join(root, "shots");
  const child = Bun.spawn(["bash", path.join(root, "maestro", "ci", "device-run.sh"), "android-small"], {
    env: {
      PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
      HOME: root,
      SERVER_URL: "http://localhost:1",
      SHOT_DIR: shots,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  const stories: { folder: string }[] = await Bun.file(path.join(source, "visual", "stories.json")).json();
  const missing = stories.flatMap(({ folder }) =>
    ["light-default", "light-largest", "dark-default", "dark-largest"]
      .map((cell) => `${folder}/${cell}`)
      .filter((shot) => !fs.existsSync(path.join(shots, `${shot}.png`))),
  );
  expect(missing).toEqual([]);
}, 60_000);
