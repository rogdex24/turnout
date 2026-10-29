import { z } from "zod";

export const PUSH_PLATFORM_NAMES = ["android", "ios"] as const;
export const pushPlatformSchema = z.enum(PUSH_PLATFORM_NAMES);
export type PushPlatformName = z.infer<typeof pushPlatformSchema>;

/** What Expo hands the app: `ExponentPushToken[...]` or `ExpoPushToken[...]`. */
export const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/;

/** POST /devices. */
export const registerDeviceRequestSchema = z
  .object({ expoPushToken: z.string().regex(EXPO_PUSH_TOKEN), platform: pushPlatformSchema })
  .strict();
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const registerDeviceResponseSchema = z.object({ deviceId: z.string() });
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
