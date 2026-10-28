#!/usr/bin/env bash
# Installs the pinned Maestro CLI, checked against a pinned sha256, and puts it on the PATH of later steps.
#   MAESTRO_VERSION and MAESTRO_SHA256 come from the env block in .github/workflows/ci.yml.
# The curl-to-bash installer is not used: it follows the latest release.
set -euo pipefail
: "${MAESTRO_VERSION:?}" "${MAESTRO_SHA256:?}"

dl="$(mktemp -d)"
curl -fsSL --retry 3 -o "$dl/maestro.zip" "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip"
echo "${MAESTRO_SHA256}  $dl/maestro.zip" | (sha256sum -c - 2> /dev/null || shasum -a 256 -c -)
unzip -q "$dl/maestro.zip" -d "$HOME/.maestro-cli"
echo "$HOME/.maestro-cli/maestro/bin" >> "$GITHUB_PATH"
"$HOME/.maestro-cli/maestro/bin/maestro" --version
