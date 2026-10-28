import { z } from "zod";

export const REPORT_MAX_CHARS = 2000;

/** What counts as a character: a code point, the way the database counts length. */
const chars = (value: string): number => [...value].length;

/**
 * POST /reports. `memberRef` is the person's ref in the group, the same one the thread shows; `messageId` is optional and, when
 * given, must be one of their messages in that group. The text is trimmed; `clientId` makes a retry store once.
 */
export const createReportRequestSchema = z
  .object({
    groupId: z.string().min(1).max(40),
    memberRef: z.string().min(1).max(64),
    messageId: z.string().min(1).max(40).optional(),
    body: z
      .string()
      .trim()
      .refine((value) => chars(value) >= 1 && chars(value) <= REPORT_MAX_CHARS, "the report must be 1 to 2,000 characters"),
    clientId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const createReportResponseSchema = z.object({ reportId: z.string() });
export type CreateReportResponse = z.infer<typeof createReportResponseSchema>;
