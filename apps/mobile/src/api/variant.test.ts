import { allowSeedNumbers } from "./variant";

describe("allowSeedNumbers", () => {
  it("is on for development and e2e builds only", () => {
    expect(allowSeedNumbers("development")).toBe(true);
    expect(allowSeedNumbers("e2e")).toBe(true);
    expect(allowSeedNumbers("preview")).toBe(false);
    expect(allowSeedNumbers("production")).toBe(false);
  });
});
