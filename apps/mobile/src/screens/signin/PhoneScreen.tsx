import { useState } from "react";
import { allowSeedNumbers } from "@/api/variant";
import { phoneFieldText } from "@/model/otpFlow";
import { parsePhoneInput } from "@/model/phone";
import { useDeps } from "@/providers/AppProviders";
import { sendFailureText } from "./messages";
import { PhoneView } from "./PhoneView";
import { useSignInFlow } from "./SignInFlow";
import { useSendCode } from "./useSendCode";

/** The phone step: checks the number, asks for the code, then moves to the code screen. */
export function PhoneScreen({ onSent }: { onSent: () => void }) {
  const { draft, setDraft } = useSignInFlow();
  const { whatsappOtp } = useDeps();
  const sendCode = useSendCode();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeds = allowSeedNumbers();

  const send = async () => {
    if (sending) return;
    const parsed = parsePhoneInput(draft, { allowSeedNumbers: seeds });
    if (!parsed.ok) {
      setError(sendFailureText({ kind: "bad_phone" }));
      return;
    }
    setError(null);
    setSending(true);
    const result = await sendCode(parsed.phone);
    setSending(false);
    if (result.ok) onSent();
    else setError(sendFailureText(result.failure));
  };

  return (
    <PhoneView
      value={draft}
      onChangeText={(text) => {
        setError(null);
        setDraft(phoneFieldText(text, { allowSeedNumbers: seeds }));
      }}
      onSend={send}
      sending={sending}
      error={error}
      noWhatsApp={whatsappOtp.isInstalled() === false}
    />
  );
}
