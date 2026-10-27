import { z } from "zod";

/** The loosest a phone can be before the server looks at it. The server does the real parsing (`bad_phone`). */
export const phoneInputSchema = z.string().trim().min(5).max(20);

export const OTP_CODE_DIGITS = 6;
export const otpCodeSchema = z.string().regex(/^\d{6}$/);

/** POST /auth/otp. */
export const otpRequestSchema = z
  .object({
    phone: phoneInputSchema,
    purpose: z.literal("sign_in"),
  })
  .strict();
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpChallengeResponseSchema = z.object({
  challengeId: z.string(),
  expiresAt: z.string(),
});
export type OtpChallengeResponse = z.infer<typeof otpChallengeResponseSchema>;

/** What the app is told about the message. The server's `pending` shows as `sent` and `reviewer` as `delivered`. */
export const OTP_DELIVERY_STATUSES = ["sent", "delivered", "read", "failed", "undeliverable"] as const;
export const otpDeliveryStatusSchema = z.enum(OTP_DELIVERY_STATUSES);
export type OtpDeliveryStatus = z.infer<typeof otpDeliveryStatusSchema>;

/** GET /auth/otp/:challengeId. */
export const otpStatusResponseSchema = z.object({ deliveryStatus: otpDeliveryStatusSchema });
export type OtpStatusResponse = z.infer<typeof otpStatusResponseSchema>;

/** POST /auth/otp/verify. */
export const otpVerifyRequestSchema = z
  .object({
    challengeId: z.string().min(1).max(40),
    phone: phoneInputSchema,
    code: otpCodeSchema,
    noticeVersion: z.string().min(1).max(40),
  })
  .strict();
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequestSchema>;

/** The answer to verify and to refresh. Times are ISO UTC. */
export const tokenPairSchema = z.object({
  accessToken: z.string(),
  accessExpiresAt: z.string(),
  refreshToken: z.string(),
  refreshExpiresAt: z.string(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

/** POST /auth/refresh. */
export const refreshRequestSchema = z.object({ refreshToken: z.string().min(16).max(200) }).strict();
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
