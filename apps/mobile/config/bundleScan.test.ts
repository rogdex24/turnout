import { DEV_ONLY_STRINGS, printableRuns, scanBytes, scanText } from "./bundleScan";

/** Built from pieces so this file does not hold a string that a secret scanner would flag. */
const googleKey = `AIza${"Sy".repeat(2)}${"a1".repeat(15)}1`;
const awsKey = `AKIA${"ABCD".repeat(4)}`;
const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "c2lnbmF0dXJlLXNpZ25hdHVyZQ"].join(".");

test("finds each kind of secret and names the rule", () => {
  const text = [
    `key=${googleKey}`,
    awsKey,
    "-----BEGIN RSA PRIVATE KEY-----",
    `Bearer ${jwt}`,
    "https://admin:hunter22@example.com/x",
    "http://10.0.2.2:3000/api",
    `{apiKey: "${"x9".repeat(12)}"}`,
  ].join("\n");
  const rules = scanText(text, "a.js").map((f) => f.rule);
  expect(rules).toEqual(
    expect.arrayContaining([
      "google-api-key",
      "aws-access-key",
      "private-key-block",
      "jwt",
      "url-with-password",
      "private-network-url",
      "inline-secret",
    ]),
  );
});

test("a finding shows four characters and a length, never the value", () => {
  const [finding] = scanText(googleKey, "a.js");
  expect(finding?.redacted).toBe(`AIza...(${googleKey.length} chars)`);
  expect(JSON.stringify(finding)).not.toContain(googleKey);
});

test("ordinary bundle text passes, including the public strings the libraries carry", () => {
  const text = [
    "https://api.turnout.example/v1/shows",
    "http://localhost:8081/",
    "http://www.w3.org/2000/svg",
    "https://o1.ingest.sentry.io/api/1/envelope/",
    "const apiKey = options.apiKey;",
    "secret: undefined",
  ].join("\n");
  expect(scanText(text, "a.js")).toEqual([]);
});

test("a forbidden string is reported as it is, because it is not a secret", () => {
  const findings = scanText("base=http://10.0.2.2:3000", "a.js", DEV_ONLY_STRINGS);
  expect(findings.map((f) => f.rule)).toContain("forbidden-string");
  expect(findings.find((f) => f.rule === "forbidden-string")?.redacted).toBe("10.0.2.2");
});

test("printable runs drop short runs and split on bytes that are not text", () => {
  const bytes = Buffer.concat([
    Buffer.from("abc"),
    Buffer.from([0]),
    Buffer.from("longer-run"),
    Buffer.from([0xff, 0x01]),
    Buffer.from("tail-run!"),
  ]);
  expect(printableRuns(bytes)).toEqual(["longer-run", "tail-run!"]);
});

test("scanBytes finds a secret inside bytecode-like binary and in plain text", () => {
  const binary = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(`prefix${awsKey}suffix`), Buffer.from([0, 9])]);
  expect(scanBytes(binary, "app.hbc").map((f) => f.rule)).toEqual(["aws-access-key"]);
  expect(scanBytes(Buffer.from(`x ${googleKey}`), "app.js").map((f) => f.rule)).toEqual(["google-api-key"]);
  expect(scanBytes(Buffer.from("nothing here"), "app.js")).toEqual([]);
});
