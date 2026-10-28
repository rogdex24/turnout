/** How long a wait is said aloud: seconds under a minute, then whole minutes, then hours. */
export function waitPhrase(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export const signin = {
  phone: {
    title: "Your phone number",
    lead: "We'll send a code on WhatsApp.",
    label: "Phone number",
    prefixLabel: "Country code plus 91",
    prefix: "+91",
    help: "It can be on another phone.",
    /** Shown instead of the help line when this phone has no WhatsApp app. */
    noWhatsApp: "We'll send the code on WhatsApp. It can be on another phone.",
    send: "Send code",
    sending: "Sending the code",
    errors: {
      badPhone: "Enter a 10 digit mobile number.",
      refused: "We can't sign you in with this number.",
      paused: "Sign-in is paused for today. Try again tomorrow.",
      wait: (seconds: number) => `Too many tries. Try again in ${waitPhrase(seconds)}.`,
      couldNotSend: "We couldn't send the code. Try again in a minute.",
      offline: "You're offline. Connect and try again.",
      server: "Something went wrong on our side. Try again in a moment.",
    },
  },
  code: {
    title: "Enter the code",
    lead: (phone: string) => `Sent on WhatsApp to ${phone}`,
    changeNumber: "Change number",
    codeLabel: "6 digit code",
    codeProgress: (entered: number, total: number) => `${entered} of ${total} entered`,
    paste: "Paste",
    pasteEmpty: "No 6 digit code on the clipboard.",
    notThereYet: "Not there yet?",
    sendAgain: "Send again",
    sendAgainIn: (seconds: number) => `Send again in ${seconds}s`,
    checking: "Checking the code",
    resending: "Sending a new code",
    resent: "We sent a new code.",
    wrong: (left: number) => (left === 1 ? "That code isn't right. 1 try left." : `That code isn't right. ${left} tries left.`),
    tooManyTries: "Too many wrong codes. Ask for a new one.",
    refused: "We can't sign you in with this number.",
    updateApp: "Update the app to sign in.",
    wait: (seconds: number) => `Too many tries. Try again in ${waitPhrase(seconds)}.`,
    offline: "You're offline. Connect and try again.",
    server: "Something went wrong on our side. Try again in a moment.",
    paused: "Sign-in is paused for today. Try again tomorrow.",
    couldNotSend: "We couldn't send a new code. Try again in a minute.",
    notDelivered: "The code didn't arrive. Send it again.",
    notOnWhatsApp: {
      title: "That number isn't on WhatsApp",
      body: "We send the code on WhatsApp. Change the number to one that has it.",
    },
  },
} as const;
