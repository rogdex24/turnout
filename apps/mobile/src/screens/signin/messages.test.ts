import { signin } from "@/copy/signin";
import { ApiError } from "@/model/apiError";
import { sendFailure, verifyFailure } from "@/model/otpFlow";
import { resendFailureText, sendFailureText, verifyFailureText } from "./messages";

describe("messages", () => {
  it("every refusal says the same sentence, on both screens, and gives no reason", () => {
    const refusal = new ApiError("forbidden", 403, "sign_in_unavailable");
    expect(sendFailureText(sendFailure(refusal))).toBe("We can't sign you in with this number.");
    expect(resendFailureText(sendFailure(refusal))).toBe(signin.phone.errors.refused);
    expect(verifyFailureText(verifyFailure(refusal, 0))).toBe(signin.code.refused);
  });

  it("a wrong code says how many tries are left", () => {
    const wrong = new ApiError("validation", 400, "invalid_code");
    expect(verifyFailureText(verifyFailure(wrong, 1))).toBe("That code isn't right. 4 tries left.");
    expect(verifyFailureText(verifyFailure(wrong, 4))).toBe("That code isn't right. 1 try left.");
    expect(verifyFailureText(verifyFailure(wrong, 5))).toBe(signin.code.tooManyTries);
  });

  it("a limit says how long to wait", () => {
    const limited = new ApiError("rate_limited", 429, "rate_limited", 90);
    expect(sendFailureText(sendFailure(limited))).toBe("Too many tries. Try again in 2 minutes.");
  });

  it("no message names WhatsApp as the reason a number was refused", () => {
    for (const text of [signin.phone.errors.refused, signin.code.refused]) expect(text).not.toMatch(/whatsapp|banned|blocked/i);
  });
});
