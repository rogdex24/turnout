import { readFileSync } from "node:fs";
import { join } from "node:path";
import { howMatchingMarkdown } from "./howMatchingWorks";

describe("how matching works", () => {
  it("says what the Markdown file says", () => {
    expect(howMatchingMarkdown()).toBe(readFileSync(join(__dirname, "how-matching-works.md"), "utf8"));
  });
});
