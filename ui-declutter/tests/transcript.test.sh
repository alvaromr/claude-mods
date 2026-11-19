#!/bin/sh
# The tests of scripts/transcript.sh, which runs the real jq on transcript files
# of a config folder of its own.
set -eu

script=$(cd "$(dirname "$0")/../scripts" && pwd)/transcript.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

failures=0
expect() { # expect <got> <wanted> <what>
	if [ "$1" != "$2" ]; then
		failures=$((failures + 1))
		echo "  $3: got '$1', wanted '$2'"
	fi
}

mkdir -p "$tmp/projects/-repo" "$tmp/projects/-other"
# One row of each kind: the results of a hunk edit (u1), a file created (u2), a
# command's edits (u3), an image read (u4) and one nobody asked for (u5), a row
# whose result is no object, a row that is no user's and a row with no result.
cat >"$tmp/projects/-repo/s1.jsonl" <<'EOF'
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u1","content":"ok"}]},"toolUseResult":{"type":"update","filePath":"/a.ts","structuredPatch":[{"oldStart":1,"lines":["-a","+b"]}],"extra":1}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u2","content":"ok"}]},"toolUseResult":{"type":"create","content":"line 1\nline 2","structuredPatch":[]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u3","content":"ok"}]},"toolUseResult":{"type":"text","bashEditDiff":{"files":[{"filePath":"/b.ts","hunks":[{"oldStart":2}],"other":true}]}}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u4","content":"ok"}]},"toolUseResult":{"type":"image","file":{"originalSize":1234,"dimensions":{"originalWidth":10,"originalHeight":20},"base64":"x"}}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u5","content":"ok"}]},"toolUseResult":{"type":"update","structuredPatch":[]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u1","content":"ok"}]},"toolUseResult":"a string, no object"}
{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"u1","content":"ok"}]},"toolUseResult":{"type":"update"}}
{"type":"user","message":{"content":[{"type":"text","text":"hi"}]},"toolUseResult":{"type":"update"}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u1","content":"ok"}]}}
EOF
# The same session in another project folder, and another session.
printf '%s\n' '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u6","content":"ok"}]},"toolUseResult":{"type":"update"}}' >"$tmp/projects/-other/s1.jsonl"
printf '%s\n' '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u7","content":"ok"}]},"toolUseResult":{"type":"update"}}' >"$tmp/projects/-repo/s2.jsonl"

read_ids() { sh "$script" "$1" "$tmp" "${2:-s1}"; } # read_ids <wanted> [<session>]

expect "$(read_ids '["u1"]')" \
	'{"id":"u1","output":{"type":"update","structuredPatch":[{"oldStart":1,"lines":["-a","+b"]}],"content":null,"bashEditDiff":null,"file":null}}' \
	"a wanted id gives its patch, and only the parts drawn"
expect "$(read_ids '["u2"]')" \
	'{"id":"u2","output":{"type":"create","structuredPatch":[],"content":"line 1\nline 2","bashEditDiff":null,"file":null}}' \
	"a created file gives its content"
expect "$(read_ids '["u3"]')" \
	'{"id":"u3","output":{"type":"text","structuredPatch":null,"content":null,"bashEditDiff":{"files":[{"filePath":"/b.ts","hunks":[{"oldStart":2}]}]},"file":null}}' \
	"a command's edits give each file's path and hunks"
expect "$(read_ids '["u4"]')" \
	'{"id":"u4","output":{"type":"image","structuredPatch":null,"content":null,"bashEditDiff":null,"file":{"originalSize":1234,"dimensions":{"originalWidth":10,"originalHeight":20}}}}' \
	"an image read gives its size and dimensions"
expect "$(read_ids '["u4","u2"]' | cut -c1-11)" \
	"$(printf '%s\n%s' '{"id":"u2",' '{"id":"u4",')" \
	"several wanted ids come in the transcript's order"
expect "$(read_ids '["u1","u5"]' | wc -l | tr -d ' ')" 2 "a wanted id is told once, one line each"
expect "$(read_ids '["u9"]')" "" "an id the transcript does not hold gives nothing"
expect "$(read_ids '[]')" "" "no wanted id gives nothing"
expect "$(read_ids '["u6"]' | cut -c1-11)" '{"id":"u6",' "the session's file is found in any project folder"
expect "$(read_ids '["u7"]')" "" "the file of another session is not read"
expect "$(read_ids '["u7"]' s2 | cut -c1-11)" '{"id":"u7",' "the session asked for is the one read"
expect "$(read_ids '["u1"]' s1 | grep -c '"id":"u1"')" 1 "rows that are no user's, no object or no result are ignored"

status=0
out=$(read_ids '["u1"]' missing 2>/dev/null) || status=$?
expect "$out" "" "a session with no transcript file prints nothing"
expect "$status" 2 "a session with no transcript file exits with jq's status"
status=0
read_ids '["u1"]' >/dev/null || status=$?
expect "$status" 0 "a transcript read exits 0"
status=0
read_ids '["u9"]' >/dev/null || status=$?
expect "$status" 0 "a transcript with no wanted id exits 0"

if [ "$failures" -eq 0 ]; then echo "transcript: all passed"; else echo "transcript: $failures failed"; fi
[ "$failures" -eq 0 ]
