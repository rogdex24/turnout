#!/usr/bin/env bash
# Compares one target's fresh shots with its LFS baselines through scripts/visual-diff.ts. Run from the repo root.
#   visual-compare.sh <target>   SHOT_DIR is the folder device-run.sh wrote the shots to
# With no baseline committed for the target yet, there is nothing to compare: the step says so and passes, and the shots still go up
# as the visual-shots-<target> artifact for scripts/visual-accept.ts. Once one baseline is accepted, every shot must match.
set -euo pipefail
target="${1:?usage: visual-compare.sh <target>}"
: "${SHOT_DIR:?SHOT_DIR is not set}"

baselines="apps/mobile/.maestro/visual/baselines/$target"
if compgen -G "$baselines/*/*.png" > /dev/null; then
  # A file that is still an LFS pointer means the fetch did not run, which would fail as a size mismatch. Say so first.
  if grep -qs "^version https://git-lfs" "$baselines"/*/*.png; then
    echo "::error::$baselines holds LFS pointer files. The LFS fetch step did not download the baselines."
    exit 1
  fi
  bun scripts/visual-diff.ts "$baselines" "$SHOT_DIR" --report "visual-diff-report/$target"
else
  echo "::notice::No baselines for $target yet, so the shots were not compared. Accept a run with scripts/visual-accept.ts to start."
fi
