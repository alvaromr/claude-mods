#!/bin/sh
# The wanted pasted images (their numbers, a JSON array, $1), a line each, out
# of the session's transcript file $2: too large to read in the hooks module, so
# jq does. Exits with jq's status, which is not 0 where the file is missing.
jq -r --argjson wanted "$1" -f "$(dirname "$0")/transcript.jq" "$2"
