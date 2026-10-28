#!/usr/bin/env bash
# Builds the e2e Android APK from scratch (cold) into apps/mobile/build/e2e.apk. Needs JDK 17 and the Android SDK (ANDROID_HOME).
# The release build type is signed with the template's debug key and carries its JS bundle, so no Metro is needed on the device.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ci/env.sh

bunx expo prebuild --platform android --no-install --clean
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon)
mkdir -p build
cp android/app/build/outputs/apk/release/app-release.apk build/e2e.apk
