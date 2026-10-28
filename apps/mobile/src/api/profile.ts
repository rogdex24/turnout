import type { QueryClient } from "@tanstack/react-query";
import {
  type ConsentResponse,
  consentResponseSchema,
  type HandleResponse,
  handleResponseSchema,
  type MeResponse,
  meResponseSchema,
  type PhotoResponse,
  photoResponseSchema,
} from "@turnout/contract/app/me";
import type { Gender, GroupPref, HandleKind } from "@turnout/contract/profile";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

export function postConsent(api: ApiClient, noticeVersion: string): Promise<ConsentResponse> {
  return api.request({ method: "POST", path: "/me/consent", body: { noticeVersion }, schema: consentResponseSchema });
}

export interface ProfileBody {
  firstName: string;
  gender: Gender;
  groupPref: GroupPref;
}

/** PATCH /me/profile answers with the whole `me`. */
export function patchProfile(api: ApiClient, body: ProfileBody): Promise<MeResponse> {
  return api.request({ method: "PATCH", path: "/me/profile", body, schema: meResponseSchema });
}

export function putHandle(api: ApiClient, body: { kind: HandleKind; handle: string }): Promise<HandleResponse> {
  return api.request({ method: "PUT", path: "/me/handle", body, schema: handleResponseSchema });
}

/** The picture goes up as the raw file body. `onProgress` runs as bytes leave the phone. */
export function putPhoto(api: ApiClient, photo: Blob, onProgress?: (sent: number, total: number) => void): Promise<PhotoResponse> {
  return api.request({ method: "PUT", path: "/me/photo", body: photo, schema: photoResponseSchema, onProgress });
}

/** Writes what the server just accepted into the cached `me`, so the gates and the screens see it without another round trip. */
export function updateCachedMe(queryClient: QueryClient, change: (me: MeResponse) => MeResponse): void {
  queryClient.setQueryData<MeResponse>(queryKeys.me(), (me) => (me === undefined ? me : change(me)));
}
