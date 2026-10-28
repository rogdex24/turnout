import { requestOtp } from "@/api/auth";
import { resendAt, type SendFailure, sendFailure } from "@/model/otpFlow";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { useSignInFlow } from "./SignInFlow";

export type SendResult = { ok: true } | { ok: false; failure: SendFailure };

/**
 * Asks for a code. On Android the handshake goes to WhatsApp first, so the one-tap button can come back with the code; then the
 * server sends it. A failure cancels the handshake, so a late code from nowhere is ignored.
 */
export function useSendCode(): (phone: string) => Promise<SendResult> {
  const api = useApi();
  const { whatsappOtp } = useDeps();
  const { begin } = useSignInFlow();
  return async (phone) => {
    whatsappOtp.cancelHandshake();
    whatsappOtp.startHandshake();
    try {
      const { challengeId } = await requestOtp(api, phone);
      const sentAt = Date.now();
      begin({ phone, challengeId, sentAt, resendOpensAt: resendAt(sentAt) });
      return { ok: true };
    } catch (error) {
      whatsappOtp.cancelHandshake();
      return { ok: false, failure: sendFailure(error) };
    }
  };
}
