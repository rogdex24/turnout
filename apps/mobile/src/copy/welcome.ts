export const welcome = {
  wordmark: "Turnout",
  /** What every card says about who is on the app. Plain about what is checked, and it does not use the word for a passed check. */
  trust: "Everyone signs in with a phone number, a real photo and a social profile we check.",
  skip: "Skip",
  next: "Next",
  start: "Get started",
  cards: [
    {
      headline: "Go to the show.\nMeet people there.",
      body: "Join a small group with tickets to the same show. Meet at a cafe an hour before, then go in together.",
    },
    {
      headline: "Pick a show.\nWe find your group.",
      body: "Say which show you have a ticket for. We put you with a few others who are going. You can choose a women-only group.",
    },
    {
      headline: "Meet first.\nThen go in together.",
      body: "Your group gets a chat and a meeting spot. Nobody has to talk all night. You are just not walking in alone.",
    },
  ],
} as const;
