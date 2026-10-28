# WhatsApp one-tap sign-in on Android

The sign-in code is sent on WhatsApp. On Android the app can also take the code with one tap: the WhatsApp message carries a
"Copy code" and an autofill button, and the button hands the code to the app. Typing and paste always work. The one-tap button is
an extra, so a missing key never blocks sign-in.

## How it works in the app

1. The person taps Send code. The app calls `startHandshake()` on the `whatsapp-otp` module. The module sends a handshake intent to
   WhatsApp (`com.whatsapp` and `com.whatsapp.w4b`) and keeps the handshake id.
2. The app then asks the server for the code (`POST /auth/otp`).
3. WhatsApp shows the message with the autofill button, but only when the app's package name and signature hash are on the
   template. Tapping it launches the app's `WhatsAppOtpReceiverActivity` with the code and the handshake id.
4. The module checks the id against the pending one with Meta's `processOtpCode`, brings the app forward and sends the code to the
   code screen, which fills the six boxes and verifies.
5. A code with the wrong id, or none pending, is dropped.

Where the module is absent (iOS, the e2e build, Jest) a stub stands in. The e2e codes come from the staging `__test/otp` route.

## What the owner sets up

The Meta side is in the S28 task and needs the owner. The app side needs these values, one per signing key:

| Key | Where the hash comes from |
|---|---|
| Debug | `~/.android/debug.keystore`, alias `androiddebugkey` |
| Upload | The EAS credentials for the Android app |
| Play app signing | Play Console, Setup, App signing, "App signing key certificate" (the hash differs from the upload key) |

Print a hash with the script in this repository:

```sh
apps/mobile/scripts/app-hash.sh com.turnout.app --keystore <path> --alias <alias> --storepass <ENV_VAR_NAME>
apps/mobile/scripts/app-hash.sh com.turnout.app --cert <certificate file from Play Console>
```

The package name is the variant's bundle id (`com.turnout.app` for production, `.dev`, `.e2e` and the preview id for the others).
The hash is 11 characters. It is not a secret, and it is not a key: it only names a certificate.

Add each package name and hash to the authentication template's one-tap button in the Meta Business Manager. A build whose key is
not on the list gets no button, and the person copies the code or pastes it.

## What is and is not tested

Tested in CI: the handshake rules, the screens (paste, typing, autofill through the stub), and the manifest plugin that adds the
exported receiver activity and the `<queries>` entries for both WhatsApp apps.

Not tested anywhere yet: the Kotlin module and the real hand-off from WhatsApp. They need a real phone with a Play-signed build
and a template that lists its hash. Until then the acceptance line "one-tap fills the code on a real phone" is partial.
