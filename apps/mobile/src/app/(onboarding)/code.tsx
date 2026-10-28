// Board: B2.2
import { Redirect, router } from "expo-router";
import { CodeScreen } from "@/screens/signin/CodeScreen";
import { useSignInFlow } from "@/screens/signin/SignInFlow";

export default function Code() {
  const { challenge } = useSignInFlow();
  // A cold start on this route has no code to enter, so go to the phone step.
  if (!challenge) return <Redirect href="/sign-in" />;
  return <CodeScreen onChangeNumber={() => router.back()} />;
}
