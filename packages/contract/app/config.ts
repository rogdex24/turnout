import { z } from "zod";

/** GET /config. No sign-in needed: the app reads it before the first screen. */
export const configResponseSchema = z.object({
  notice: z.object({ version: z.string(), text: z.string() }),
  push: z.object({ android: z.boolean(), ios: z.boolean() }),
  support: z.object({ email: z.string() }),
  minAppVersion: z.string(),
  grievance: z.object({
    name: z.string(),
    address: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
});
export type ConfigResponse = z.infer<typeof configResponseSchema>;

/** `1.2.3` against `1.10.0`, by number. Anything that is not three numbers counts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : [0, 0, 0]);
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
