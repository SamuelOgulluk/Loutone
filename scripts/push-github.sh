#!/usr/bin/env bash
set -euo pipefail

ROOT="/mnt/c/Users/samue/Documents/sites/Loutone-cursor-better-bass-99e8"
REMOTE="https://github.com/SamuelOgulluk/Loutone.git"
WORK="/tmp/loutone-push-$$"

export GIT_AUTHOR_NAME="Samuel_Ogulluk"
export GIT_AUTHOR_EMAIL="85449107+SamuelOgulluk@users.noreply.github.com"
export GIT_COMMITTER_NAME="Samuel_Ogulluk"
export GIT_COMMITTER_EMAIL="85449107+SamuelOgulluk@users.noreply.github.com"

rm -rf "$WORK"
git clone "$REMOTE" "$WORK"
cd "$WORK"

rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude src-tauri/target \
  "$ROOT/" ./

git add -A
git status --short

if git diff --cached --quiet; then
  echo "Aucun changement a pousser."
  exit 0
fi

git commit -m "Ameliore Loutone: export audio, rec vocal, transcription MIDI, UI disposition et transport"
git push origin master

echo "OK: https://github.com/SamuelOgulluk/Loutone"
