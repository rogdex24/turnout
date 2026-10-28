import { ApiError, classifyFailure, isApiError, offlineError, retryAfterSeconds } from "./apiError";

const body = (code: string) => JSON.stringify({ error: { code, message: "for logs" } });

describe("classifyFailure", () => {
  test.each([
    [401, "unauthorized", "unauthorised"],
    [403, "account_suspended", "forbidden"],
    [404, "not_found", "not_found"],
    [429, "rate_limited", "rate_limited"],
    [400, "invalid_code", "validation"],
    [409, "handle_locked", "validation"],
    [413, "payload_too_large", "validation"],
    [500, "server_error", "server"],
    [503, "otp_send_failed", "server"],
  ])("%s %s is %s", (status, code, kind) => {
    const error = classifyFailure(status, body(code), null);
    expect(error.kind).toBe(kind);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
  });

  test("keeps the code but not the message", () => {
    expect(classifyFailure(400, body("bad_phone"), null).message).toBe("bad_phone");
  });

  test("an unreadable body still classifies by status", () => {
    const error = classifyFailure(502, "<html>bad gateway</html>", null);
    expect(error.kind).toBe("server");
    expect(error.code).toBeNull();
  });

  test("carries the plan a plan_exists answer names and the items a not_matchable answer lists", () => {
    const exists = classifyFailure(409, JSON.stringify({ error: { code: "plan_exists", message: "m", planId: "p1" } }), null);
    expect(exists.detail).toEqual({ planId: "p1", missing: null });
    const missing = classifyFailure(
      409,
      JSON.stringify({ error: { code: "not_matchable", message: "m", missing: ["photo", "handle"] } }),
      null,
    );
    expect(missing.detail).toEqual({ planId: null, missing: ["photo", "handle"] });
    expect(classifyFailure(409, body("plan_closed"), null).detail).toEqual({ planId: null, missing: null });
  });

  test("carries Retry-After on a 429", () => {
    expect(classifyFailure(429, body("rate_limited"), "42").retryAfterSeconds).toBe(42);
  });
});

describe("retryAfterSeconds", () => {
  test("reads whole seconds and ignores junk", () => {
    expect(retryAfterSeconds("30")).toBe(30);
    expect(retryAfterSeconds("0")).toBe(0);
    expect(retryAfterSeconds("-3")).toBeNull();
    expect(retryAfterSeconds("soon")).toBeNull();
    expect(retryAfterSeconds(null)).toBeNull();
  });
});

test("offlineError is an ApiError of kind offline", () => {
  const error = offlineError();
  expect(isApiError(error)).toBe(true);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.kind).toBe("offline");
  expect(isApiError(new Error("x"))).toBe(false);
});
