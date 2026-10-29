# Performance (A25)

How start-up is measured, what the code already does to keep it short, and a results table for the owner to fill in. Nothing in the table has been measured yet: there is no reference phone in the build environment.

## Reference phone

**Samsung Galaxy A35 5G, 6 GB, Android 15 (One UI 7).** It is a current mid-range phone with a mid-range chip (Exynos 1380), the kind a member in Hyderabad is likely to carry. Use one phone for every run in the table. If the owner measures on another phone, change this line first and say why, so the numbers are never compared across phones.

Set the phone up the same way each time:

- Battery above 50% and not charging, Battery saver off, Developer options "Don't keep activities" off.
- On Wi-Fi with a real signal, signed in as a test member whose profile is complete, with at least one show in the list.
- Brightness and screen timeout fixed, no other app open, and the phone rested for 2 minutes after boot or after a build install.
- Animations left at 1x.

## What is measured

Both start from the moment Android is asked to open the app and use a **release build**, never a development build or Metro: the `preview` EAS profile (`eas build --profile preview --platform android`, an APK with Hermes bytecode and no Storybook). Install it with `adb install -r`.

| Name | From | To |
| --- | --- | --- |
| Cold start | `am start` on a stopped app (the process does not exist) | the first frame of the app is drawn (the splash). Android reports this as `TotalTime`. |
| Time to Home content | the same `am start` | the first frame in which the first show card is on the screen with its title. |

Two cases, each 10 runs, each its own row in the table:

1. **First start after sign-in** (the disk cache has nothing, so Home waits for the network).
2. **Warm cache** (the app was used a minute ago and then stopped; Home is painted from the disk cache before the network answers).

## How

Cold start, per run (10 runs; the package is `com.turnout.app.preview`):

```sh
adb shell am force-stop com.turnout.app.preview
sleep 5
adb shell am start -W -n com.turnout.app.preview/.MainActivity | grep -E 'TotalTime|WaitTime'
```

`force-stop` kills the process but keeps the app's files, so run 1 to 10 of the warm-cache case reuse the cache that run 0 wrote. For the first-start case run `adb shell pm clear com.turnout.app.preview` and sign in again before each run, and open Home once to let it settle.

Time to Home content, per run: record the screen and read the frame on which the first card appears.

```sh
adb shell screenrecord --time-limit 15 /sdcard/run.mp4 &
sleep 2
adb shell am force-stop com.turnout.app.preview
sleep 1
adb shell am start -n com.turnout.app.preview/.MainActivity
wait
adb pull /sdcard/run.mp4
ffmpeg -i run.mp4 -vsync 0 -frame_pts 1 frames/%05d.png
```

In `frames`, `t0` is the first frame that is no longer the launcher or the home screen (the app window opened), and `t1` is the first frame that shows a show card with its title. The time to Home content is `(t1 - t0)` divided by the frame rate of the recording (`ffprobe run.mp4`, usually 60). It is good to a frame, which is enough for a median of 10.

Record and discard run 0 of each case, since the first launch after an install also compiles code. Keep runs 1 to 10 in the table.

**Median** is the mean of the 5th and 6th values of the 10 sorted runs. **p90** is the 9th sorted value (nearest rank). Write down the lowest and highest too, and note any run that was thrown away and why.

## Results

Fill in from a release build. Write the build number and the git commit.

| Date | Build and commit | Case | Cold start median (ms) | Cold start p90 (ms) | Time to Home content median (ms) | Time to Home content p90 (ms) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | First start after sign-in | | | | | |
| | | Warm cache | | | | | |

There is no target number yet. The first measured row is the baseline; a later build that is slower than it by more than the spread of the 10 runs is a regression to look into.

## What the code does for start-up

Checked in this repo, with the test that keeps each one true:

| Item | State | Kept true by |
| --- | --- | --- |
| Hermes bytecode | Hermes is the only engine in SDK 58 (the config type has no `jsEngine` option), and a release build compiles the bundle to Hermes bytecode, so the phone does not parse JavaScript at start. Confirm on the phone: the release APK holds `index.android.bundle` as Hermes bytecode (`unzip -p app.apk assets/index.android.bundle | head -c 8 | xxd` starts with `c61f bc03`). | `config/perf.test.ts` fails if a config sets another engine. |
| Persisted cache before the network | `PersistQueryClientProvider` restores the disk cache before any query runs (`src/providers/AppProviders.tsx`), keyed by app version and member. Home, the areas, the config, the plans and the member are kept on disk (`PERSISTED_PREFIXES`). A stale answer is shown and asked for again behind the screen. A different member or a different build starts empty. | `src/warmStart.test.tsx`: Home shows its cards from a stale disk cache while every request is unanswered, and a different member's cache is not shown. |
| Sentry and PostHog after first paint | `useStartTelemetry` starts them after the first animation frame and one more turn of the event loop. Both SDKs are loaded by a `require` inside their start functions, so their code is not evaluated during start-up. | `src/analytics/useStartTelemetry.test.tsx`, `src/analytics/lazyLoad.test.ts` |
| FlashList item types | Home and the thread use `FlashList` with `getItemType`, so a recycled row is only reused for a row of the same shape. No screen uses `FlatList` or `SectionList`. | `src/lists.test.ts` |
| Fixed sizes | FlashList 2 measures its rows itself and has no `estimatedItemSize`, so there is no size to set. The plans screen is a bounded `ScrollView` (a member has few plans), not a list. | `src/lists.test.ts` (types), reading `PlansView.tsx` (bounded) |

### What changed in this task

- Hermes needed no change: it is the default and the only engine. A test now fails if a config names another one.
- The thread was a `FlatList`. It is now an inverted `FlashList` with four item types (your run or next message, someone else's run or next message).
- `createTestApp` takes an optional `cacheStore`, so a test can start the app on a disk cache.

### Trade-offs to know about

- Sentry starts after the first frame, so a crash during the very first frames (before the SDK is up) is not reported. The native crash is still in Google Play's Android vitals. If start-up crashes ever matter more than the milliseconds, move the Sentry start earlier and measure the cost with the table above.
- The warm-cache path shows data up to a day old (`CACHE_MAX_AGE_MS`) while the network answers. A show that has since sold out can show for a moment, until the refetch lands.
- Expo's Metro setting `inlineRequires` is off by default. Turning it on would defer more module evaluation, but it changes load order across the app; do it only with a measured gain on the reference phone.
