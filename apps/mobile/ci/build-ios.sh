#!/usr/bin/env bash
# Builds the e2e iOS simulator app from scratch (cold) into apps/mobile/build/e2e-ios.tgz. Needs macOS with Xcode and CocoaPods.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ci/env.sh

bunx expo prebuild --platform ios --no-install --clean
(cd ios && pod install)
workspace="$(ls -d ios/*.xcworkspace)"
scheme="$(basename "$workspace" .xcworkspace)"
# Signed to run locally (ad hoc, no team): an unsigned build has no application-identifier entitlement, so the simulator keychain
# refuses expo-secure-store with -34018 and the app opens on the start-failed screen.
xcodebuild -quiet -workspace "$workspace" -scheme "$scheme" -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/derived \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
app="build/derived/Build/Products/Release-iphonesimulator/$scheme.app"
# The simulator reads the entitlements from the binary's __entitlements section; log them so a keychain failure is easy to place.
codesign -d --entitlements - --xml "$app" 2>/dev/null || true
grep -aq "application-identifier" "$app/$scheme" || echo "warning: no application-identifier entitlement in $app" >&2
mkdir -p build
tar -czf build/e2e-ios.tgz -C build/derived/Build/Products/Release-iphonesimulator "$scheme.app"
