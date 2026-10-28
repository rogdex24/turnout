import type { ProofKind, TicketRejectReason } from "@turnout/contract/ticket";
import type { TicketProblem } from "@/model/ticketFile";

/** Add your ticket: pick a screenshot, send it, wait for the check, or send another after a turn-down. */
export const ticket = {
  add: {
    title: {
      screenshot: "Add your BookMyShow ticket",
      screenshot_or_pdf: "Add your ticket",
    } satisfies Record<ProofKind, string>,
    lead: {
      screenshot: "A screenshot of your BookMyShow booking. JPEG, PNG or HEIC.",
      screenshot_or_pdf: "A screenshot or PDF of your booking. JPEG, PNG, HEIC or PDF.",
    } satisfies Record<ProofKind, string>,
    emptyTitle: "No screenshot yet",
    emptyBody: "Pick one from your photos",
    chosenPdf: "PDF ticket",
    chosenPhoto: "Screenshot",
    chosenLabel: (name: string) => `Chosen: ${name}`,
    shouldShow: "It should show",
    shows: ["The show", "The date and time", "How many seats"],
    choose: "Choose screenshot",
    choosePdf: "Choose screenshot or PDF",
    another: "Choose a different one",
    send: "Send for checking",
    sending: (percent: number) => `Sending, ${percent}%`,
    later: "I'll do it later",
  },
  deleted: "We delete it after the show",
  checking: {
    tileLabel: "Your screenshot",
    tileSent: "Sent",
    title: "Checking your ticket",
    body: "Usually within an hour. We'll tell you.",
    done: "Done",
  },
  notify: {
    title: "Get told when your group is ready?",
    on: "Turn on",
    notNow: "Not now",
  },
  rejected: {
    tileLabel: "Your screenshot",
    title: "We couldn't use this one",
    choose: "Choose another screenshot",
    reasons: {
      unreadable: "We couldn't read this screenshot. Take it from the booking page in BookMyShow so the show, date and seats are visible.",
      wrong_show: "This screenshot is for a different show. Open the booking for this show and take the screenshot there.",
      wrong_date:
        "We couldn't read the date on this screenshot. Take it from the booking page in BookMyShow so the show, date and seats are visible.",
      not_a_ticket: "This doesn't look like a booking. Take the screenshot from the booking page in BookMyShow.",
      duplicate: "This ticket is already on another plan. Send the one you booked for this show.",
    } satisfies Record<TicketRejectReason, string>,
    unknown: "We couldn't use this screenshot. Take it from the booking page in BookMyShow so the show, date and seats are visible.",
  },
  problems: {
    screenshot_required: "BookMyShow tickets are a screenshot, not a PDF. Choose a screenshot of your booking.",
    unsupported_type: "We can't use that kind of file. Choose a JPEG, PNG or HEIC picture.",
    too_large: "That file is too big. Choose one under 10 MB.",
    empty: "That file is empty. Choose another.",
    too_late: "The show is too close to add a ticket. You can still go on your own.",
    bad_ticket: "We couldn't open that file as a picture. Choose another.",
    rate_limited: "Too many tries. Wait a moment and try again.",
    offline: "You're offline. Your choice is kept. Send it when you're back online.",
    server: "Something went wrong on our side. Try again in a moment.",
    plan_closed: "This plan has ended, so it can't take a ticket.",
  } satisfies Record<TicketProblem, string>,
  load: {
    missing: "We couldn't find this plan.",
  },
} as const;
