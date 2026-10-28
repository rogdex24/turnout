// Board: B1.1
import { Redirect } from "expo-router";
import { useStep } from "@/providers/step";

/** A cold start lands on `/`, which belongs to Home once the account is ready. Until then it goes to the open step's first screen. */
export default function OnboardingEntry() {
  const step = useStep();
  if (step === "welcome") return <Redirect href="/welcome" />;
  if (step === "notice") return <Redirect href="/notice" />;
  if (step === "sign_in") return <Redirect href="/sign-in" />;
  return <Redirect href="/profile" />;
}
