// Board: B16.1
import { Stack } from "expo-router";
import { useStep } from "@/providers/step";
import { SignInFlowProvider } from "@/screens/signin/SignInFlow";
import { useColors } from "@/ui/theme";

/** One step's screens are open at a time. The router moves a person to the open one when the step changes, so a screen from an earlier step cannot be reached by back or by link. */
export default function OnboardingLayout() {
  const step = useStep();
  const colors = useColors();
  return (
    <SignInFlowProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={step === "welcome"}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={step === "notice"}>
          <Stack.Screen name="notice" />
        </Stack.Protected>
        <Stack.Protected guard={step === "sign_in"}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="code" />
        </Stack.Protected>
        <Stack.Protected guard={step === "profile"}>
          <Stack.Screen name="profile" />
        </Stack.Protected>
      </Stack>
    </SignInFlowProvider>
  );
}
