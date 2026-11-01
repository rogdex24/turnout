import { REPORT_MAX_CHARS } from "@turnout/contract/app/reports";

/** The most the details field takes. What the person picked goes in front of it, so this leaves room for the longest reason. */
export const DETAILS_MAX_CHARS = REPORT_MAX_CHARS - 200;

/**
 * The text that is sent: the reason the person picked, then what they wrote. The server takes one text, and the person who reads it
 * needs both. With no details the reason alone is the report.
 */
export function reportBody(reason: string, details: string): string {
  const extra = details.trim();
  return extra === "" ? reason : `${reason}\n\n${extra}`;
}
