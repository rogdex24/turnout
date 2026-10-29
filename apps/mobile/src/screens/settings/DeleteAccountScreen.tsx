import { useQuery } from "@tanstack/react-query";
import type { DeleteCodeResponse } from "@turnout/contract/app/me";
import { useState } from "react";
import { deleteAccount as deleteAccountCall, requestDeleteCode } from "@/api/me";
import { plansListQuery } from "@/api/plans";
import { endAfterDeletion } from "@/api/signOut";
import { deleteAccount } from "@/copy/deleteAccount";
import { isApiError } from "@/model/apiError";
import { groupWillBeTold } from "@/model/deletion";
import { OTP, type SendFailure, sendFailure, type VerifyFailure, verifyFailure } from "@/model/otpFlow";
import { useDeps } from "@/providers/AppProviders";
import { useApi, useMe } from "@/providers/hooks";
import { useNow } from "@/providers/useNow";
import { DeleteAccountView, type DeleteStep } from "./DeleteAccountView";

const text = deleteAccount.errors;

/** What a failed send or a refused code says. Every refusal reads as a fault on our side: this flow never says why a number was turned away. */
export function deleteFailureText(failure: SendFailure | VerifyFailure): string {
  switch (failure.kind) {
    case "offline":
      return text.offline;
    case "wait":
      return text.limit;
    case "could_not_send":
      return text.cantSend;
    case "wrong_code":
      return text.wrong(failure.triesLeft);
    case "too_many_tries":
      return text.tooManyTries;
    default:
      return text.server;
  }
}

/**
 * The deletion flow. Explain and confirm change nothing; "Send code to delete" asks the server for a code on WhatsApp; the right code
 * deletes the account (`DELETE /me`, 204), and then this phone forgets everything, the welcome cards too, so the app starts at Welcome.
 * A code that is wrong leaves the account as it was.
 */
export function DeleteAccountScreen({ onBack }: { onBack: () => void }) {
  const api = useApi();
  const { session, wipe } = useDeps();
  const me = useMe().data;
  const plans = useQuery(plansListQuery(api));
  const now = useNow(60_000);

  const [step, setStep] = useState<DeleteStep>("explain");
  const [challenge, setChallenge] = useState<DeleteCodeResponse | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongTries, setWrongTries] = useState(0);

  const sendCode = async () => {
    if (sending) return;
    setSending(true);
    setMessage(null);
    try {
      setChallenge(await requestDeleteCode(api));
      setCode("");
      setWrongTries(0);
      setStep("code");
    } catch (error) {
      setMessage(deleteFailureText(sendFailure(error)));
    } finally {
      setSending(false);
    }
  };

  const submit = async (digits: string) => {
    if (deleting || challenge === null || digits.length !== OTP.codeLength) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteAccountCall(api, { challengeId: challenge.challengeId, code: digits });
    } catch (error) {
      const tries = isApiError(error) && error.code === "invalid_code" ? wrongTries + 1 : wrongTries;
      setWrongTries(tries);
      setMessage(deleteFailureText(verifyFailure(error, tries)));
      setCode("");
      setDeleting(false);
      return;
    }
    // The account is gone, so every token is dead already. If this phone cannot finish forgetting (a keychain fault), the next
    // request signs it out the same way; there is nothing the person can do about it here.
    await endAfterDeletion(session, wipe).catch(() => undefined);
  };

  const back = () => {
    if (deleting || sending) return;
    if (step === "code") setStep("confirm");
    else if (step === "confirm") setStep("explain");
    else onBack();
  };

  return (
    <DeleteAccountView
      step={step}
      last4={me?.phoneLast4 ?? ""}
      groupWillBeTold={groupWillBeTold(plans.data?.plans ?? [], now)}
      code={code}
      onCodeChange={(digits) => {
        setCode(digits);
        setMessage(null);
        void submit(digits);
      }}
      sending={sending}
      deleting={deleting}
      message={message}
      onContinue={() => setStep("confirm")}
      onSend={() => void sendCode()}
      onSendAgain={() => void sendCode()}
      onKeep={onBack}
      onBack={back}
    />
  );
}
