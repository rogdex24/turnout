import { z } from "zod";

/**
 * Ticket proof. There is no booking ID field anywhere: the proof is a file the operator looks at.
 * BookMyShow tickets are a screenshot only (JPEG, PNG or HEIC); other sellers also take a PDF.
 */
export const BOOKMYSHOW_SOURCE = "bookmyshow";

export const PROOF_KINDS = ["screenshot", "screenshot_or_pdf"] as const;
export const proofKindSchema = z.enum(PROOF_KINDS);
export type ProofKind = z.infer<typeof proofKindSchema>;

export const TICKET_STATES = ["pending", "approved", "rejected"] as const;
export const ticketStateSchema = z.enum(TICKET_STATES);
export type TicketState = z.infer<typeof ticketStateSchema>;

/** The error code for a PDF sent for a BookMyShow show (400 `screenshot_required`). */
export const SCREENSHOT_REQUIRED_ERROR = "screenshot_required";

export const MAX_TICKET_BYTES = 10 * 1024 * 1024;

export const SCREENSHOT_MIME_TYPES = ["image/jpeg", "image/png", "image/heic"] as const;
export const PDF_MIME_TYPE = "application/pdf";

/** What a show's seller lets a member send. `source` is the event's source name. */
export function proofKindForSource(source: string): ProofKind {
  return source === BOOKMYSHOW_SOURCE ? "screenshot" : "screenshot_or_pdf";
}

export function allowedTicketMimeTypes(proofKind: ProofKind): readonly string[] {
  return proofKind === "screenshot" ? SCREENSHOT_MIME_TYPES : [...SCREENSHOT_MIME_TYPES, PDF_MIME_TYPE];
}

export type TicketFileCheck = { ok: true } | { ok: false; reason: "screenshot_required" | "unsupported_type" | "too_large" | "empty" };

/** Checks a file's declared type and size against the proof kind. The server still sniffs the bytes. */
export function checkTicketFile(proofKind: ProofKind, file: { mime: string; bytes: number }): TicketFileCheck {
  if (file.bytes <= 0) return { ok: false, reason: "empty" };
  if (file.bytes > MAX_TICKET_BYTES) return { ok: false, reason: "too_large" };
  if (file.mime === PDF_MIME_TYPE && proofKind === "screenshot") return { ok: false, reason: SCREENSHOT_REQUIRED_ERROR };
  if (!allowedTicketMimeTypes(proofKind).includes(file.mime)) return { ok: false, reason: "unsupported_type" };
  return { ok: true };
}
