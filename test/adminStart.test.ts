import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "../src/migrate.js";

/** Runs the real `admin` command in a child: the UI bundler reads the project's tsconfig, which a test runner process does not. */
async function launch(env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-start-"));
  const dbPath = path.join(dir, "db.sqlite");
  const db = new Database(dbPath, { create: true, strict: true });
  migrate(db);
  db.close();

  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = Bun.spawn(["bun", "run", "src/cli.ts", "admin", "--db", dbPath, "--port", String(port)], {
    env: { ...process.env, ...env },
    stdout: "ignore",
    stderr: "pipe",
  });
  return { port, child, stop: () => child.kill() };
}

async function ready(port: number, host = "127.0.0.1"): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(`http://${host}:${port}/api/sources`);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error("admin did not start");
}

test("the panel binds to loopback by default and serves the page shell and API", async () => {
  const { port, stop } = await launch({});
  try {
    await ready(port);
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(`${base}/runs`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<title>hydsocial admin</title>");
    const script = html.match(/src="([^"]+\.js)"/)?.[1];
    expect(script).toBeDefined();
    const bundle = await fetch(new URL(script!, base));
    expect(bundle.status).toBe(200);
    expect(await bundle.text()).toContain("New run"); // the app compiled, not an error stub
    expect((await fetch(`${base}/api/sources`)).status).toBe(200);
    expect((await fetch(`${base}/nowhere`)).status).toBe(404);
  } finally {
    stop();
  }
}, 30_000);

test("with a token set, the page shell and its assets need it too, not only the API", async () => {
  const { port, stop } = await launch({ ADMIN_HOST: "localhost", ADMIN_TOKEN: "tok" });
  try {
    await ready(port, "localhost");
    const base = `http://localhost:${port}`;
    const auth = { authorization: "Bearer tok" };
    const html = await (await fetch(`${base}/runs`, { headers: auth })).text();
    const script = html.match(/src="([^"]+\.js)"/)![1]!;
    for (const target of ["/runs", new URL(script, base).pathname, "/api/sources"]) {
      expect((await fetch(`${base}${target}`)).status).toBe(401);
      expect((await fetch(`${base}${target}`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
      expect((await fetch(`${base}${target}`, { headers: auth })).status).toBe(200);
    }
  } finally {
    stop();
  }
}, 30_000);

test("a non-loopback host without a token refuses to start", async () => {
  const { child } = await launch({ ADMIN_HOST: "0.0.0.0", ADMIN_TOKEN: "" });
  expect(await child.exited).toBe(1);
  expect(await new Response(child.stderr).text()).toContain("ADMIN_TOKEN");
}, 30_000);
