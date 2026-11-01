# Play Store files

Plan A27. Everything the owner pastes into Play Console for the Turnout listing, in one place. Nothing here is secret.

| File | What it holds | Status |
| --- | --- | --- |
| `listing/en-IN/title.txt` | App name, 30 characters at most | Ready |
| `listing/en-IN/short-description.txt` | Short description, 80 at most | Ready |
| `listing/en-IN/full-description.txt` | Full description, 4000 at most | Ready |
| `screenshots.md` | The shots to upload, taken from the visual baselines | List ready; images are an owner step |
| `data-safety.md` | The Data safety form, every answer traced to a line of `docs/data-map.md` | Ready, owner enters it |
| `permissions.md` | The permissions the build asks for, and the permission strings | Checked, owner compares the merged manifest |
| `console-fields.md` | Privacy URL, account deletion URL, reviewer access note | Placeholders for the owner |

`config/storeListing.test.ts` fails when a listing text goes over its Play limit, uses a word the copy lint bans
(for example "verified"), or when `data-safety.md` cites a `table.column` that is not in `docs/data-map.md`.

Rules the listing follows:

- No "verified", "ID check", "KYC" or "safe" claims. What the app checks is said in plain words: a phone number, a photo,
  a handle that a person on our team looks at, and a ticket screenshot.
- No guilt copy and no "alone" or "no friends" lines (`docs/plans/mobile-app-brief.md`).
- Every statement about data matches `docs/privacy-policy.md` and `docs/data-map.md`. If one of them changes, change the
  listing and the Data safety form in the same commit.
- Android only for now. iOS has no push and no Apple account yet, so there is no App Store listing in v1.
