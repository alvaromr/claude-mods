#!/bin/sh
# Tests the gate: in a copy of the repo with one thing broken, scripts/check.sh
# fails and says what broke. The gate passing on the repo itself, which runs
# right before this, is the passing case.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
PATH="$repo/node_modules/.bin:$PATH"
export PATH
failures=0

for manifest in "$repo"/*/.claude-plugin/plugin.json; do
  first=$(basename "$(dirname "$(dirname "$manifest")")")
  break
done

# A fresh copy of the files git would commit, the engine's types of each mod,
# which the typed lint reads, and a link to the repo's tools, which the lint
# config imports. The gate passing on the repo, right before, proved every mod
# has its types.
fresh() {
  rm -rf "$tmp/repo"
  mkdir "$tmp/repo"
  # A file deleted but not yet committed is still in git's list, and is left out;
  # the inner shell expands $f, not this one.
  # shellcheck disable=SC2016
  (cd "$repo" && git ls-files -z --cached --others --exclude-standard |
    xargs -0 sh -c 'for f; do [ -e "$f" ] && printf "%s\0" "$f"; done' sh |
    xargs -0 tar -cf -) | (cd "$tmp/repo" && tar -xf -)
  for types in "$repo"/*/.claude-plugin/types; do
    cp -R "$types" "$tmp/repo/${types#"$repo"/}"
  done
  ln -s "$repo/node_modules" "$tmp/repo/node_modules"
}

# Runs the gate in the copy, with the arguments after $2; it must fail, and its
# output must name $2.
expect_failure() {
  what=$1
  named=$2
  shift 2
  if (cd "$tmp/repo" && sh scripts/check.sh "$@") >"$tmp/out" 2>&1; then
    echo "✗ $what: the gate passed"
    failures=$((failures + 1))
  elif ! grep -q -- "$named" "$tmp/out"; then
    echo "✗ $what: the gate failed without naming '$named':"
    tail -5 "$tmp/out"
    failures=$((failures + 1))
  else
    echo "✓ $what"
  fi
}

fresh
echo 0.0.0 >"$tmp/repo/.node-version"
expect_failure 'a Node other than the pinned one stops the gate' '.node-version pins 0.0.0'

fresh
printf 'export const x = {a:1}\n' >"$tmp/repo/unformatted.ts"
expect_failure 'a file Prettier would change stops the gate' 'unformatted.ts'

fresh
printf 'export const x = () => {\n  let y = 1\n  return y\n}\n' >"$tmp/repo/$first/hooks/unlinted.ts"
expect_failure 'a lint error stops the gate' 'prefer-const'

fresh
# The script written is the one meant to expand $1, and to be caught for it.
# shellcheck disable=SC2016
printf '#!/bin/sh\necho $1\n' >"$tmp/repo/scripts/unquoted.sh"
expect_failure 'a shellcheck finding stops the gate' 'SC2086'

if [ "$(uname)" = Darwin ]; then
  fresh
  printf 'let text = try! String(contentsOfFile: "a")\n' >"$tmp/repo/pet/app/Unlinted.swift"
  expect_failure 'a swiftlint finding in the pet stops the gate' 'force_try' --only pet
fi

fresh
printf "import { expect, test } from 'claude-code/testing'\n\ntest('broken on purpose', () => {\n  expect(1).toBe(2)\n})\n" \
  >"$tmp/repo/$first/tests/broken.test.ts"
expect_failure "a failing test in $first stops the gate" 'broken on purpose'
expect_failure "a failing test in $first stops the gate run on $first alone" 'broken on purpose' --only "$first"

fresh
printf 'echo broken on purpose\nexit 1\n' >"$tmp/repo/$first/tests/broken.test.sh"
expect_failure "a failing shell test in $first stops the gate" 'broken on purpose' --only "$first"

# The smoke on its own: earlier steps of the gate would catch a module that
# cannot load before it does, so it is broken where only it looks.
fresh
printf '{ "modules": ["./missing.tsx"] }\n' >"$tmp/repo/$first/hooks/hooks.json"
if (cd "$tmp/repo" && sh scripts/smoke.sh "$first") >"$tmp/out" 2>&1; then
  echo "✗ a mod Claude Code cannot load stops the smoke: the smoke passed"
  failures=$((failures + 1))
elif ! grep -q "did not load in Claude Code: $first" "$tmp/out"; then
  echo "✗ a mod Claude Code cannot load stops the smoke, without naming $first:"
  tail -5 "$tmp/out"
  failures=$((failures + 1))
else
  echo "✓ a mod Claude Code cannot load stops the smoke, naming it"
fi

fresh
sed "s/\"ref\": \"$first--v[^\"]*\"/\"ref\": \"$first--v0.0.0\"/" "$repo/.claude-plugin/marketplace.json" \
  >"$tmp/repo/.claude-plugin/marketplace.json"
expect_failure "a marketplace that installs $first from a tag other than its version's stops the gate" \
  "$first must install from its folder at" --only

fresh
rm "$tmp/repo/$first/.claude-plugin/icon.png"
expect_failure "$first without an icon stops the gate" "$first has no icon" --only "$first"

fresh
rm -rf "$tmp/repo/$first/.claude-plugin/types"
expect_failure "$first without engine types stops the gate, saying how to write them" 'has no engine types'

fresh
printf "export const n: number = 'text'\n" >"$tmp/repo/$first/hooks/mistyped.ts"
expect_failure "a type error in $first stops the gate" 'TS2322'

if [ "$failures" -eq 0 ]; then echo 'all passed'; else echo "$failures failed"; fi
[ "$failures" -eq 0 ]
