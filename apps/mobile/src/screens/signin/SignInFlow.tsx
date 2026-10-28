import { createContext, type ReactNode, use, useState } from "react";

/** One code that was asked for: who it went to and when the next one may be asked for. */
export interface Challenge {
  /** The full phone number, +91 and ten digits. */
  phone: string;
  challengeId: string;
  sentAt: number;
  resendOpensAt: number;
}

interface SignInFlow {
  /** What is typed in the phone field, kept so Change number comes back to it. */
  draft: string;
  setDraft: (text: string) => void;
  challenge: Challenge | null;
  begin: (challenge: Challenge) => void;
}

const FlowContext = createContext<SignInFlow | null>(null);

/** Holds the phone screen's draft and the code that was sent, for the two sign-in screens. Mounted around the onboarding stack. */
export function SignInFlowProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Start with a code already sent (stories and tests). */
  initial?: { draft?: string; challenge?: Challenge };
}) {
  const [draft, setDraft] = useState(initial?.draft ?? "");
  const [challenge, begin] = useState<Challenge | null>(initial?.challenge ?? null);
  return <FlowContext value={{ draft, setDraft, challenge, begin }}>{children}</FlowContext>;
}

export function useSignInFlow(): SignInFlow {
  const flow = use(FlowContext);
  if (flow === null) throw new Error("useSignInFlow needs a SignInFlowProvider");
  return flow;
}
