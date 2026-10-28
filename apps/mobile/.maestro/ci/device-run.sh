#!/usr/bin/env bash
# Runs the Maestro flows and the visual capture on the device the job has already booted and installed the app on.
#   device-run.sh <android-small|android-large|ios-small|ios-large>
# Needs on PATH: maestro, jq, and adb (Android) or xcrun (iOS). Environment:
#   SERVER_URL  the seeded server as the host sees it, for example http://localhost:3917 (the job starts the server)
#   SHOT_DIR    where the shots go, one folder per story: <story>/<theme>-<text>.png (the job uploads it as visual-shots-<target>)
# Written for the pinned images in .github/workflows/ci.yml. It has not been run on a runner yet (docs/plans/mobile-visual-testing.md).
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

# Same pixels on every run: the clock, the animations and the screen size are pinned before anything is shot.
if [ "$platform" = android ]; then
  for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$scale" 0
  done
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
maestro test -e "SERVER_URL=$SERVER_URL" "$here"
echo "::endgroup::"

echo "::group::visual capture"
mkdir -p "$SHOT_DIR"
for theme in light dark; do
  for text in default largest; do
    "set_${platform}_theme" "$theme"
    "set_${platform}_text" "$text"
    jq -c '.[]' "$here/visual/stories.json" | while read -r story; do
      folder="$(jq -r .folder <<< "$story")"
      mkdir -p "$SHOT_DIR/$folder"
      maestro test \
        -e "STORY_ID=$(jq -r .id <<< "$story")" \
        -e "READY_TEXT=$(jq -r .ready <<< "$story")" \
        -e "SHOT=$folder/$theme-$text" \
        -e "SHOT_DIR=$SHOT_DIR" \
        "$here/visual/capture-story.yaml" < /dev/null
    done
  done
done
echo "::endgroup::"
