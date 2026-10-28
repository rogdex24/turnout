import { parseHandleInput } from "./handle";

describe("parseHandleInput", () => {
  test.each([
    ["@Ananya.K", { kind: "instagram", handle: "ananya.k" }],
    ["ananya_k", { kind: "instagram", handle: "ananya_k" }],
    ["  @ananya.k  ", { kind: "instagram", handle: "ananya.k" }],
    ["https://www.instagram.com/ananya.k/?igsh=abc", { kind: "instagram", handle: "ananya.k" }],
    ["instagram.com/ananya.k", { kind: "instagram", handle: "ananya.k" }],
    ["https://www.linkedin.com/in/Ananya-Kulkarni-123/?trk=x", { kind: "linkedin", handle: "ananya-kulkarni-123" }],
    ["linkedin.com/in/ananya-k", { kind: "linkedin", handle: "ananya-k" }],
    ["in/ananya-k", { kind: "linkedin", handle: "ananya-k" }],
    ["ananya-kulkarni", { kind: "linkedin", handle: "ananya-kulkarni" }],
  ])("reads %s", (input, expected) => {
    expect(parseHandleInput(input)).toEqual(expected);
  });

  test.each([
    ["empty", ""],
    ["spaces", "ana nya"],
    ["a reserved instagram page", "https://instagram.com/p/abc"],
    ["too long for instagram", `@${"a".repeat(31)}`],
    ["double period", "@ana..nya"],
    ["a link to another site", "https://example.com/ananya"],
    ["an email", "ananya@example.com"],
    ["a short linkedin slug", "linkedin.com/in/ab"],
  ])("rejects %s", (_name, input) => {
    expect(parseHandleInput(input)).toBeNull();
  });
});
