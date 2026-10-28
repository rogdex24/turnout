#!/usr/bin/env bash
# Puts the current JS into a cached native build (apps/mobile/build/e2e.apk or e2e-ios.tgz) with @expo/repack-app.
# Safe only while the native fingerprint matches the build's, which the cache key guarantees.
#   repack.sh <android|ios>   writes build/e2e-repacked.apk or build/e2e-ios-repacked.tgz
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ci/env.sh

case "${1:?usage: repack.sh <android|ios>}" in
  android)
    # A throwaway key for the repacked APK. It is not a secret: the e2e app is never distributed.
    keytool -genkeypair -keystore build/repack.keystore -storepass android -keypass android -alias e2e -keyalg RSA -keysize 2048 \
      -validity 3650 -dname "CN=Turnout e2e,O=Turnout,C=IN"
    bunx repack-app --platform android --source-app build/e2e.apk --output build/e2e-repacked.apk \
      --ks build/repack.keystore --ks-pass pass:android --ks-key-alias e2e --ks-key-pass pass:android
    ;;
  ios)
    rm -rf build/repack-src && mkdir -p build/repack-src
    tar -xzf build/e2e-ios.tgz -C build/repack-src
    app="$(ls -d build/repack-src/*.app)"
    bunx repack-app --platform ios --source-app "$app" --output build/repack-out.app
    tar -czf build/e2e-ios-repacked.tgz -C build "repack-out.app"
    ;;
  *) echo "unknown platform" >&2; exit 2 ;;
esac
