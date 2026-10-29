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

# Puts the seeded server's clock back and empties its rate limits. after-show moves the clock past every show, so a second run of
# the flows on the same server would find no shows without this.
reset_server() {
  if [ -n "${TEST_TOKEN:-}" ]; then
    for route in limits clock; do
      body='{}'
      [ "$route" = clock ] && body='{"reset":true}'
      curl -sf -X POST -H "x-staging-test-token: $TEST_TOKEN" -H "content-type: application/json" -d "$body" \
        "$SERVER_URL/api/app/v1/__test/$route" > /dev/null
    done
  fi
}

run_flows() {
  reset_server
  maestro test -e "SERVER_URL=$SERVER_URL" -e "TEST_TOKEN=${TEST_TOKEN:-}" "$here"
}

echo "::group::flows"
# The one automatic re-run, on the same server. Only the flows run again: a failed capture below fails the job without running
# every flow a second time. A flow that needs the re-run often is fixed or quarantined that week (docs/plans/mobile-ci-budget.md).
run_flows || run_flows
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
      # Maestro 2 writes a screenshot only inside its own output folder (<out>/<flow>/takeScreenshot/), so each run gets a
      # fresh folder and the one shot is moved to $SHOT_DIR/<story>/<theme>-<text>.png afterwards.
      out="$(mktemp -d)"
      if ! maestro test \
        --test-output-dir "$out" \
        -e "STORY_ID=$(jq -r .id <<< "$story")" \
        -e "READY_TEXT=$(jq -r .ready <<< "$story")" \
        "$here/visual/capture-story.yaml" < /dev/null; then
        # The job uploads ~/.maestro/tests when it fails, so the screenshots and the view tree of the failed capture go there.
        mkdir -p "$HOME/.maestro/tests"
        mv "$out" "$HOME/.maestro/tests/visual-$folder-$theme-$text"
        exit 1
      fi
      shot="$(find "$out" -type f -name capture.png | head -n 1)"
      if [ -z "$shot" ]; then
        echo "no capture.png under $out for $folder/$theme-$text" >&2
        exit 1
      fi
      mv "$shot" "$SHOT_DIR/$folder/$theme-$text.png"
      rm -rf "$out"
    done
  done
done
echo "::endgroup::"
