import fs from "node:fs";
import path from "node:path";

const STORE = path.resolve(__dirname, "../store");
const LISTING = path.join(STORE, "listing/en-IN");
const DATA_MAP = path.resolve(__dirname, "../../../docs/data-map.md");

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/** The listing text as Play stores it: no trailing newline. */
function field(name: string): string {
  return read(path.join(LISTING, name)).replace(/\n$/, "");
}

/** The same patterns as the in-app copy test: the product does not check ID, age or identity, so it never says so. */
const BANNED: [RegExp, string][] = [
  [/\bverified\b/i, "verified"],
  [/\bID[- ]check(ed)?\b/i, "ID check"],
  [/\bKYC\b/, "KYC"],
  [/\bsafe(ty)?\b/i, "safe"],
  [/\bscreened\b/i, "screened"],
  [/\bno strangers\b/i, "no strangers"],
];

/** Play's limits for the title, the short description and the full description. */
const LIMITS = { "title.txt": 30, "short-description.txt": 80, "full-description.txt": 4000 };

describe("Play listing text", () => {
  for (const [name, limit] of Object.entries(LIMITS)) {
    it(`${name} is present and within ${limit} characters`, () => {
      const text = field(name);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(limit);
    });
  }

  it("makes no claim of verification, ID checks or safety", () => {
    for (const name of Object.keys(LIMITS)) {
      const text = field(name);
      for (const [pattern, label] of BANNED) {
        expect({ name, label, found: pattern.test(text) }).toEqual({ name, label, found: false });
      }
    }
  });

  it("has no em dashes and no emoji", () => {
    for (const name of Object.keys(LIMITS)) {
      const text = field(name);
      expect(text).not.toMatch(/\u2014/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

/** The tables in docs/data-map.md and their column names, from the `### \`table\`` headings and `| \`table.column\` |` rows. */
function dataMapColumns(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const line of read(DATA_MAP).split("\n")) {
    const heading = /^### `([a-z_]+)`/.exec(line);
    if (heading?.[1]) tables.set(heading[1], new Set());
    const row = /^\| `([a-z_]+)\.([a-z_]+)` \|/.exec(line);
    if (row?.[1] && row[2]) tables.get(row[1])?.add(row[2]);
  }
  return tables;
}

describe("Data safety answers", () => {
  const tables = dataMapColumns();
  const cited = [...read(path.join(STORE, "data-safety.md")).matchAll(/`([a-z_]+)\.([a-z_]+)`/g)]
    .map((match) => ({ table: match[1] ?? "", column: match[2] ?? "" }))
    // A backticked file name such as `permissions.md` is not a column; only names that start with a data map table count.
    .filter(({ table }) => tables.has(table));

  it("reads the data map", () => {
    expect(tables.size).toBeGreaterThan(10);
  });

  it("cites the data map line by line", () => {
    expect(cited.length).toBeGreaterThan(20);
  });

  it("cites only columns that exist in docs/data-map.md", () => {
    const missing = cited.filter(({ table, column }) => !tables.get(table)?.has(column));
    expect(missing).toEqual([]);
  });

  it("cites the columns that hold what the form says is collected", () => {
    const names = new Set(cited.map(({ table, column }) => `${table}.${column}`));
    for (const required of [
      "otp_challenge.phone_hash",
      "ban_list.phone_hash",
      "profile.first_name",
      "profile.photo_key",
      "profile.gender",
      "social_handle.handle",
      "message.body",
      "report.body",
      "device.expo_token",
      "consent_record.given_at",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });
});
