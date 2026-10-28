import type { ConfigResponse } from "@turnout/contract/app/config";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";

/** A grievance officer for tests and stories. Fictional: the example.com domain and a number in the +1 202 555 01xx range. */
export const SAMPLE_GRIEVANCE: ConfigResponse["grievance"] = {
  name: "A. Officer",
  address: "12 Example Lane, Sample City",
  email: "grievance@example.com",
  phone: "+1 202 555 0142",
};

export const SAMPLE_CONFIG: ConfigResponse = {
  notice: { version: NOTICE_VERSION, text: "" },
  push: { android: true, ios: false },
  support: { email: "support@example.com" },
  minAppVersion: "1.0.0",
  grievance: SAMPLE_GRIEVANCE,
};
