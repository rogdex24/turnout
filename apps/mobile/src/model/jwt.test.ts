import { jwtSubject } from "./jwt";

const token = (payload: object) => `e30.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`;

test("reads the subject", () => {
  expect(jwtSubject(token({ sub: "01JABC", sid: "s" }))).toBe("01JABC");
});

test("returns null for a token without one or that does not decode", () => {
  expect(jwtSubject(token({ sid: "s" }))).toBeNull();
  expect(jwtSubject("not-a-token")).toBeNull();
  expect(jwtSubject("a.%%%.c")).toBeNull();
  expect(jwtSubject(token({ sub: 5 }))).toBeNull();
});
