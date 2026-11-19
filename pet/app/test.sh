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
CFFIXED_USER_HOME="$tmp/home" "$tmp/tests"
