#!/usr/bin/env bash
# Vercel "Ignored Build Step" — makes each project build only for its own
# branch, ignoring pushes to every other branch (main, the other project's
# branch, feature branches, etc).
#
# Set this exact command in each project's dashboard:
#   Project Settings -> Git -> Ignored Build Step
#     bash scripts/vercel-ignore-build.sh staging      (for the staging project)
#     bash scripts/vercel-ignore-build.sh production   (for the production project)
#
# Exit code 0 = skip this build. Exit code 1 = proceed with the build.
# Vercel sets VERCEL_GIT_COMMIT_REF to the branch being pushed.

TARGET_BRANCH="$1"

if [ -z "$TARGET_BRANCH" ]; then
  echo "Usage: vercel-ignore-build.sh <branch-this-project-should-build>"
  exit 1
fi

if [ "$VERCEL_GIT_COMMIT_REF" = "$TARGET_BRANCH" ]; then
  echo "Building: commit is on '$VERCEL_GIT_COMMIT_REF', matches this project's branch."
  exit 1
fi

echo "Skipping: commit is on '$VERCEL_GIT_COMMIT_REF', this project only builds '$TARGET_BRANCH'."
exit 0
