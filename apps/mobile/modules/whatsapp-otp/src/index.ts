import { type EventSubscription, NativeModule, requireOptionalNativeModule } from "expo";

type NativeEvents = { onCode: (event: { code: string }) => void };

declare class WhatsAppOtpNative extends NativeModule<NativeEvents> {
  isInstalled(): boolean;
  startHandshake(): void;
  cancelHandshake(): void;
  takePendingCode(): string | null;
}

/** The Android module, or null on iOS, in Jest and in any build made before the module was added. */
export const native = requireOptionalNativeModule<WhatsAppOtpNative>("WhatsAppOtp");

export type { EventSubscription };
