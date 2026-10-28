import type { HandleRejectReason } from "@turnout/contract/profile";
import type { TicketRejectReason } from "@turnout/contract/ticket";

/** The fixed reasons the API accepts, in the words the operator picks from. A new reason in the contract fails the type here. */
export const TICKET_REASONS: Record<TicketRejectReason, string> = {
  unreadable: "Unreadable",
  wrong_show: "Wrong show",
  wrong_date: "Wrong date",
  not_a_ticket: "Not a ticket",
  duplicate: "Duplicate",
};

export const HANDLE_REASONS: Record<HandleRejectReason, string> = {
  not_found: "Profile not found",
  private_or_empty: "Private or empty",
  not_matching_photo: "Does not match the photo",
  not_a_person: "Not a person",
};

/** "5h 12m", or "under a minute" when time is nearly out. */
export function timeLeft(minutes: number): string {
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
