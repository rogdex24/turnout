import { pickApiUrl } from "./baseUrl";

const extra = { android: "http://10.0.2.2:3000", ios: "http://localhost:3000" };

test("an explicit URL wins", () => {
  expect(pickApiUrl("https://api.example.com", extra, "android")).toBe("https://api.example.com");
});

test("the config picks the platform's host address", () => {
  expect(pickApiUrl(undefined, extra, "android")).toBe("http://10.0.2.2:3000");
  expect(pickApiUrl(undefined, extra, "ios")).toBe("http://localhost:3000");
});

test("no URL anywhere is an error", () => {
  expect(() => pickApiUrl(undefined, undefined, "ios")).toThrow("EXPO_PUBLIC_API_URL");
});
