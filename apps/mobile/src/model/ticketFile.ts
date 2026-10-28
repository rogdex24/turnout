import { checkTicketFile, PDF_MIME_TYPE, type ProofKind } from "@turnout/contract/ticket";
import type { ApiError } from "./apiError";

/** A ticket file chosen on this phone and not yet sent. It stays here while the phone is offline. */
export interface PickedTicket {
  uri: string;
  /** The file's name when the picker gave one. Shown to the person, never sent. */
  name: string | null;
  /** The type as the picker declared it, already tidied by `normaliseMime`. */
  mime: string;
  bytes: number;
}

/** What is wrong with a file, before or after it goes up. The screen has one line of copy for each. */
export type TicketFileIssue =
  | "screenshot_required"
  | "unsupported_type"
  | "too_large"
  | "empty"
  | "too_late"
  | "bad_ticket"
  | "rate_limited";

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heic",
  pdf: PDF_MIME_TYPE,
};

/** The pickers say `image/jpg` or `image/heif`, or nothing at all. The contract knows `image/jpeg` and `image/heic`. */
export function normaliseMime(declared: string | null | undefined, name: string | null | undefined): string {
  const mime = declared?.trim().toLowerCase() ?? "";
  if (mime === "image/jpg" || mime === "image/pjpeg") return "image/jpeg";
  if (mime === "image/heif" || mime === "image/heic-sequence" || mime === "image/heif-sequence") return "image/heic";
  if (mime !== "" && mime !== "application/octet-stream") return mime;
  const extension = name?.split(".").pop()?.toLowerCase();
  return (extension ? BY_EXTENSION[extension] : undefined) ?? mime;
}

export function isPdf(file: Pick<PickedTicket, "mime">): boolean {
  return file.mime === PDF_MIME_TYPE;
}

/** Checks the type and size of a chosen file for the show's proof kind. It is the contract's check, so the app and the server agree. */
export function checkPicked(proofKind: ProofKind, file: Pick<PickedTicket, "mime" | "bytes">): TicketFileIssue | null {
  const result = checkTicketFile(proofKind, file);
  return result.ok ? null : result.reason;
}

/** Reads the server's refusal of an upload as an issue the person can fix, or null when it is not about the file (offline, a 5xx). */
export function issueFromError(error: ApiError): TicketFileIssue | null {
  if (error.kind === "rate_limited") return "rate_limited";
  switch (error.code) {
    case "screenshot_required":
    case "unsupported_type":
    case "too_late":
    case "bad_ticket":
      return error.code;
    case "file_too_large":
    case "payload_too_large":
      return "too_large";
    default:
      return null;
  }
}

/** Whether Send can be pressed: a file that passed the check, no upload running, and a connection. */
export function canSend(state: {
  file: PickedTicket | null;
  issue: TicketFileIssue | null;
  uploading: boolean;
  offline: boolean;
}): boolean {
  return state.file !== null && state.issue === null && !state.uploading && !state.offline;
}
