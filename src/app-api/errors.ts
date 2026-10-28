import type { ErrorCode } from "@turnout/contract/app/errors";

/** A failure with an HTTP status and one of the contract's error codes. Handlers throw it; the pipeline turns it into the error body. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Not found, not yours and not yet all look the same from outside. */
export const notFound = (): AppError => new AppError(404, "not_found", "not found");

export const unauthorized = (message = "sign in again"): AppError => new AppError(401, "unauthorized", message);

export const invalidRequest = (message: string): AppError => new AppError(400, "invalid_request", message);
