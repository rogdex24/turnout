# Try the app on a phone

Turnout does not run in Expo Go. Expo Go only has the native modules it ships with, and the app has its own: the WhatsApp sign-in
module (`apps/mobile/modules/whatsapp-otp`), MMKV, Maps, Sentry and the keyboard controller. The app runs in a **development build**
instead. You install the development build once. After that it works like Expo Go: scan the QR code from Metro, and the app loads the
JS from your machine and reloads when you save a file. You make a new development build only when native code changes (a new native
package, a config plugin or an `app.config.ts` change that touches native settings).

The development build is the `development` variant: app name "Turnout (dev)", package and bundle id `com.turnout.app.dev`, scheme
`turnout-dev`. It installs next to the other variants.

## 1. Get a development build (once)

| Device | How |
|---|---|
| Android phone or emulator | Run the `mobile-dev-build` workflow (Actions, Run workflow, platform `android`) and install `turnout-dev.apk` from the `turnout-dev-android` artifact. Or build it yourself: `apps/mobile/ci/build-dev-android.sh` (JDK 17 and the Android SDK; `ABIS=x86_64` builds only for an emulator, faster). |
| iOS Simulator | Run the `mobile-dev-build` workflow with platform `ios`, unpack `turnout-dev-ios.tgz` and drag the `.app` inside onto the simulator (or `xcrun simctl install booted <the .app>`). Or build it on a Mac: `apps/mobile/ci/build-dev-ios.sh`. |
| iPhone | Needs a signed build, so it needs an Apple Developer account and the Expo account. See [iPhone](#iphone). |
| Your own machine with Android Studio or Xcode | From `apps/mobile`: `APP_VARIANT=development bun run android` or `APP_VARIANT=development bun run ios` builds, installs and starts Metro in one step. |

The workflow runs only from the default branch, so it can be started once it is on `main`. The workflow needs no secrets.

## 2. Start the server and Metro

From the repository root:

```bash
bun install
bun run mobile:dev
```

This starts the seeded staging server on port 3000 and Metro on port 8081, and points the app at the server. It prints:

- the server address the app uses,
- the test numbers and the state each member is in (new member, in a group, after a show and so on),
- the Metro QR code,
- each sign-in code, as soon as the app asks for one. Nothing is sent to WhatsApp: the server uses the fake sender.

Stop it with Ctrl+C. The data is thrown away; the next start seeds it again.

Where the phone finds your machine:

| Device | Command |
|---|---|
| Phone on the same Wi-Fi as your machine | `bun run mobile:dev` (it uses your machine's network address) |
| Android emulator or iOS Simulator on the same machine | `bun run mobile:dev --host local` (10.0.2.2 on the emulator, localhost on the simulator) |
| Address picked wrongly (VPN, two networks) | `bun run mobile:dev --host 192.168.1.23` |
| Server somewhere else, or behind a tunnel | `bun run mobile:dev --api-url https://...` |

Other flags: `--port` (server, 3000) and `--metro-port` (8081). The phone must reach both ports, so allow them through your firewall.

## 3. Open the app

1. Open Turnout (dev). The dev launcher shows the Metro server it finds on the network, or scan the QR code with the camera (Android:
   the dev launcher's scanner).
2. On the sign-in screen, type a test number in full, for example `+12025550101` (a new member, so you see onboarding). Only the
   printed test numbers can sign in.
3. Type the sign-in code that `mobile:dev` prints.

The round gear button that floats on every screen is the dev menu's shortcut, not part of the app; drag it aside if it covers a
button. Shake the phone, or press `m` in the Metro terminal, for the same dev menu (reload, Storybook through `EXPO_PUBLIC_STORYBOOK=1`, the
performance monitor). The map shows no tiles on Android without a Maps key; put `GOOGLE_MAPS_ANDROID_API_KEY` in
`apps/mobile/.env.local` before you make the development build if you need it.

## iPhone

A development build for a real iPhone must be signed for that phone. That needs the Apple Developer Program (not part of v1, see
`docs/plans/mobile-accounts.md`) and the Expo organisation:

```bash
cd apps/mobile
bunx eas-cli login
bunx eas-cli device:create            # register the iPhone (opens a link to install a profile on it)
bunx eas-cli build --profile development --platform ios
```

EAS prints a link and a QR code to install the build. Then use it with `bun run mobile:dev` as above. The same `development` profile
also builds the Android APK on EAS (`--platform android`) if you prefer EAS to the workflow.
