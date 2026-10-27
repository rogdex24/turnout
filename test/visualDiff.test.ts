import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { compareFolders } from "../scripts/visual-diff.js";

/** A solid-colour PNG, with an optional filled square, written with node:zlib so the test needs no image library. */
function png(
  width: number,
  height: number,
  background: [number, number, number],
  square?: { size: number; color: [number, number, number] },
): Buffer {
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inSquare = square !== undefined && x < square.size && y < square.size;
      const [r, g, b] = inSquare ? square.color : background;
      raw.set([r, g, b], y * rowBytes + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let root: string;
const dirs = () => ({ base: path.join(root, "base"), cand: path.join(root, "cand"), report: path.join(root, "report") });
const write = (dir: string, file: string, data: Buffer) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), data);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "visual-diff-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const white = [255, 255, 255] as [number, number, number];
const black = [0, 0, 0] as [number, number, number];

test("identical folders pass and write a report", async () => {
  const { base, cand, report } = dirs();
  for (const dir of [base, cand]) write(dir, "android-small/events-light.png", png(20, 20, white));
  const result = await compareFolders(base, cand, { reportDir: report });
  expect(result.ok).toBe(true);
  expect(result.counts.same).toBe(1);
  expect(JSON.parse(fs.readFileSync(path.join(report, "report.json"), "utf8")).ok).toBe(true);
  expect(fs.readFileSync(path.join(report, "report.md"), "utf8")).toContain("no differences");
});

test("a changed shot fails and gets a diff image", async () => {
  const { base, cand, report } = dirs();
  write(base, "events.png", png(20, 20, white));
  write(cand, "events.png", png(20, 20, white, { size: 5, color: black }));
  const result = await compareFolders(base, cand, { reportDir: report });
  expect(result.ok).toBe(false);
  expect(result.shots[0]).toMatchObject({ file: "events.png", status: "changed", diffCount: 25 });
  expect(fs.existsSync(path.join(report, "diffs", "events.png"))).toBe(true);
});

test("a change below the threshold passes", async () => {
  const { base, cand, report } = dirs();
  write(base, "a.png", png(20, 20, [200, 200, 200]));
  write(cand, "a.png", png(20, 20, [205, 205, 205]));
  expect((await compareFolders(base, cand, { reportDir: report, threshold: 0.1 })).ok).toBe(true);
  expect((await compareFolders(base, cand, { reportDir: report, threshold: 0 })).ok).toBe(false);
});

test("a shot missing from the candidate, a shot with no baseline and a size change all fail", async () => {
  const { base, cand, report } = dirs();
  write(base, "gone.png", png(10, 10, white));
  write(base, "resized.png", png(10, 10, white));
  write(cand, "resized.png", png(12, 10, white));
  write(cand, "fresh.png", png(10, 10, white));
  const result = await compareFolders(base, cand, { reportDir: report });
  expect(result.ok).toBe(false);
  expect(Object.fromEntries(result.shots.map((s) => [s.file, s.status]))).toEqual({
    "gone.png": "missing",
    "resized.png": "layout-changed",
    "fresh.png": "new",
  });
});

test("two empty folders are an error, not a pass", async () => {
  const { base, cand, report } = dirs();
  fs.mkdirSync(base);
  fs.mkdirSync(cand);
  await expect(compareFolders(base, cand, { reportDir: report })).rejects.toThrow("nothing to compare");
});

test("the command exits 1 on a difference and 0 when the shots match", async () => {
  const { base, cand, report } = dirs();
  write(base, "a.png", png(10, 10, white));
  write(cand, "a.png", png(10, 10, white));
  const run = async () => {
    const child = Bun.spawn([process.execPath, "scripts/visual-diff.ts", base, cand, "--report", report], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return child.exited;
  };
  expect(await run()).toBe(0);
  write(cand, "a.png", png(10, 10, black));
  expect(await run()).toBe(1);
});
