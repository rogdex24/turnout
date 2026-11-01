#!/usr/bin/env bash
# Builds the development client APK (APP_VARIANT=development, package com.turnout.app.dev) into apps/mobile/build/turnout-dev.apk.
# It holds no JS bundle: it opens the dev launcher and loads the JS from Metro (`bun run mobile:dev`), like Expo Go does.
# Needs JDK 17 and the Android SDK (ANDROID_HOME). ABIS picks the CPU types, all four by default so it installs on any phone;
# ABIS=x86_64 is enough for an emulator and builds faster.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export APP_VARIANT=development
export EXPO_PUBLIC_STORYBOOK=1
export EXPO_PUBLIC_GROUPS_ENABLED=1
abis="${ABIS:-armeabi-v7a,arm64-v8a,x86,x86_64}"

bunx expo prebuild --platform android --no-install --clean
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures="$abis" --no-daemon)
mkdir -p build
cp android/app/build/outputs/apk/debug/app-debug.apk build/turnout-dev.apk
