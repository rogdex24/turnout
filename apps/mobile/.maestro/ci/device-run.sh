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
wait_android() { adb reconnect offline > /dev/null 2>&1 || true; timeout 120 adb wait-for-device; }
wait_ios() { :; }

# Same pixels on every run: the clock, the animations and the screen size are pinned before anything is shot.
if [ "$platform" = android ]; then
  for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$scale" 0
  done
  # A cold emulator can raise an ANR dialog for the launcher over the app; the dialog is not part of what we test.
  adb shell settings put global hide_error_dialogs 1
  adb shell settings put global sysui_demo_allowed 1
  adb shell am broadcast -a com.android.systemui.demo -e command enter > /dev/null
  adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 > /dev/null
  if [ "$target" = android-small ]; then
    adb shell wm size 720x1520
    adb shell wm density 320
  fi
else
  xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
fi

echo "::group::flows"
# One pass, with no re-run inside the job. Many flows change the seeded members, plans and groups, so a second pass on the same
# server checks different data. A flaky device job is re-run whole, which starts a fresh server.
maestro test -e "SERVER_URL=$SERVER_URL" -e "TEST_TOKEN=${TEST_TOKEN:-}" "$here"
echo "::endgroup::"

echo "::group::visual capture"
# One Maestro run per theme and text size, not one per story. Every run starts Maestro and its driver, which took about 10 s on
# Android and about 75 s on iOS, so the 40 single-story runs spent about 7 and 50 minutes on start-up. Each story is written out
# as its own flow with its own shot name, next to flows/ so the story flow's ../subflows path still resolves. The stories share
# no state (each launches with clearState), so a story with no shot after its batch is captured again on its own, up to twice.
# A story still without a shot fails the job; a shot is never taken from another run.
batch="$here/visual-run"
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
# The job uploads ~/.maestro/tests when it fails, so the screenshots and the view tree of a failed capture go there.
keep_debug() { mkdir -p "$HOME/.maestro/tests"; mv "$1" "$HOME/.maestro/tests/$2"; }

mkdir -p "$SHOT_DIR"
rm -rf "$batch"
mkdir -p "$batch"
jq -c '.[]' "$here/visual/stories.json" | while read -r story; do write_story_flow "$story"; done
for theme in light dark; do
  for text in default largest; do
    "wait_${platform}"
    "set_${platform}_theme" "$theme"
    "set_${platform}_text" "$text"
    out="$(mktemp -d)"
    keep_out=no
    "wait_${platform}"
    if ! maestro test --test-output-dir "$out" "$batch" < /dev/null; then
      echo "::warning::visual capture $theme-$text: a story failed in the batch run, it is captured again on its own"
      keep_out=yes
    fi
    jq -r '.[].folder' "$here/visual/stories.json" | while read -r folder; do
      mkdir -p "$SHOT_DIR/$folder"
      shot="$(find "$out" -type f -name "$folder.png" | head -n 1)"
      for attempt in 1 2; do
        [ -n "$shot" ] && break
        echo "::warning::visual capture $folder/$theme-$text: no shot yet, capture on its own (try $attempt of 2)"
        retry="$(mktemp -d)"
        "wait_${platform}"
        maestro test --test-output-dir "$retry" "$batch/$folder.yaml" < /dev/null || true
        shot="$(find "$retry" -type f -name "$folder.png" | head -n 1)"
        if [ -n "$shot" ]; then
          mv "$shot" "$out/$folder.png"
          shot="$out/$folder.png"
        fi
        keep_debug "$retry" "visual-$folder-$theme-$text-try$attempt"
      done
      if [ -z "$shot" ]; then
        echo "no $folder.png for $folder/$theme-$text after the batch and two tries on its own" >&2
        keep_debug "$out" "visual-batch-$theme-$text"
        exit 1
      fi
      mv "$shot" "$SHOT_DIR/$folder/$theme-$text.png"
    done
    if [ "$keep_out" = yes ]; then keep_debug "$out" "visual-batch-$theme-$text"; else rm -rf "$out"; fi
  done
done
rm -rf "$batch"
echo "::endgroup::"
