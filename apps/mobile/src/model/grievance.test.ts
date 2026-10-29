import { grievanceBlocksStart, grievanceNotSet, mailtoHref, telHref } from "./grievance";

const real = { name: "A. Rao", address: "12 MG Road, Bengaluru 560001", email: "grievance@desk.example.com", phone: "+44 20 7946 0123" };

describe("grievanceNotSet", () => {
  it("accepts real details", () => {
    expect(grievanceNotSet(real)).toBe(false);
  });

  it("spots the development and staging placeholders", () => {
    expect(
      grievanceNotSet({
        name: "Grievance officer (not set)",
        address: "Address not set",
        email: "grievance@example.com",
        phone: "+1 202 555 0100",
      }),
    ).toBe(true);
  });

  it("spots any one placeholder on its own", () => {
    expect(grievanceNotSet({ ...real, name: "Grievance officer (not set)" })).toBe(true);
    expect(grievanceNotSet({ ...real, address: "Address not set" })).toBe(true);
    expect(grievanceNotSet({ ...real, email: "grievance@example.com" })).toBe(true);
    expect(grievanceNotSet({ ...real, phone: "+1 (202) 555-0199" })).toBe(true);
  });
});

describe("links", () => {
  it("builds a tel link from a number written for people", () => {
    expect(telHref("+44 20 7946 0123")).toBe("tel:+442079460123");
  });

  it("builds a mailto link", () => {
    expect(mailtoHref(" grievance@desk.example.com ")).toBe("mailto:grievance@desk.example.com");
  });
});

describe("grievanceBlocksStart", () => {
  const placeholder = {
    name: "Grievance officer (not set)",
    address: "Address not set",
    email: "grievance@example.com",
    phone: "+1 202 555 0100",
  };

  it("stops a production build that has only placeholders", () => {
    expect(grievanceBlocksStart("production", placeholder)).toBe(true);
  });

  it("lets a production build with real details start", () => {
    expect(grievanceBlocksStart("production", real)).toBe(false);
  });

  it("never stops the other builds or a test run", () => {
    expect(grievanceBlocksStart("preview", placeholder)).toBe(false);
    expect(grievanceBlocksStart("development", placeholder)).toBe(false);
    expect(grievanceBlocksStart("e2e", placeholder)).toBe(false);
    expect(grievanceBlocksStart(undefined, placeholder)).toBe(false);
  });
});
