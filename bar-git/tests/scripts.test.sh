#!/bin/sh
# The tests of the scripts the mod runs (scripts/*.sh), in real repositories of
# their own, with none of your git configuration.
set -eu

scripts=$(cd "$(dirname "$0")/../scripts" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

failures=0
expect() { # expect <got> <wanted> <what>
	if [ "$1" != "$2" ]; then
		failures=$((failures + 1))
		echo "  $3: got $1, wanted $2"
	fi
}
# the sum of a column of what lines.sh prints, run in the folder $1
column() { (cd "$1" && sh "$scripts/lines.sh") | awk -F'\t' -v c="$2" '{ s += $c } END { print s + 0 }'; }
added() { column "$1" 1; }
removed() { column "$1" 2; }
unpushed() { (cd "$1" && sh "$scripts/unpushed.sh"); }

repo="$tmp/repo"
git init -q "$repo"
printf 'a\nb\nc\n' >"$repo/staged.txt"
git -C "$repo" add staged.txt
mkdir -p "$repo/new/deep"
printf 'x\ny\n' >"$repo/new/deep/untracked.txt"
printf 'ignored\n' >"$repo/skip.log"
echo '*.log' >"$repo/.gitignore"
expect "$(added "$repo")" 6 "with no commit yet, what is staged and every untracked file's lines are added"
expect "$(added "$repo/new")" 6 "a subfolder counts the whole repository"
expect "$(unpushed "$repo")" 0 "with no commit and no remote, nothing is unpushed"

git -C "$repo" add -A
git -C "$repo" commit -qm first
printf 'a\nc\nd\ne\n' >"$repo/staged.txt"
expect "$(added "$repo")" 2 "a changed file counts its added lines against HEAD"
expect "$(removed "$repo")" 1 "a changed file counts its removed lines against HEAD"
expect "$(unpushed "$repo")" 0 "with no remote, nothing is unpushed"

git init -q --bare "$tmp/remote.git"
git -C "$repo" remote add origin "$tmp/remote.git"
git -C "$repo" push -q origin HEAD 2>/dev/null
git -C "$repo" commit -qam second
git -C "$repo" commit -q --allow-empty -m third
expect "$(unpushed "$repo")" 2 "the commits no remote has are counted, with no upstream tracked"

expect "$(added "$tmp" 2>/dev/null)" 0 "outside a repository, nothing is counted"

if [ "$failures" -gt 0 ]; then
	echo "bar-git scripts: $failures failed"
	exit 1
fi
echo "bar-git scripts: all passed"
