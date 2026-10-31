#!/usr/bin/env bash
# Checks on the iOS simulator that a push opens the screen its kind names. There is no APNs here: `xcrun simctl push` hands a sample
# payload (push/handle-rejected.json, in the shape the Expo push service sends) to the booted simulator, and the app routes the tap
# as it would a real one. This proves the handler, not delivery.
#   ios-push-check.sh
# Needs on PATH: maestro and xcrun, with the e2e app installed on the booted simulator. Environment:
#   SERVER_URL  the seeded server as the host sees it, for example http://localhost:3917
#   TEST_TOKEN  the server's STAGING_TEST_TOKEN
# Run it after device-run.sh: the flows there change the server's clock, and it resets the appearance that the capture left set.
set -euo pipefail

: "${SERVER_URL:?SERVER_URL is not set}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_id="$(sed -n 's/^appId: //p' "$here/push/arm.yaml")"
payload="$here/push/handle-rejected.json"
debug="$HOME/.maestro/tests/ios-push"

# The notification has to be readable in Notification Center, so the light theme and the default text size come back.
xcrun simctl ui booted appearance light
xcrun simctl ui booted content_size large

mkdir -p "$debug"
run_flow() {
  maestro test --test-output-dir "$debug/$1" -e "SERVER_URL=$SERVER_URL" -e "TEST_TOKEN=${TEST_TOKEN:-}" "$here/push/$1.yaml" < /dev/null
}

echo "::group::ios push"
run_flow arm
xcrun simctl push booted "$app_id" "$payload"
run_flow tap
echo "::endgroup::"
