// Board: B16.1
import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { isApiError } from "@/model/apiError";
import type { OnboardingStep } from "@/model/gates";
import { AppProviders, useDeps } from "@/providers/AppProviders";
import { useGate, useMe } from "@/providers/hooks";
import { holdSplash, releaseSplash } from "@/providers/splash";
import { StepContext } from "@/providers/step";
import { useBoot } from "@/providers/useBoot";
import { StartFailed } from "@/screens/boot/StartFailed";
import { useColors } from "@/ui/theme";

holdSplash();

export default function RootLayout() {
  const { boot, retry } = useBoot();
  return (
    <GestureHandlerRootView className="flex-1 bg-bg">
      <StatusBar style="auto" />
      {boot.state === "ready" ? (
        <AppProviders deps={boot.deps}>
          <Routes />
        </AppProviders>
      ) : boot.state === "failed" ? (
        <BootFailed onRetry={retry} />
      ) : null}
    </GestureHandlerRootView>
  );
}

function BootFailed({ onRetry }: { onRetry: () => void }) {
  useEffect(releaseSplash, []);
  return <StartFailed onRetry={onRetry} />;
}

function MeFailed() {
  const me = useMe();
  const { connectivity } = useDeps();
  const reason = me.error ?? me.failureReason;
  const kind = isApiError(reason) && reason.kind === "offline" ? "offline" : "server";
  return (
    <StartFailed
      kind={kind}
      onRetry={() => {
        // A person pressing the button wants the network tried, even though the last attempt marked it down.
        connectivity.report(true);
        void me.refetch();
      }}
    />
  );
}

/**
 * The route tree: `(onboarding)` until the account is ready, `(app)` after. While the session, the disk cache or `/me` is still
 * answering, the splash stays up (or the last screen stays, between sign-in and the first `/me`), so nothing shows and is then
 * replaced. A person who is not allowed on a route is moved to the first one they may use.
 */
function Routes() {
  const colors = useColors();
  const gate = useGate();
  const [held, setHeld] = useState<OnboardingStep | null>(null);
  if (gate.kind === "ready" && gate.step !== held) setHeld(gate.step);
  const step = gate.kind === "ready" ? gate.step : held;

  useEffect(() => {
    if (step !== null || gate.kind === "error") releaseSplash();
  }, [step, gate.kind]);

  if (gate.kind === "error") return <MeFailed />;
  if (step === null) return null;
  return (
    <StepContext value={step}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={step !== "done"}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={step === "done"}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </StepContext>
  );
}
