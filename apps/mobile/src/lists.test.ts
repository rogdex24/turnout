import fs from "node:fs";
import path from "node:path";

/** Every source file under src, tests and stories left out. */
function sources(dir: string): { file: string; text: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    if (!/\.tsx$/.test(entry.name) || /\.(test|stories)\.tsx$/.test(entry.name)) return [];
    return [{ file: path.relative(__dirname, file), text: fs.readFileSync(file, "utf8") }];
  });
}

const files = sources(__dirname);

describe("long lists", () => {
  test("use FlashList, which recycles rows, and not FlatList or SectionList, which keep a window of them mounted", () => {
    const offenders = files.filter(({ text }) => /\b(FlatList|SectionList|VirtualizedList)\b/.test(text)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  test("give every FlashList an item type, so a row is recycled only into a row of the same shape", () => {
    const lists = files.filter(({ text }) => /<FlashList\b/.test(text));
    expect(lists.length).toBeGreaterThan(0);
    for (const { file, text } of lists) expect({ file, typed: /getItemType=/.test(text) }).toEqual({ file, typed: true });
  });
});
