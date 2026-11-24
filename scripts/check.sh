#!/bin/sh
# The gate: formatting, lint (shell scripts too), the marketplace, the scripts'
# tests, each mod's manifest, tests and types, the smoke and, on macOS, the
# pet's lint and tests. Run through `pnpm check`, which puts the tools on PATH;
# it stops at the first failure, and its exit code is the verdict.
# `--only <mod>...` checks those mods alone, none if none is named, after the
# whole repo's formatting, lint and marketplace: the pre-commit hook's form.
set -eu
cd "$(dirname "$0")/.."

only=false
if [ "${1:-}" = --only ]; then
  only=true
  shift
fi
named="$*"

# Whether the run checks the mod named $1.
checks() {
  [ "$only" = false ] && return 0
  for one in $named; do
    [ "$one" = "$1" ] && return 0
  done
  return 1
}

# The tools run on the Node .node-version pins; the mods run on whatever Claude
# Code their user has, so the gate says which one judged them.
if [ "$(node --version)" != "v$(cat .node-version)" ]; then
  echo "check: Node $(node --version) runs here, and .node-version pins $(cat .node-version)" >&2
  exit 1
fi
echo "check: node $(node --version), claude $(claude --version)"

# The engine lays the types a mod's tsconfig.json extends only when it loads
# the mod from a folder it watches; nothing else writes them. The lint reads
# every mod's types, so every mod needs them, checked or not.
for manifest in */.claude-plugin/plugin.json; do
  mod=${manifest%%/*}
  if [ ! -f "$mod/.claude-plugin/types/tsconfig.json" ]; then
    echo "check: $mod has no engine types; write them with" \
      "CLAUDE_CODE_PLUGIN_DIR_WATCH=1 claude -p --plugin-dir ./$mod 'Reply with: ok'" >&2
    exit 1
  fi
done

prettier --check .
eslint --max-warnings 0 .
# Every shell script, the git hooks too, which have no extension.
if ! command -v shellcheck >/dev/null; then
  echo 'check: shellcheck lints the shell scripts; install it, as with brew install shellcheck' >&2
  exit 1
fi
find . -name node_modules -prune -o -type f \( -name '*.sh' -o -path './.githooks/*' \) -exec shellcheck {} +
claude plugin validate .
node --test scripts/

for manifest in */.claude-plugin/plugin.json; do
  mod=${manifest%%/*}
  checks "$mod" || continue
  # The validator only warns of a missing icon; the repo holds every mod to one (DESIGN.md, Icons).
  if [ ! -f "$mod/.claude-plugin/icon.png" ]; then
    echo "check: $mod has no icon; draw its glyph in scripts/icons.mjs and run node scripts/icons.mjs" >&2
    exit 1
  fi
  claude plugin validate "$mod"
  claude plugin test "$mod"
  # A mod's shell scripts are tested in shell, where they run.
  for script in "$mod"/tests/*.test.sh; do
    if [ -f "$script" ]; then
      sh "$script"
    fi
  done
  tsc -p "$mod"
done

# A real Claude Code loads the mods checked (scripts/smoke.sh).
if [ "$only" = false ]; then
  sh scripts/smoke.sh
elif [ -n "$named" ]; then
  # The words are the mods' folder names, which hold no spaces.
  # shellcheck disable=SC2086
  sh scripts/smoke.sh $named
fi

if ! checks pet; then
  :
elif [ "$(uname)" = Darwin ]; then
  # The pet compiles with the Swift its user has, so the gate says which one judged it.
  echo "check: $(swiftc --version 2>&1 | head -n 1)"
  if ! command -v swiftlint >/dev/null; then
    echo 'check: swiftlint lints the pet; install it, as with brew install swiftlint' >&2
    exit 1
  fi
  # SwiftLint finds Xcode's toolchain itself, and is told where the Command Line Tools are.
  if [ "$(xcode-select -p)" = /Library/Developer/CommandLineTools ]; then
    export TOOLCHAIN_DIR=/Library/Developer/CommandLineTools
  fi
  swiftlint lint --strict --quiet pet/app
  sh pet/app/test.sh
else
  echo "check: skipped the pet's native tests, which need macOS"
fi
