/** Every user-facing string lives under src/copy. The show page. */
export const show = {
  back: "Back",
  buy: (source: string) => `Buy on ${source}`,
  buyFallback: "Buy tickets",
  buyLabel: (source: string) => `Buy on ${source}, opens in your browser`,
  buyLabelFallback: "Buy tickets, opens in your browser",
  from: "From",
  ticketLabel: "Ticket",
  looking: {
    none: "Nobody is looking for a group yet. Be the first.",
    one: "person is looking for a group",
    many: "people are looking for a group",
  },
  how: {
    title: "How it works",
    body: "Add your ticket. See your group 3 hours before. Meet at a cafe, go in together.",
  },
  creditPrefix: "Listing from",
  credit: (source: string) => `Listing from ${source}`,
  creditLabel: (source: string) => `Listing from ${source}, opens in your browser`,
  go: "Go with a group",
  goOff: {
    notEligible: "Groups aren't open for this show.",
  },
  comingSoon: {
    title: "Coming soon in this build",
    lead: "Going with a group isn't switched on yet. You can still buy tickets and come back.",
    close: "Got it",
  },
  loading: "Loading the show",
  notFound: {
    title: "This show isn't here any more",
    body: "It may have been taken down or the link may be wrong. See what's on instead.",
    action: "See all shows",
  },
  openFailed: "We couldn't open that link.",
} as const;
