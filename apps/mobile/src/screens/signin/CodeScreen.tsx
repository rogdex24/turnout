import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import * as Clipboard from "expo-clipboard";
import { useEffect, useEffectEvent, useState } from "react";
import { otpDeliveryStatus, verifyOtp } from "@/api/auth";
import { signin } from "@/copy/signin";
import { isApiError } from "@/model/apiError";
import {
  askAgainAt,
  codeFromText,
  type DeliveryOutcome,
  deliveryOutcome,
  OTP,
  pollRemainingMs,
  type SendFailure,
  verifyFailure,
} from "@/model/otpFlow";
import { formatIndianMobile } from "@/model/phone";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useLocalFlags } from "@/providers/hooks";
import { useNow } from "@/providers/useNow";
import { CodeView } from "./CodeView";
import { resendFailureText, verifyFailureText } from "./messages";
import { type Challenge, useSignInFlow } from "./SignInFlow";
import { useSendCode } from "./useSendCode";

/** A phone shown the way it was typed: +91 in two groups of five, or a seed number whole. */
const phoneLabel = (phone: string) => (phone.startsWith("+91") ? formatIndianMobile(phone.slice(3)) : phone);

/** The code step. Without a code that was sent (a cold start on this route) there is nothing to show. */
export function CodeScreen({ onChangeNumber }: { onChangeNumber: () => void }) {
  const { challenge } = useSignInFlow();
  return challenge ? <CodeStep challenge={challenge} onChangeNumber={onChangeNumber} /> : null;
}

function CodeStep({ challenge, onChangeNumber }: { challenge: Challenge; onChangeNumber: () => void }) {
  const api = useApi();
  const { session, whatsappOtp } = useDeps();
  const { acceptedNotice } = useLocalFlags();
  const sendCode = useSendCode();
  const now = useNow();

  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongTries, setWrongTries] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [delivery, setDelivery] = useState<DeliveryOutcome>("waiting");

  const submit = async (digits: string) => {
    if (checking || digits.length !== OTP.codeLength) return;
    setChecking(true);
    setMessage(null);
    try {
      const pair = await verifyOtp(api, {
        challengeId: challenge.challengeId,
        phone: challenge.phone,
        code: digits,
        noticeVersion: acceptedNotice ?? NOTICE_VERSION,
      });
      // Signing in moves the router on; this screen is gone after that.
      await session.signIn(pair);
    } catch (error) {
      const tries = isApiError(error) && error.code === "invalid_code" ? wrongTries + 1 : wrongTries;
      setWrongTries(tries);
      const failure = verifyFailure(error, tries);
      if (failure.kind === "too_many_tries") setCancelled(true);
      if (failure.kind === "wait") setBlockedUntil(Date.now() + failure.seconds * 1000);
      setMessage(verifyFailureText(failure));
      setCode("");
    } finally {
      setChecking(false);
    }
  };

  const onWhatsAppCode = useEffectEvent((digits: string) => {
    setCode(digits);
    void submit(digits);
  });
  useEffect(() => whatsappOtp.onCode((digits) => onWhatsAppCode(digits)), [whatsappOtp]);

  const pollDelivery = useEffectEvent((id: string) => otpDeliveryStatus(api, id));
  // Ask the server about this code every 3 seconds for 2 minutes: it learns from WhatsApp whether the message arrived.
  useEffect(() => {
    const startedAt = Date.now();
    let inFlight = false;
    let stopped = false;
    const timer = setInterval(async () => {
      if (inFlight || stopped) return;
      if (pollRemainingMs(startedAt, Date.now()) === 0) {
        clearInterval(timer);
        return;
      }
      inFlight = true;
      try {
        const status = await pollDelivery(challenge.challengeId);
        const outcome = status === null ? "waiting" : deliveryOutcome(status);
        if (stopped || outcome === "waiting") return;
        clearInterval(timer);
        if (outcome === "not_delivered") setMessage(signin.code.notDelivered);
        if (outcome !== "done") setDelivery(outcome);
      } catch {
        // Offline or a hiccup: the next tick asks again.
      } finally {
        inFlight = false;
      }
    }, OTP.pollEveryMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [challenge.challengeId]);

  const sendAgain = async () => {
    if (resending) return;
    setResending(true);
    setMessage(null);
    const result = await sendCode(challenge.phone);
    setResending(false);
    if (result.ok) {
      setCode("");
      setWrongTries(0);
      setCancelled(false);
      setDelivery("waiting");
      setMessage(signin.code.resent);
      return;
    }
    const failure: SendFailure = result.failure;
    if (failure.kind === "wait") setBlockedUntil(Date.now() + failure.seconds * 1000);
    setMessage(resendFailureText(failure));
  };

  const paste = async () => {
    const digits = codeFromText(await Clipboard.getStringAsync());
    if (digits === "") {
      setMessage(signin.code.pasteEmpty);
      return;
    }
    setCode(digits);
    await submit(digits);
  };

  const opensAt = Math.max(challenge.resendOpensAt, blockedUntil);
  const askAgain = now >= askAgainAt(challenge.sentAt, challenge.resendOpensAt) || cancelled || delivery === "not_delivered";

  return (
    <CodeView
      phoneLabel={phoneLabel(challenge.phone)}
      value={code}
      onChangeText={(digits) => {
        setCode(digits);
        setMessage(null);
        void submit(digits);
      }}
      checking={checking}
      resending={resending}
      message={message}
      notOnWhatsApp={delivery === "not_on_whatsapp"}
      askAgain={askAgain}
      resendInSeconds={Math.max(0, Math.ceil((opensAt - now) / 1000))}
      onSendAgain={sendAgain}
      onPaste={paste}
      onChangeNumber={onChangeNumber}
      onBack={onChangeNumber}
    />
  );
}
