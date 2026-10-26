import type { EventCursor } from "./types.js";

/** Bad external input is distinct from failures in owned data or query execution. */
export class PublicInputError extends Error {}

export function readLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return 50;
  const limit = Number(raw);
  if (!raw.trim() || !Number.isInteger(limit) || limit < 1) throw new PublicInputError("invalid limit");
  return Math.min(limit, 200);
}

export function readCursor(url: URL, byDistance: boolean): EventCursor | null {
  const token = url.searchParams.get("cursor");
  if (token === null) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 1024) throw new PublicInputError("invalid cursor");
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new PublicInputError("invalid cursor");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicInputError("invalid cursor");
  const cursor = value as Record<string, unknown>;
  if (
    typeof cursor.id !== "string" ||
    !cursor.id ||
    cursor.id.length > 128 ||
    typeof cursor.startsAt !== "string" ||
    !Number.isFinite(Date.parse(cursor.startsAt)) ||
    new Date(cursor.startsAt).toISOString() !== cursor.startsAt
  )
    throw new PublicInputError("invalid cursor");
  if (!byDistance && cursor.kind === "time") return { kind: "time", startsAt: cursor.startsAt, id: cursor.id };
  if (
    byDistance &&
    cursor.kind === "distance" &&
    typeof cursor.distance === "number" &&
    Number.isFinite(cursor.distance) &&
    cursor.distance >= 0
  ) {
    return { kind: "distance", startsAt: cursor.startsAt, id: cursor.id, distance: cursor.distance };
  }
  throw new PublicInputError("cursor does not match sort order");
}
