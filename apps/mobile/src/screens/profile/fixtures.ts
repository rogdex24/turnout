import type { MeResponse } from "@turnout/contract/app/me";
import { meFixture } from "@/providers/testing";
import type { PreparedPhoto } from "./photoFile";

/** A member who has just signed in: nothing on the account yet. */
export function newMember(): MeResponse {
  return meFixture({
    profile: { firstName: null, gender: null, groupPref: "open", photo: null },
    handle: { state: "missing", kind: null, handle: null },
  });
}

/** A picture picked and made ready, as the library helper hands it over. */
export const SAMPLE_PICKED: PreparedPhoto = { uri: "file:///cache/picked.jpg", width: 810, height: 1080 };
