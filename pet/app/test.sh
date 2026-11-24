#!/bin/sh
# Runs the launcher's tests, then builds the pet's own tests with its sources
# and runs them in a home of their own, so they read the sessions and
# transcripts they write and none of yours.
set -eu

src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

sh "$src/tests/launch.test.sh"

# The pet compiles with whatever Swift its user has, so the tests say which.
swiftc --version 2>&1 | head -1
# Every Swift file of the pet but its main.swift, which starts the app; the tests have their own.
set --
for file in "$src"/*.swift; do
	[ "${file##*/}" = main.swift ] || set -- "$@" "$file"
done
swiftc -o "$tmp/tests" "$@" "$src"/tests/*.swift
# Run from an Orca tab, the tests would find their own process in it, by what Orca exports to it.
CFFIXED_USER_HOME="$tmp/home" env -u ORCA_AGENT_SESSION_ID -u ORCA_TERMINAL_HANDLE "$tmp/tests"
