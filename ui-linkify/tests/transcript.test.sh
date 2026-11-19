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
# A message that pasted images 1 and 2, one that pasted 3 with no media type and
# 4 with no data, one with an id and no image block, then rows that paste none:
# another kind, no ids and ids that are no array. The same session in another
# project folder, and another session.
cat >"$tmp/projects/-repo/s1.jsonl" <<'EOF'
{"type":"user","imagePasteIds":[1,2],"message":{"content":[{"type":"text","text":"look"},{"type":"image","source":{"media_type":"image/png","data":"AAA"}},{"type":"image","source":{"media_type":"image/jpeg","data":"BBB"}}]}}
{"type":"user","imagePasteIds":[3,4],"message":{"content":[{"type":"image","source":{"data":"CCC"}},{"type":"image","source":{"media_type":"image/png"}}]}}
{"type":"user","imagePasteIds":[5],"message":{"content":[{"type":"text","text":"no image"}]}}
{"type":"assistant","imagePasteIds":[6],"message":{"content":[{"type":"image","source":{"media_type":"image/png","data":"DDD"}}]}}
{"type":"user","message":{"content":[{"type":"image","source":{"media_type":"image/png","data":"EEE"}}]}}
{"type":"user","imagePasteIds":7,"message":{"content":[{"type":"image","source":{"media_type":"image/png","data":"FFF"}}]}}
EOF
printf '%s\n' '{"type":"user","imagePasteIds":[8],"message":{"content":[{"type":"image","source":{"media_type":"image/png","data":"GGG"}}]}}' >"$tmp/projects/-other/s1.jsonl"
printf '%s\n' '{"type":"user","imagePasteIds":[9],"message":{"content":[{"type":"image","source":{"media_type":"image/png","data":"HHH"}}]}}' >"$tmp/projects/-repo/s2.jsonl"

read_ids() { sh "$script" "$1" "$tmp" "${2:-s1}"; } # read_ids <wanted> [<session>]

expect "$(read_ids '[1]')" "1 image/png AAA" "a wanted image is a number, its type and its data"
expect "$(read_ids '[2]')" "2 image/jpeg BBB" "an image is the one at its id's place"
expect "$(read_ids '[1,2]')" "$(printf '%s\n%s' '1 image/png AAA' '2 image/jpeg BBB')" "several wanted images, a line each"
expect "$(read_ids '[2,1]')" "$(printf '%s\n%s' '1 image/png AAA' '2 image/jpeg BBB')" "the images come in the transcript's order"
expect "$(read_ids '[3]')" "3  CCC" "an image with no type has it empty"
expect "$(read_ids '[4]')" "4 image/png " "an image with no data has it empty"
expect "$(read_ids '[5]')" "5  " "an id with no image block has both empty"
expect "$(read_ids '[1]' | wc -l | tr -d ' ')" 1 "an unwanted image is skipped"
expect "$(read_ids '[6,7]')" "" "rows that are no user's, have no ids, or whose ids are no array, are ignored"
expect "$(read_ids '[8]')" "8 image/png GGG" "the session's file is found in any project folder"
expect "$(read_ids '[9]')" "" "the file of another session is not read"
expect "$(read_ids '[9]' s2)" "9 image/png HHH" "the session asked for is the one read"
expect "$(read_ids '[99]')" "" "an id the transcript does not hold gives nothing"
expect "$(read_ids '[]')" "" "no wanted id gives nothing"

status=0
out=$(read_ids '[1]' missing 2>/dev/null) || status=$?
expect "$out" "" "a session with no transcript file prints nothing"
expect "$status" 2 "a session with no transcript file exits with jq's status"
status=0
read_ids '[1]' >/dev/null || status=$?
expect "$status" 0 "a transcript read exits 0"
status=0
read_ids '[99]' >/dev/null || status=$?
expect "$status" 0 "a transcript with no wanted id exits 0"

if [ "$failures" -eq 0 ]; then echo "transcript: all passed"; else echo "transcript: $failures failed"; fi
[ "$failures" -eq 0 ]
