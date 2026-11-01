import { ApiError } from "@/model/apiError";
import { retryTransient } from "./retry";

describe("retryTransient", () => {
  it("tries again after a bad connection or a busy server, up to three times", () => {
    expect(retryTransient(0, new ApiError("offline", null, null))).toBe(true);
    expect(retryTransient(1, new ApiError("server", 503, null))).toBe(true);
    expect(retryTransient(3, new ApiError("server", 503, null))).toBe(false);
  });

  it("does not try again after a refusal", () => {
    expect(retryTransient(0, new ApiError("validation", 409, "outside_checkin_window"))).toBe(false);
    expect(retryTransient(0, new ApiError("not_found", 404, null))).toBe(false);
  });
});
