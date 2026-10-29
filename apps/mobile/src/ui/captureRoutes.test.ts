import fs from "node:fs";
import path from "node:path";

/**
 * The screens that show a co-member's face, words or ticket block screenshots and screen recording while they are open
 * (docs/security/masvs-app.md, MASVS-PLATFORM). The hook itself is tested in useBlockCapture.test.tsx. This test reads the route
 * files, because the dependency rules keep every import of a route out of the rest of the app, and it fails when a listed route
 * stops calling the hook.
 */
const appDir = path.join(__dirname, "..", "app", "(app)");
const ROUTES = [
  ["the group chat", path.join("groups", "[groupId]", "thread.tsx")],
  ["the after screen", path.join("groups", "[groupId]", "after.tsx")],
  ["the report screen", "report.tsx"],
] as const;

describe("routes that block screen capture", () => {
  it.each(ROUTES)("%s imports and calls useBlockCapture", (_name, file) => {
    const source = fs.readFileSync(path.join(appDir, file), "utf8");
    expect(source).toMatch(/import \{ useBlockCapture \} from "@\/ui\/useBlockCapture";/);
    expect(source).toMatch(/^\s+useBlockCapture\(\);$/m);
  });
});
