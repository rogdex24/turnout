import { z } from "zod";

/**
 * Every app API error is `{ error: { code, message } }`. `code` is a stable snake_case string
 * the app switches on; `message` is for logs and is never shown as is. The list of codes grows
 * with the endpoints (M2 onward).
 */
export const errorBodySchema = z.object({
  error: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
    message: z.string(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;
