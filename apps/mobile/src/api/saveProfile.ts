import type { QueryClient } from "@tanstack/react-query";
import { ApiError, isApiError } from "../model/apiError";
import { uploadProgress } from "../model/photo";
import type { SaveStep } from "../model/profileForm";
import type { ApiClient } from "./client";
import { patchProfile, putHandle, putPhoto, updateCachedMe } from "./profile";

/** A save that stopped at one call. The calls before it went through and are in the cached `me`, so the next save starts after them. */
export class SaveError extends Error {
  constructor(
    readonly step: SaveStep["call"],
    readonly reason: ApiError,
  ) {
    super(`${step}: ${reason.code ?? reason.kind}`);
    this.name = "SaveError";
  }
}

export interface SaveEnv {
  api: ApiClient;
  queryClient: QueryClient;
  /** Reads the prepared picture. It fails when the file is gone. */
  loadPhoto: () => Promise<Blob>;
  /** A number from 0 to 1 while the picture goes up. */
  onUploadProgress?: (fraction: number) => void;
}

/** The code a picture that cannot be read back gets, as if the server had said it. */
export const PHOTO_UNREADABLE = "photo_unreadable";

/**
 * Makes the calls of a save in order and keeps the cached `me` current after each, so a failure halfway leaves the form showing
 * what is stored and a retry sends only what is left.
 */
export async function runSave({ api, queryClient, loadPhoto, onUploadProgress }: SaveEnv, steps: readonly SaveStep[]): Promise<void> {
  for (const step of steps) {
    try {
      if (step.call === "profile") {
        const me = await patchProfile(api, step.body);
        updateCachedMe(queryClient, () => me);
      } else if (step.call === "photo") {
        const blob = await loadPhoto().catch(() => {
          throw new ApiError("validation", null, PHOTO_UNREADABLE);
        });
        onUploadProgress?.(0);
        const { photo } = await putPhoto(api, blob, (sent, total) => onUploadProgress?.(uploadProgress(sent, total)));
        // A new face sends an approved handle back to review, as the server does.
        updateCachedMe(queryClient, (me) => ({
          ...me,
          profile: { ...me.profile, photo },
          handle: me.handle.state === "approved" ? { ...me.handle, state: "pending" } : me.handle,
        }));
      } else {
        await putHandle(api, step.body);
        updateCachedMe(queryClient, (me) => ({
          ...me,
          handle: { state: "pending", kind: step.body.kind, handle: step.body.handle, rejectReason: null },
        }));
      }
    } catch (error) {
      if (isApiError(error)) throw new SaveError(step.call, error);
      throw error;
    }
  }
}
