import { DELETION_ERASED, DELETION_KEPT } from "@turnout/contract/app/deletion";

/**
 * Deleting the account. The lists are shared with the site's /delete-account page and come from docs/data-map.md: what goes,
 * and what stays and for how long. The phone number is named once, as kept only if the account was banned. The tone is plain:
 * no guilt and no second thoughts offered as a lure.
 */
export const deleteAccount = {
  title: "Delete your account",
  lead: "This erases your account from Turnout and signs you out of every phone.",
  erasedTitle: "What we delete",
  erased: DELETION_ERASED,
  keptTitle: "What we keep",
  kept: DELETION_KEPT,
  groupTold: "You have a plan with a group coming up. The group will be told someone left, never who.",
  continue: "Continue",
  confirm: {
    title: "Delete your account?",
    body: (last4: string) =>
      last4
        ? `We'll send a code on WhatsApp to your number ending ${last4}. Enter it and your account is deleted for good.`
        : "We'll send a code on WhatsApp to your number. Enter it and your account is deleted for good.",
    send: "Send code to delete",
    keep: "Keep my account",
  },
  code: {
    title: "Enter your code",
    lead: (last4: string) =>
      last4 ? `We sent a 6-digit code on WhatsApp to your number ending ${last4}.` : "We sent a 6-digit code on WhatsApp.",
    submit: "Delete my account",
    resend: "Send a new code",
    change: "Keep my account",
    deleting: "Deleting your account",
  },
  errors: {
    offline: "You're offline. Connect and try again.",
    server: "Something went wrong on our side. Try again in a moment.",
    limit: "Too many tries. Wait a moment and try again.",
    cantSend: "We couldn't send the code. Try again in a moment.",
    wrong: (left: number) => (left === 1 ? "That code isn't right. 1 try left." : `That code isn't right. ${left} tries left.`),
    tooManyTries: "Too many wrong codes. Ask for a new one.",
  },
} as const;
