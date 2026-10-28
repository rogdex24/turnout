import { consentRequestSchema, MAX_PHOTO_BYTES, type MeResponse } from "@turnout/contract/app/me";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { handleInputSchema, profilePatchSchema } from "@turnout/contract/profile";
import { getHandle, isInLockedGroup, resetApprovedHandle, submitHandle } from "../../social/handles.js";
import { isPhoneBanned, latestConsent, type MemberRow, recordConsent } from "../../social/members.js";
import { missingItems } from "../../social/model/matchable.js";
import { phoneLast4 } from "../../social/model/phone.js";
import { getProfile, setPhotoKey, updateProfile } from "../../social/profiles.js";
import { nextIstMidnight } from "../../utils/time.js";
import { ulid } from "../../utils/ulid.js";
import { authed } from "../auth.js";
import type { AppContext, Route } from "../context.js";
import { AppError, notFound } from "../errors.js";
import { ok, parseBody, readBytes, retryAfter } from "../http.js";
import { fileLink } from "../presenters.js";
import { enforce } from "../rateLimit.js";
import { reencodePhoto, sniffImage } from "../upload.js";

/** Everything the app shows about the signed-in member, and what is still missing before they can be matched. */
export function buildMe(app: AppContext, member: MemberRow, now: Date): MeResponse {
  const profile = getProfile(app.db, member.id);
  const handle = getHandle(app.db, member.id);
  const consent = latestConsent(app.db, member.id);
  const missing = missingItems({
    phoneVerified: member.phone_verified_at !== null,
    status: member.status,
    firstName: profile?.first_name ?? null,
    gender: profile?.gender ?? null,
    photoKey: profile?.photo_key ?? null,
    handleStatus: handle?.status ?? null,
    banned: member.phone_e164 !== null && isPhoneBanned(app.db, member.phone_e164),
  });
  return {
    status: member.status as MeResponse["status"],
    phoneLast4: member.phone_e164 === null ? "" : phoneLast4(member.phone_e164),
    profile: {
      firstName: profile?.first_name ?? null,
      gender: profile?.gender ?? null,
      groupPref: profile?.group_pref ?? "open",
      photo: profile?.photo_key ? fileLink(app, profile.photo_key, now) : null,
    },
    handle: {
      state: handle?.status ?? "missing",
      kind: handle?.kind ?? null,
      handle: handle?.handle ?? null,
      rejectReason: handle?.status === "rejected" ? handle.reject_reason : null,
    },
    matchable: { ok: missing.length === 0, missing },
    consent: { noticeVersion: consent?.notice_version ?? null, current: consent?.notice_version === NOTICE_VERSION },
  };
}

export const meRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/me",
    auth: "member",
    handler: ({ app, member, now }) => ok(buildMe(app, authed(member).member, now)),
  },
  {
    method: "PATCH",
    pattern: "/me/profile",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row } = authed(member);
      const patch = await parseBody(request, profilePatchSchema);
      // The others in a group have seen this name and rely on this gender (women-only groups, the photo review), so neither changes
      // while the member is in one. The group type applies to plans made later, so it stays free.
      const current = getProfile(app.db, row.id);
      if (
        current !== null &&
        (current.first_name !== patch.firstName || current.gender !== patch.gender) &&
        isInLockedGroup(app.db, row.id)
      ) {
        throw new AppError(409, "profile_locked", "your name and gender are locked while you are in a group");
      }
      updateProfile(app.db, row.id, patch, now);
      return ok(buildMe(app, row, now));
    },
  },
  {
    method: "PUT",
    pattern: "/me/handle",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row } = authed(member);
      const input = await parseBody(request, handleInputSchema);
      // While in a confirmed or locked group the handle is fixed: the others have already seen it.
      if (isInLockedGroup(app.db, row.id)) throw new AppError(409, "handle_locked", "your handle is locked while you are in a group");
      if (!submitHandle(app.db, row.id, input.kind, input.handle, now, app.config.tunables.rate.handleSubmitPerDay.limit)) {
        const seconds = (new Date(nextIstMidnight(now)).getTime() - now.getTime()) / 1000;
        throw new AppError(429, "rate_limited", "you have changed your handle too many times today", retryAfter(seconds));
      }
      return ok({ state: "pending" });
    },
  },
  {
    method: "PUT",
    pattern: "/me/photo",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row } = authed(member);
      // The group has seen this face and the operator approved the handle against it: no new photo while the member is in one.
      if (isInLockedGroup(app.db, row.id)) throw new AppError(409, "profile_locked", "your photo is locked while you are in a group");
      const bytes = await readBytes(request, MAX_PHOTO_BYTES, "file_too_large");
      if (sniffImage(bytes) === null) throw new AppError(400, "unsupported_type", "send a JPEG, PNG or HEIC picture");
      enforce(app.db, app.config.otpPepper, "photo:upload", row.id, app.config.tunables.rate.photoUploadPerMemberDay, now);
      const jpeg = await reencodePhoto(bytes, app.config.tunables.photoMaxPixels);
      // The key says nothing about whose photo it is, so a link to it never carries a member id.
      const key = `photos/${ulid(now).toLowerCase()}.jpg`;
      await app.store.put(key, jpeg, "image/jpeg");
      const old = setPhotoKey(app.db, row.id, key, now);
      // A different face needs the handle looked at again.
      resetApprovedHandle(app.db, row.id, now);
      if (old !== null && old !== key) await app.store.delete(old).catch(() => {});
      return ok({ photo: fileLink(app, key, now) });
    },
  },
  {
    method: "GET",
    pattern: "/me/photo",
    auth: "member",
    handler: ({ app, member, now }) => {
      const key = getProfile(app.db, authed(member).member.id)?.photo_key;
      if (!key) throw notFound();
      return ok({ photo: fileLink(app, key, now) });
    },
  },
  {
    method: "POST",
    pattern: "/me/consent",
    auth: "member",
    handler: async ({ app, request, member, now }) => {
      const { member: row } = authed(member);
      const { noticeVersion } = await parseBody(request, consentRequestSchema);
      if (noticeVersion !== NOTICE_VERSION)
        throw new AppError(400, "unknown_notice_version", "the privacy notice has been updated, reload the app");
      const given = recordConsent(app.db, row.id, noticeVersion, now);
      return ok({ noticeVersion: given.notice_version, givenAt: given.given_at });
    },
  },
];
