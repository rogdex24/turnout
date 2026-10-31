#!/usr/bin/env bash
# Runs the Maestro flows and the visual capture on the device the job has already booted and installed the app on.
#   device-run.sh <android-small|android-large|ios-small|ios-large>
# Needs on PATH: maestro, jq, and adb (Android) or xcrun (iOS). Environment:
#   SERVER_URL  the seeded server as the host sees it, for example http://localhost:3917 (the job starts the server)
#   TEST_TOKEN  the server's STAGING_TEST_TOKEN (it prints one when it starts), for the flows that read sign-in codes
#   SHOT_DIR    where the shots go, one folder per story: <story>/<theme>-<text>.png (the job uploads it as visual-shots-<target>)
# Written for the pinned images in .github/workflows/ci.yml.
set -euo pipefail

target="${1:?usage: device-run.sh <android-small|android-large|ios-small|ios-large>}"
: "${SERVER_URL:?SERVER_URL is not set}"
: "${SHOT_DIR:?SHOT_DIR is not set}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
platform="${target%%-*}"

set_android_theme() { adb shell cmd uimode night "$([ "$1" = dark ] && echo yes || echo no)"; }
set_android_text() { adb shell settings put system font_scale "$([ "$1" = largest ] && echo 2.0 || echo 1.0)"; }
set_ios_theme() { xcrun simctl ui booted appearance "$1"; }
set_ios_text() { xcrun simctl ui booted content_size "$([ "$1" = largest ] && echo accessibility-extra-extra-extra-large || echo large)"; }
# Once the emulator dropped to "device offline" between the flows and the first capture, and adb gave up. Reconnect and wait before
# each capture.
# Demo mode does not always hold: after the theme or text size changed, the sheet stories showed the real clock again. So every wait,
# which runs after those changes and before each capture, sets it again.
wait_android() {
  adb reconnect offline > /dev/null 2>&1 || true
  timeout 120 adb wait-for-device
  pin_android_status_bar
}
pin_android_status_bar() {
  adb shell settings put global sysui_demo_allowed 1
  adb shell am broadcast -a com.android.systemui.demo -e command enter > /dev/null
  adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 > /dev/null
}
wait_ios() { :; }

# Same pixels on every run: the clock, the animations and the screen size are pinned before anything is shot.
if [ "$platform" = android ]; then
  for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$scale" 0
  done
  # A cold emulator can raise an ANR dialog for the launcher over the app; the dialog is not part of what we test.
  adb shell settings put global hide_error_dialogs 1
  pin_android_status_bar
  if [ "$target" = android-small ]; then
    adb shell wm size 720x1520
    adb shell wm density 320
  fi
else
  xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
fi

# The job uploads ~/.maestro/tests when it fails, so each run writes its screenshots and view tree there.
debug="$HOME/.maestro/tests"

echo "::group::flows"
# One pass, with no re-run inside the job. Many flows change the seeded members, plans and groups, so a second pass on the same
# server checks different data. A flaky device job is re-run whole, which starts a fresh server.
# The one exception is a device drop: the Android emulator has gone "device offline" mid run, and the flow running then fails at
# once. After a reconnect the run goes on from that flow, so each flow still runs to the end once. In run 41202152196 the
# android-small emulator dropped twice, so the run goes on after up to three drops. A failure that is not a device drop, or a
# fourth drop, fails the job.
flows_out="$debug/flows"
resume_config="$here/resume-config.yaml"
max_drops=3
dropped() {
  find "$1" -path "*/$2/*" -name maestro.log -exec grep -qE 'device offline|DeviceServerDiedException' {} + 2> /dev/null
}
mkdir -p "$flows_out"
out="$flows_out"
config=()
drops=0
# The ${config[@]+...} form keeps an empty list safe under set -u in the bash 3.2 that macOS ships.
while ! maestro test ${config[@]+"${config[@]}"} --test-output-dir "$out" -e "SERVER_URL=$SERVER_URL" -e "TEST_TOKEN=${TEST_TOKEN:-}" "$here" \
  < /dev/null | tee "$out.txt"; do
  failed="$(sed -n 's/^\[Failed\] \([a-z0-9-]*\) .*/\1/p' "$out.txt" | head -n 1)"
  if [ "$platform" != android ] || [ -z "$failed" ] || ! dropped "$out" "$failed" || [ "$drops" -ge "$max_drops" ]; then
    rm -f "$resume_config"
    exit 1
  fi
  drops=$((drops + 1))
  echo "::warning::flows: the device dropped during $failed (drop $drops of $max_drops), it is reconnected and the run goes on from $failed"
  rest="$(sed -n '/^  flowsOrder:$/,$p' "$here/config.yaml" | sed -n 's/^    - //p' | sed -n "/^$failed\$/,\$p")"
  {
    echo "# Written by ci/device-run.sh to go on after a device drop; deleted when the run ends."
    echo "flows:"
    while read -r flow; do echo "  - flows/$flow.yaml"; done <<< "$rest"
    echo "executionOrder:"
    echo "  continueOnFailure: false"
    echo "  flowsOrder:"
    while read -r flow; do echo "    - $flow"; done <<< "$rest"
  } > "$resume_config"
  wait_android
  out="$flows_out-resume$drops"
  config=(--config "$resume_config")
