/**
 * The text of `how-matching-works.md` as the screen draws it: a title, then sections of a heading and either a lead sentence or a
 * list. Metro does not bundle Markdown, so the file is the place to edit and `howMatchingWorks.test.ts` fails when this drifts.
 */
export interface MatchingSection {
  heading: string;
  /** A sentence or two. */
  text?: string;
  items?: readonly string[];
}

export const HOW_MATCHING_TITLE = "How matching works";

export const HOW_MATCHING_LEAD =
  "You pick a show you have a ticket for. We put you with a few other people who are going to the same show.";

export const HOW_MATCHING_SECTIONS: readonly MatchingSection[] = [
  {
    heading: "Before you can be matched",
    items: [
      "A phone that gets a WhatsApp code.",
      "Your first name, gender and a face photo.",
      "An Instagram or LinkedIn handle that we have checked.",
      "A ticket for the show that we have approved.",
    ],
  },
  {
    heading: "What we do with it",
    items: [
      "We make groups of 4 to 6 people for each show, a day before it.",
      "No group is ever mostly one gender. A group of 4 has at most 3 of one gender, a group of 5 at most 3, and a group of 6 at most 4.",
      "If you chose women and non-binary groups only, you are only put in groups of women and non-binary people who chose the same.",
      "If there are not enough people, you are not put in a group. We tell you, and you can try another show.",
    ],
  },
  {
    heading: "When you find out who",
    items: [
      "Names, photos and the meeting cafe appear 3 hours before the show.",
      "Before that, you only see how many people are in your group.",
      "Your group gets a chat that stays open until a day after the show.",
    ],
  },
  {
    heading: "If something is wrong",
    items: [
      "Report anyone in your group. The person is stopped from being matched while we look.",
      "You can leave a plan whenever you like.",
    ],
  },
];

/** The page as Markdown, so a test can compare it with the file. */
export function howMatchingMarkdown(): string {
  const parts = [`# ${HOW_MATCHING_TITLE}`, HOW_MATCHING_LEAD];
  for (const section of HOW_MATCHING_SECTIONS) {
    parts.push(`## ${section.heading}`);
    if (section.text) parts.push(section.text);
    if (section.items) parts.push(section.items.map((item) => `- ${item}`).join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}
