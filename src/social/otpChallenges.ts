import type { Database } from "bun:sqlite";

export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "undeliverable" | "reviewer";

export interface ChallengeRow {
  id: string;
  phone_hash: string;
  purpose: "sign_in" | "delete_account";
  code_hmac: string;
  attempts: number;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  voided_at: string | null;
  wamid: string | null;
  delivery_status: DeliveryStatus;
  delivery_error_code: string | null;
}

export function getChallenge(db: Database, id: string): ChallengeRow | null {
  return db.query("SELECT * FROM otp_challenge WHERE id = ?").get(id) as ChallengeRow | null;
}

/** The newest code for this number that has not been used or voided, whatever its purpose. */
export function latestOpenChallenge(db: Database, phoneHash: string): ChallengeRow | null {
  return db
    .query(
      "SELECT * FROM otp_challenge WHERE phone_hash = ? AND consumed_at IS NULL AND voided_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .get(phoneHash) as ChallengeRow | null;
}

/** Earlier codes for this number stop working the moment a new one is asked for. */
export function voidOpenChallenges(db: Database, phoneHash: string, now: Date): number {
  return db
    .query("UPDATE otp_challenge SET voided_at = ? WHERE phone_hash = ? AND consumed_at IS NULL AND voided_at IS NULL")
    .run(now.toISOString(), phoneHash).changes;
}

export function insertChallenge(
  db: Database,
  input: {
    id: string;
    phoneHash: string;
    purpose: ChallengeRow["purpose"];
    codeHmac: string;
    now: Date;
    expiresAt: Date;
    deliveryStatus: DeliveryStatus;
  },
): void {
  db.query(
    "INSERT INTO otp_challenge (id, phone_hash, purpose, code_hmac, created_at, expires_at, delivery_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    input.id,
    input.phoneHash,
    input.purpose,
    input.codeHmac,
    input.now.toISOString(),
    input.expiresAt.toISOString(),
    input.deliveryStatus,
  );
}

/** Records the sender's answer. A webhook that got there first (status already past `pending`) is not overwritten. */
export function recordSent(db: Database, id: string, wamid: string, status: "sent" | "undeliverable", errorCode: string | null): void {
  db.query(
    `UPDATE otp_challenge SET wamid = ?,
       delivery_status = CASE WHEN delivery_status = 'pending' THEN ? ELSE delivery_status END,
       delivery_error_code = COALESCE(?, delivery_error_code)
     WHERE id = ?`,
  ).run(wamid, status, errorCode, id);
}

/** The send failed: no message went out, and the code must not be usable. */
export function recordSendFailed(db: Database, id: string, errorCode: string | null, now: Date): void {
  db.query(
    "UPDATE otp_challenge SET delivery_status = 'failed', delivery_error_code = ?, voided_at = COALESCE(voided_at, ?) WHERE id = ?",
  ).run(errorCode, now.toISOString(), id);
}

/** How far a delivery status has got. A late `sent` must not undo a `delivered`. */
const RANK: Record<DeliveryStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4, undeliverable: 4, reviewer: 5 };

/** Applies a delivery update from the webhook by message id. Returns true when a row was found. */
export function applyDeliveryStatus(
  db: Database,
  wamid: string,
  status: Exclude<DeliveryStatus, "pending" | "reviewer">,
  errorCode: string | null,
): boolean {
  const row = db.query("SELECT id, delivery_status FROM otp_challenge WHERE wamid = ?").get(wamid) as {
    id: string;
    delivery_status: DeliveryStatus;
  } | null;
  if (row === null) return false;
  if (RANK[status] > RANK[row.delivery_status]) {
    db.query("UPDATE otp_challenge SET delivery_status = ?, delivery_error_code = COALESCE(?, delivery_error_code) WHERE id = ?").run(
      status,
      errorCode,
      row.id,
    );
  }
  return true;
}
