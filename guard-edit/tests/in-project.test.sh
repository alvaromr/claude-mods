#!/bin/sh
# The tests of scripts/in-project.sh, in a real repository of its own, with none
# of your git configuration.
set -eu

script=$(cd "$(dirname "$0")/../scripts" && pwd)/in-project.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

failures=0
expect() { # expect <got> <wanted> <what>
	if [ "$1" != "$2" ]; then
		failures=$((failures + 1))
		echo "  $3: got '$1', wanted '$2'"
	fi
}

repo="$tmp/repo"
git init -q "$repo"
printf 'dist/\n' >"$repo/.gitignore"
mkdir -p "$repo/dist" "$tmp/elsewhere"
: >"$repo/old.ts"

expect "$(sh "$script" "$repo/old.ts")" "$repo/old.ts" "a file of the project"
expect "$(sh "$script" "$repo/new/deep/x.ts")" "$repo/new/deep/x.ts" "a file to be, in folders to be"
expect "$(sh "$script" "$repo/dist/x.js")" "" "a file git ignores"
expect "$(sh "$script" "$tmp/elsewhere/x.ts")" "" "a file of no project"
expect "$(sh "$script" "?$repo/old.ts")" "$repo/old.ts" "a marked path, of a file there"
expect "$(sh "$script" "?$repo/gone.ts")" "" "a marked path, of no file"
expect "$(sh "$script" "$repo/dist/x.js" "$repo/old.ts" "$tmp/elsewhere/x")" "$repo/old.ts" "several, in their order"
sh "$script" "$tmp/elsewhere/x.ts"
expect "$?" 0 "it exits 0 whatever it finds"

if [ "$failures" -eq 0 ]; then echo "in-project: all passed"; else echo "in-project: $failures failed"; fi
[ "$failures" -eq 0 ]
