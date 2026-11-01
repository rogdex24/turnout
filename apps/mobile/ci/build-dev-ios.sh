#!/usr/bin/env bash
# Builds the development client for the iOS Simulator (APP_VARIANT=development, bundle id com.turnout.app.dev) into
# apps/mobile/build/turnout-dev-ios.tgz. It holds no JS bundle: it opens the dev launcher and loads the JS from Metro
# (`bun run mobile:dev`). Needs macOS with Xcode and CocoaPods. A real iPhone needs a signed build instead (docs/mobile/try-the-app.md).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export APP_VARIANT=development
export EXPO_PUBLIC_STORYBOOK=1
export EXPO_PUBLIC_GROUPS_ENABLED=1

bunx expo prebuild --platform ios --no-install --clean
(cd ios && pod install)
workspace="$(ls -d ios/*.xcworkspace)"
scheme="$(basename "$workspace" .xcworkspace)"
# Both simulator CPU types, so it runs on Apple silicon and Intel Macs. Signed ad hoc for the reason in build-ios.sh (the keychain).
xcodebuild -quiet -workspace "$workspace" -scheme "$scheme" -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/derived-dev \
  ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
mkdir -p build
tar -czf build/turnout-dev-ios.tgz -C build/derived-dev/Build/Products/Debug-iphonesimulator "$scheme.app"