done
rm -f "$resume_config"
echo "::endgroup::"

echo "::group::visual capture"
# One Maestro run per theme and text size, not one per story. Every run starts Maestro and its driver, which took about 10 s on
# Android and about 75 s on iOS, so the 40 single-story runs spent about 7 and 50 minutes on start-up. Each story is written out
# as its own flow with its own shot name, next to flows/ so the story flow's ../subflows path still resolves. The stories share
# no state (each renders fixed data after a fresh launch), so a story with no shot after its batch is captured again on its own, up to twice.
# A story still without a shot fails the job; a shot is never taken from another run.
batch="$here/visual-run"
# The first whole PNG named <folder>.png under the given folders. A shot counts only if it ends with the PNG end chunk: a device that
# drops in the middle of takeScreenshot leaves a cut-off file, which odiff cannot read, and that story is captured again instead.
find_shot() {
  local folder="$1" file
  shift
  while read -r file; do
    [ "$(tail -c 8 "$file" | od -An -tx1 | tr -d ' \n')" = 49454e44ae426082 ] && { echo "$file"; return; }
    echo "::warning::$file is not a whole PNG, so it does not count as a shot" >&2
  done < <(find "$@" -type f -name "$folder.png")
}
app_id="$(sed -n 's/^appId: //p' "$here/visual/capture-story.yaml")"
write_story_flow() {
  local story="$1" folder
  folder="$(jq -r .folder <<< "$story")"
  {
    echo "appId: $app_id"
    echo "name: $(jq -c '"capture " + .folder' <<< "$story")"
    echo "env:"
    echo "  STORY_ID: $(jq -c .id <<< "$story")"
    echo "  READY_TEXT: $(jq -c .ready <<< "$story")"
    sed -n '/^---$/,$p' "$here/visual/capture-story.yaml" | sed "s/^- takeScreenshot: capture\$/- takeScreenshot: $folder/"
  } > "$batch/$folder.yaml"
  grep -q "^- takeScreenshot: $folder\$" "$batch/$folder.yaml"
}
mkdir -p "$SHOT_DIR"
rm -rf "$batch"
mkdir -p "$batch"
jq -c '.[]' "$here/visual/stories.json" | while read -r story; do write_story_flow "$story"; done
for theme in light dark; do
  for text in default largest; do
    "wait_${platform}"
    "set_${platform}_theme" "$theme"
    "set_${platform}_text" "$text"
    out="$debug/visual-batch-$theme-$text"
    rerun="$out-rerun"
    mkdir -p "$out" "$rerun"
    "wait_${platform}"
    maestro test --test-output-dir "$out" "$batch" < /dev/null ||
      echo "::warning::visual capture $theme-$text: a story failed in the batch run, it is captured again on its own"
    # Most stories with no shot means the device stopped, not that a story failed. A device that went offline mostly comes back
    # after a reconnect, so the batch runs once more. Forty single retries would run into the job's time limit, so if the second
    # batch also leaves most shots missing the job fails here with a clear message.
    for pass in first second; do
      total=0
      missing=0
      while read -r folder; do
        total=$((total + 1))
        [ -n "$(find_shot "$folder" "$out" "$rerun" 2> /dev/null)" ] || missing=$((missing + 1))
      done < <(jq -r '.[].folder' "$here/visual/stories.json")
      [ $((missing * 2)) -le "$total" ] && break
      if [ "$pass" = second ]; then
        echo "the $theme-$text batch left $missing of $total stories with no shot twice, so the device likely stopped" >&2
        exit 1
      fi
      echo "::warning::visual capture $theme-$text: $missing of $total stories have no shot, the device is reconnected and the batch runs again"
      "wait_${platform}"
      maestro test --test-output-dir "$rerun" "$batch" < /dev/null || true
    done
    jq -r '.[].folder' "$here/visual/stories.json" | while read -r folder; do
      mkdir -p "$SHOT_DIR/$folder"
      shot="$(find_shot "$folder" "$out" "$rerun")"
      for attempt in 1 2; do
        [ -n "$shot" ] && break
        echo "::warning::visual capture $folder/$theme-$text: no shot yet, capture on its own (try $attempt of 2)"
        retry="$debug/visual-$folder-$theme-$text-try$attempt"
        mkdir -p "$retry"
        "wait_${platform}"
        maestro test --test-output-dir "$retry" "$batch/$folder.yaml" < /dev/null || true
        shot="$(find_shot "$folder" "$retry")"
      done
      if [ -z "$shot" ]; then
        echo "no $folder.png for $folder/$theme-$text after the batch and two tries on its own" >&2
        exit 1
      fi
      mv "$shot" "$SHOT_DIR/$folder/$theme-$text.png"
    done
  done
done
rm -rf "$batch"
echo "::endgroup::"
