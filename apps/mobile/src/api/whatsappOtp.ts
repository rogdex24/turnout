/**
 * The phone's side of the WhatsApp code handshake. On Android a native module sends the handshake to WhatsApp and hears back the
 * code when the person taps the one-tap button. Everywhere else, and in tests, a stub stands in: typing and pasting still work.
 */
export interface WhatsAppOtp {
  /** Whether a WhatsApp app is on this phone. null when the phone cannot say (iOS), which the screens treat as "maybe". */
  isInstalled(): boolean | null;
  /** Tell WhatsApp a code is coming. Call before asking the server to send it. */
  startHandshake(): void;
  /** Forget the handshake, so a late code from an earlier send is ignored. */
  cancelHandshake(): void;
  /** Called with the code when WhatsApp hands one over. Returns the way to stop listening. */
  onCode(listener: (code: string) => void): () => void;
}

export interface StubWhatsAppOtp extends WhatsAppOtp {
  /** Pretend WhatsApp delivered a code (tests and stories). */
  deliver(code: string): void;
  handshakes(): number;
}

export function createStubWhatsAppOtp(options: { installed?: boolean | null } = {}): StubWhatsAppOtp {
  const listeners = new Set<(code: string) => void>();
  let handshakes = 0;
  let open = false;
  return {
    isInstalled: () => options.installed ?? null,
    startHandshake() {
      handshakes += 1;
      open = true;
    },
    cancelHandshake() {
      open = false;
    },
    onCode(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    deliver(code) {
      if (!open) return;
      open = false;
      for (const listener of listeners) listener(code);
    },
    handshakes: () => handshakes,
  };
}
