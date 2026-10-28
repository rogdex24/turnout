#!/usr/bin/env bash
# Builds the e2e iOS simulator app from scratch (cold) into apps/mobile/build/e2e-ios.tgz. Needs macOS with Xcode and CocoaPods.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ci/env.sh

bunx expo prebuild --platform ios --no-install --clean
(cd ios && pod install)
workspace="$(ls -d ios/*.xcworkspace)"
scheme="$(basename "$workspace" .xcworkspace)"
xcodebuild -quiet -workspace "$workspace" -scheme "$scheme" -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/derived \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO
mkdir -p build
tar -czf build/e2e-ios.tgz -C build/derived/Build/Products/Release-iphonesimulator "$scheme.app"
