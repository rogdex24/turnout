/**
 * What deleting an account erases and what it keeps. One list, two places: the app's delete screen and the site's
 * `/delete-account` page (the store deletion URL). The lists follow docs/data-map.md. The phone number is named once,
 * as kept only if the account was banned.
 */
export const DELETION_ERASED = [
  "Your name, photo and gender",
  "Your Instagram or LinkedIn handle",
  "Your plans, tickets and messages",
  "Your place in any group",
  "Your phone number",
] as const;

export const DELETION_KEPT = [
  "A record that you agreed to our notice, and any reports you made or that were made about you. They stay for one year under a number that doesn't name you.",
  "A scrambled one-way form of your phone number, only if the account was banned. It cannot be turned back into the number.",
] as const;
