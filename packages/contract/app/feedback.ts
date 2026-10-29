import { z } from "zod";

/** POST /groups/:groupId/downvotes. The answer is 204 with no body, the first time and on a repeat. */
export const downvoteRequestSchema = z.object({ memberRef: z.string().min(1).max(64) }).strict();
export type DownvoteRequest = z.infer<typeof downvoteRequestSchema>;

export const blockedPersonSchema = z.object({
  firstName: z.string(),
  showTitle: z.string(),
  /** The show's start, as an ISO time. */
  date: z.string(),
});
export type BlockedPerson = z.infer<typeof blockedPersonSchema>;

/** GET /me/blocked: people the caller downvoted or reported. View only. */
export const blockedResponseSchema = z.object({ blocked: z.array(blockedPersonSchema) });
export type BlockedResponse = z.infer<typeof blockedResponseSchema>;
