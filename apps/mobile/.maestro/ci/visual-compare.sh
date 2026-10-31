#!/usr/bin/env bash
# Compares one target's fresh shots with its LFS baselines through scripts/visual-diff.ts. Run from the repo root.
#   visual-compare.sh <target>   SHOT_DIR is the folder device-run.sh wrote the shots to
# Every target has committed baselines, so a target without any is an error: a missing folder would let every change through.
# The shots still go up as the visual-shots-<target> artifact, so scripts/visual-accept.ts can accept a run for a new target.
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
  # Android picks the gesture handle's colour by sampling what is behind it, a moment after the screen changes, so the same screen
  # was shot with a dark handle on one run and a white one on the next. Over a sheet, the status bar moved its icons and its clock
  # between runs even in demo mode (run 41244298923, the go stories). Both are system chrome, so their boxes are not compared. The
  # cost is that a wrong status bar icon colour on Android is not caught here; iOS still compares its status bar.
  ignore=()
  case "$target" in
    android-small) ignore=(--ignore 0,0,719,63 --ignore 240,1480,480,1510) ;;
    android-large) ignore=(--ignore 0,0,1439,119 --ignore 510,3055,930,3100) ;;
  esac
  bun scripts/visual-diff.ts "$baselines" "$SHOT_DIR" --report "visual-diff-report/$target" ${ignore[@]+"${ignore[@]}"}
else
  echo "::error::No baselines for $target in $baselines. Accept a run with scripts/visual-accept.ts and commit the files."
  exit 1
fi
