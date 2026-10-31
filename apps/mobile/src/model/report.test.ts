import { createReportRequestSchema } from "@turnout/contract/app/reports";
import { DETAILS_MAX_CHARS, reportBody } from "./report";

describe("reportBody", () => {
  it("is the reason alone when nothing else is written", () => {
    expect(reportBody("Made me feel unsafe", "")).toBe("Made me feel unsafe");
    expect(reportBody("Made me feel unsafe", "   \n ")).toBe("Made me feel unsafe");
  });

  it("puts the details after the reason", () => {
    expect(reportBody("Something else", "  He kept following me.  ")).toBe("Something else\n\nHe kept following me.");
  });

  it("fits the server's limit with the longest details", () => {
    const body = reportBody("Harassment or unwanted contact", "x".repeat(DETAILS_MAX_CHARS));
    const parsed = createReportRequestSchema.safeParse({ groupId: "g1", memberRef: "m1", body, clientId: "abcdefgh-1234" });
    expect(parsed.success).toBe(true);
  });
});
