#!/bin/sh
# The end-to-end smoke: a real Claude Code loads every mod of the repo (or the
# mods named) from its folder, and each hooks module must say it loaded. It
# runs with a configuration folder of its own, so none of your settings,
# installed plugins or login take part: with no login the session stops before
# asking any model, which costs nothing, and a session that is not interactive
# opens no pet.
set -eu
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mods="$*"
if [ -z "$mods" ]; then
  for manifest in */.claude-plugin/plugin.json; do
    mods="$mods ${manifest%%/*}"
  done
fi

set --
for mod in $mods; do
  set -- "$@" --plugin-dir "./$mod"
done

# The session ends asking for a login; its exit code says nothing of the mods.
env -u ANTHROPIC_API_KEY CLAUDE_CONFIG_DIR="$tmp/config" \
  claude -p --no-session-persistence "$@" --debug-file "$tmp/log" 'Reply with: ok' >/dev/null 2>&1 || true

failed=''
for mod in $mods; do
  grep -q "hooks module $mod@inline loaded" "$tmp/log" || failed="$failed $mod"
done

if [ -n "$failed" ]; then
  echo "smoke: these mods did not load in Claude Code:$failed" >&2
  grep -E "hooks module ($(echo "$failed" | sed 's/^ //; s/ /|/g'))@inline" "$tmp/log" >&2 || true
  exit 1
fi
echo "smoke: every mod loaded in Claude Code"
