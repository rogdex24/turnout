import { native } from "../../modules/whatsapp-otp/src";
import { createStubWhatsAppOtp, type WhatsAppOtp } from "./whatsappOtp";

/** The Android module when the build has it, the stub otherwise. */
export function createWhatsAppOtp(): WhatsAppOtp {
  const module = native;
  if (module === null) return createStubWhatsAppOtp();
  return {
    isInstalled: () => module.isInstalled(),
    startHandshake: () => module.startHandshake(),
    cancelHandshake: () => module.cancelHandshake(),
    onCode(listener) {
      const subscription = module.addListener("onCode", ({ code }) => listener(code));
      // A code can arrive while nothing listens, for example when WhatsApp brings a backgrounded app forward.
      const waiting = module.takePendingCode();
      if (waiting !== null) listener(waiting);
      return () => subscription.remove();
    },
  };
}
