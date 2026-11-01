# Permissions check

Checked 2026-10-29 against `apps/mobile/app.config.ts` and a production `expo prebuild` of the Android project
(`APP_VARIANT=production`). Pinned by `config/appConfig.test.ts`.

## What the production manifest asks for

| Permission | Why | Needed |
| --- | --- | --- |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | Walk time to the cafe on the meet card, computed on the phone | Yes, foreground only |
| `INTERNET` | Talk to the Turnout server | Yes |
| `VIBRATE` | Notification and tap feedback | Yes |

Removed on purpose (`blockedPermissions` and plugin options in `app.config.ts`):

| Permission | Why it is gone |
| --- | --- |
| `CAMERA`, `RECORD_AUDIO` | The photo and the ticket come from the system picker. `expo-image-picker` is set with `cameraPermission: false` and `microphonePermission: false` |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Libraries add them for Android 12 and older; the picker hands the app one file and needs no storage permission. This was wrong before this change: they were in the manifest |
| `SYSTEM_ALERT_WINDOW` | The Expo template adds it for the development overlay. Release builds (preview, production) block it. This was wrong before this change |
| Background location | `isAndroidBackgroundLocationEnabled: false`; nothing runs in the background |

The manifest also has `allowBackup="false"` (before: the Expo default, which allowed backup) and
`usesCleartextTraffic="false"`. The `queries` block lists `com.whatsapp` and `com.whatsapp.w4b` so the app can tell whether
WhatsApp is installed.

## Merged manifest (owner step)

Gradle merges more entries from libraries at build time, for example `POST_NOTIFICATIONS` from `expo-notifications`. That merge is only known when the AAB is built. Before the first upload:

1. Build the production AAB with EAS.
2. `bundletool dump manifest --bundle=app.aab | grep uses-permission`.
3. Compare with the table above. Any permission not in it needs a reason, or a `blockedPermissions` line, before upload.
4. Check Play Console's "App content" permissions page shows no declaration form (foreground location needs none).

## The permission strings

| Platform string | Text | Verdict |
| --- | --- | --- |
| Photos (`photosPermission`, iOS) | "Turnout uses the photo you choose as your profile picture, so your group can find you." | Plain, true, names what it is for |
| Location when in use (`locationWhenInUsePermission`, iOS) | "Turnout shows how far you are from your group's cafe while your meet card is live. Your location stays on your phone." | Plain, true; the position is not sent (`group_member.checked_in_at` records the tap only) |
| Camera, microphone | Off (`false`) | Nothing to explain |
| Background location | Off | Nothing to explain |

Both strings say what the app does and for whom. Neither promises something the app does not do, and neither uses the word
"verified". They needed no change. Android shows its own system prompt for location and
has no usage-description text, so these strings matter on iOS.

iOS notes: `ITSAppUsesNonExemptEncryption` is `false` (TLS only). No associated domains and no `aps-environment` entitlement
in v1, so iOS has no remote push yet.
