import type { Database } from "bun:sqlite";
import type { Gender, GroupPref } from "@turnout/contract/profile";

export interface ProfileRow {
  member_id: string;
  first_name: string | null;
  gender: Gender | null;
  group_pref: GroupPref;
  photo_key: string | null;
  created_at: string;
  updated_at: string;
}

export function getProfile(db: Database, memberId: string): ProfileRow | null {
  return db.query("SELECT * FROM profile WHERE member_id = ?").get(memberId) as ProfileRow | null;
}

export function updateProfile(
  db: Database,
  memberId: string,
  patch: { firstName: string; gender: Gender; groupPref: GroupPref },
  now: Date,
): void {
  db.query("UPDATE profile SET first_name = ?, gender = ?, group_pref = ?, updated_at = ? WHERE member_id = ?").run(
    patch.firstName,
    patch.gender,
    patch.groupPref,
    now.toISOString(),
    memberId,
  );
}

/** Points the profile at a new photo and returns the key it had, so the caller can delete that file. */
export function setPhotoKey(db: Database, memberId: string, key: string, now: Date): string | null {
  return db.transaction(() => {
    const old =
      (db.query("SELECT photo_key FROM profile WHERE member_id = ?").get(memberId) as { photo_key: string | null } | null)?.photo_key ??
      null;
    db.query("UPDATE profile SET photo_key = ?, updated_at = ? WHERE member_id = ?").run(key, now.toISOString(), memberId);
    return old;
  })();
}

/** Every photo key in use, for the sweep that deletes files no row points at. */
export function allPhotoKeys(db: Database): Set<string> {
  const rows = db.query("SELECT photo_key FROM profile WHERE photo_key IS NOT NULL").all() as { photo_key: string }[];
  return new Set(rows.map((row) => row.photo_key));
}
