import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { createStubWhatsAppOtp, type StubWhatsAppOtp } from "@/api/whatsappOtp";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, type TestApp, type TestAppOptions } from "@/providers/testing";
import { type Challenge, SignInFlowProvider } from "./SignInFlow";

export { SAMPLE_NATIONAL as TEST_NATIONAL, SAMPLE_PHONE as TEST_PHONE } from "./fixtures";

export interface MountedSignIn extends TestApp {
  whatsapp: StubWhatsAppOtp;
}

/** A sign-in screen over the real wiring, a scripted network and a stub WhatsApp. */
export async function mountSignIn(
  ui: ReactElement,
  options: TestAppOptions & { challenge?: Challenge; draft?: string; installed?: boolean | null } = {},
): Promise<MountedSignIn> {
  const whatsapp = createStubWhatsAppOtp({ installed: options.installed ?? true });
  const app = await createTestApp({ welcomeSeen: true, acceptedNotice: "2026-10-26", ...options, whatsappOtp: whatsapp });
  await render(
    <AppProviders deps={app.deps}>
      <SignInFlowProvider initial={{ challenge: options.challenge, draft: options.draft }}>{ui}</SignInFlowProvider>
    </AppProviders>,
  );
  return { ...app, whatsapp };
}
