import { ApiError } from "./apiError";
import { canSend, checkPicked, issueFromError, normaliseMime, problemFromError, ticketPhase } from "./ticketFile";

const MB = 1024 * 1024;

describe("normaliseMime", () => {
  test.each([
    ["image/jpg", null, "image/jpeg"],
    ["IMAGE/PNG", null, "image/png"],
    ["image/heif", "IMG_1.HEIF", "image/heic"],
    [null, "ticket.pdf", "application/pdf"],
    ["application/octet-stream", "Screenshot.heic", "image/heic"],
    ["", "shot.JPG", "image/jpeg"],
    [undefined, undefined, ""],
    ["application/zip", "a.pdf", "application/zip"],
  ])("%s with the name %s is %s", (declared, name, expected) => {
    expect(normaliseMime(declared, name)).toBe(expected);
  });
});

describe("checkPicked", () => {
  test("a screenshot passes for either proof kind, HEIC included", () => {
    for (const mime of ["image/jpeg", "image/png", "image/heic"]) {
      expect(checkPicked("screenshot", { mime, bytes: MB })).toBeNull();
      expect(checkPicked("screenshot_or_pdf", { mime, bytes: MB })).toBeNull();
    }
  });

  test("a PDF is for the sellers that take one, not for BookMyShow", () => {
    expect(checkPicked("screenshot_or_pdf", { mime: "application/pdf", bytes: MB })).toBeNull();
    expect(checkPicked("screenshot", { mime: "application/pdf", bytes: MB })).toBe("screenshot_required");
  });

  test("other types, empty files and files over 10 MB are turned back", () => {
    expect(checkPicked("screenshot_or_pdf", { mime: "image/gif", bytes: MB })).toBe("unsupported_type");
    expect(checkPicked("screenshot", { mime: "image/png", bytes: 0 })).toBe("empty");
    expect(checkPicked("screenshot", { mime: "image/png", bytes: 10 * MB })).toBeNull();
    expect(checkPicked("screenshot", { mime: "image/png", bytes: 10 * MB + 1 })).toBe("too_large");
  });
});

describe("issueFromError", () => {
  const refusal = (status: number, code: string) => new ApiError(status === 429 ? "rate_limited" : "validation", status, code);

  test("maps the server's refusals about the file", () => {
    expect(issueFromError(refusal(400, "screenshot_required"))).toBe("screenshot_required");
    expect(issueFromError(refusal(400, "unsupported_type"))).toBe("unsupported_type");
    expect(issueFromError(refusal(400, "bad_ticket"))).toBe("bad_ticket");
    expect(issueFromError(refusal(413, "file_too_large"))).toBe("too_large");
    expect(issueFromError(refusal(413, "payload_too_large"))).toBe("too_large");
    expect(issueFromError(refusal(409, "too_late"))).toBe("too_late");
    expect(issueFromError(refusal(429, "rate_limited"))).toBe("rate_limited");
  });

  test("leaves what is not about the file to the generic error", () => {
    expect(issueFromError(new ApiError("offline", null, null))).toBeNull();
    expect(issueFromError(new ApiError("server", 500, "server_error"))).toBeNull();
  });
});

describe("canSend", () => {
  const file = { uri: "file:///a.png", name: "a.png", mime: "image/png", bytes: 10 };
  test("needs a good file, no upload under way and a connection", () => {
    expect(canSend({ file, issue: null, uploading: false, offline: false })).toBe(true);
    expect(canSend({ file: null, issue: null, uploading: false, offline: false })).toBe(false);
    expect(canSend({ file, issue: "too_large", uploading: false, offline: false })).toBe(false);
    expect(canSend({ file, issue: null, uploading: true, offline: false })).toBe(false);
    expect(canSend({ file, issue: null, uploading: false, offline: true })).toBe(false);
  });
});

describe("problemFromError", () => {
  test("names what the person can fix, and what they can only wait out", () => {
    expect(problemFromError(new ApiError("offline", null, null))).toBe("offline");
    expect(problemFromError(new ApiError("validation", 400, "unsupported_type"))).toBe("unsupported_type");
    expect(problemFromError(new ApiError("validation", 409, "plan_closed"))).toBe("plan_closed");
    expect(problemFromError(new ApiError("rate_limited", 429, "rate_limited", 30))).toBe("rate_limited");
    expect(problemFromError(new ApiError("server", 500, "server_error"))).toBe("server");
  });
});

describe("ticketPhase", () => {
  test("only the three ticket states have a ticket page phase", () => {
    expect(ticketPhase("needs_ticket")).toBe("add");
    expect(ticketPhase("checking_ticket")).toBe("checking");
    expect(ticketPhase("ticket_rejected")).toBe("rejected");
    for (const state of ["finding_group", "group_confirmed", "meet_card_live", "no_group", "withdrawn", "done"]) {
      expect(ticketPhase(state)).toBeNull();
    }
  });
});
