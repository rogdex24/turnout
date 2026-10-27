/**
 * The privacy notice a person agrees to when they sign in. One text, three places: `GET /config` (the app shows it before the
 * code is verified), the site's `/privacy` page (the store privacy URL) and `docs/privacy-policy.md`, which a test keeps in step.
 * Change the text and the version together: a new version asks everyone to agree again (`POST /me/consent`).
 */
export const NOTICE_VERSION = "2026-10-26";

/** Paragraphs, in order. The grievance block is added from the host's settings where the notice is shown. */
export const NOTICE_PARAGRAPHS = [
  "Turnout helps people who want to go to a show find a few others going to the same one. This notice says what we keep about you and why.",
  "What we keep: your phone number, your first name, your gender, one photo of you, your Instagram or LinkedIn handle (only the handle; we do not read your account), and what you do in the app: the shows you join, the ticket proof you send, messages in your group and any report you make.",
  "Why: your phone number is how you sign in. Your name and photo are shown to the others in your group from three hours before the show, so you can find each other. Your gender decides which groups you can join. Your handle is looked at by the operator to check that a real person is behind the account. Ticket proof is looked at once and the file is deleted soon after the show.",
  "Who sees it: the operator, who runs the service, and the people in your group, who see your first name and photo only. Nobody sees your phone number or your handle. We do not sell your data and we do not show advertising.",
  "Who helps us: your sign-in code is sent through WhatsApp, a service of Meta, so Meta handles your phone number to deliver that message. If you are banned, we keep a one-way scrambled form of your phone number so the ban holds; it cannot be turned back into the number.",
  "How long: your details stay until you delete your account. Messages are removed 30 days after the show. Ticket files are removed within a day of the show. After you delete your account, a record that you agreed to this notice stays for one year, under a number that does not name you.",
  "Your choices: you can change your details in the app, and you can delete your account in Settings at any time. You can also write to the grievance officer below to ask what we hold about you or to ask us to correct it.",
] as const;

export const NOTICE_TEXT: string = NOTICE_PARAGRAPHS.join("\n\n");
