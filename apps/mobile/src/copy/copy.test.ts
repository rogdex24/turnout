import fs from "node:fs";
import path from "node:path";

/** The copy lint (plan section 6): no word that promises an identity check, and no guilt copy. Reads every .ts and .tsx file under src/copy, subfolders included, as text. */
const BANNED: [RegExp, string][] = [
  [/\bverified\b/i, "verified"],
  [/\bID[- ]check(ed)?\b/i, "ID check"],
  [/\bKYC\b/, "KYC"],
  [/\bwe(')?ll miss you\b/i, "guilt: we'll miss you"],
  [/\bare you sure you want to (leave|go|quit)\b/i, "guilt: are you sure you want to leave"],
  [/\byou('| wi)ll let .* down\b/i, "guilt: you'll let them down"],
  [/\bdon'?t (leave|abandon) (us|them|your group)\b/i, "guilt: don't leave"],
];

const dir = __dirname;
const files = fs.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

test.each(files)("%s has no banned copy", (file) => {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  for (const [pattern, name] of BANNED) expect({ file, name, hit: pattern.test(text) }).toEqual({ file, name, hit: false });
});

test("the copy lint can fail", () => {
  expect(BANNED.some(([pattern]) => pattern.test("ID-checked members"))).toBe(true);
  expect(BANNED.some(([pattern]) => pattern.test("Nobody is verified here"))).toBe(true);
});
