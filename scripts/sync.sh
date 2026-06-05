#!/usr/bin/env bash
# One-shot commit + push for the land-care-assurance repo.
# Run from Windows Git Bash (which already has your gh/Git credentials):
#   bash scripts/sync.sh "your commit message"
#
# It clears a stale lock, ensures the origin remote, then commits and pushes.
set -e

# Move to repo root (this script lives in scripts/)
cd "$(dirname "$0")/.."

# 1) Clear a stale index.lock ONLY if no other git process is running.
#    (Close GitHub Desktop / editors with git integration first.)
if [ -f .git/index.lock ]; then
  echo "Removing stale .git/index.lock ..."
  rm -f .git/index.lock
fi

# 2) Ensure the origin remote points at your repo.
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Adding origin remote ..."
  git remote add origin https://github.com/rutomo-ura/land-care-assurance.git
fi

# 3) Stage, commit, push.
git add -A
MSG="${1:-Update LandCare assurance docs}"
if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$MSG"
fi

# Push current branch, setting upstream on first push.
git push -u origin HEAD
echo "Done."
