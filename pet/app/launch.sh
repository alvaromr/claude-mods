#!/bin/sh
# Opens the desktop pet, compiling it first when its sources are not the ones the app was built
# from. A session starting runs `launch.sh start`, which leaves the pet closed when its person
# closed it; `launch.sh open` (/pet) opens it whatever, and `launch.sh quit` closes it and
# keeps it closed until the next `open`.
set -eu

name=claude-pet
src=$(cd "$(dirname "$0")" && pwd)
dir="$HOME/Library/Application Support/$name"
app="$dir/Pet.app"
bin="$app/Contents/MacOS/$name"
# What the app was built from, as a hash: a plugin's update can leave its files with the dates
# they had, so a date proves nothing.
built="$dir/sources.sha256"
# The person's word that the pet stays closed; the pet's own Salir writes it too (Controller.swift).
quit="$dir/quit"
# Held by the launcher that compiles, as a link to its pid, so that no two compile and restart
# the pet over each other.
lock="$dir/launch.lock"

mkdir -p "$dir"

case "${1:-open}" in
quit)
	: >"$quit"
	pkill -x "$name" || true
	exit 0
	;;
start)
	[ ! -e "$quit" ] || exit 0
	;;
*)
	rm -f "$quit"
	;;
esac

# Every Swift file of the folder, in the order of their names' bytes whatever the locale, and the scripts
# the app runs in Orca's Node.
sources() { (LC_ALL=C; cat "$src"/*.swift "$src/Info.plist" "$src"/*.mjs | shasum -a 256); }
is_built() { [ -x "$bin" ] && [ "$(cat "$built" 2>/dev/null || true)" = "$(sources)" ]; }

holds_lock=
child=
# On any way out, even a signal: the lock, the half-built binary and the compiler go with it.
cleanup() {
	[ -z "$child" ] || kill "$child" 2>/dev/null || true
	rm -f "$bin.$$"
	[ -z "$holds_lock" ] || rm -f "$lock"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if ! is_built; then
	# The hook that runs this gives it three minutes: waiting longer would only be killed.
	ticks=0
	until ln -s "$$" "$lock" 2>/dev/null; do
		# a launcher killed before it let go leaves its lock behind
		holder=$(readlink "$lock" 2>/dev/null || true)
		if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
			[ "$(readlink "$lock" 2>/dev/null || true)" != "$holder" ] || rm -f "$lock"
			continue
		fi
		ticks=$((ticks + 1))
		if [ "$ticks" -gt 1700 ]; then
			echo "launch: another launcher has held $lock for too long" >&2
			exit 1
		fi
		sleep 0.1
	done
	holds_lock=1

	# the one that held the lock before may have built it
	if ! is_built; then
		rm -f "$bin".[0-9]*
		mkdir -p "$app/Contents/MacOS"
		cp "$src/Info.plist" "$app/Contents/Info.plist"
		mkdir -p "$app/Contents/Resources"
		cp "$src"/*.mjs "$app/Contents/Resources/"
		# built aside and moved in, so a second session starting meanwhile never opens half a binary
		swiftc -O -o "$bin.$$" "$src"/*.swift &
		child=$!
		wait "$child"
		child=
		mv "$bin.$$" "$bin"
		sources >"$built"
		# `open` would only bring the running, older pet forward
		pkill -x "$name" || true
		ticks=0
		while pgrep -x "$name" >/dev/null && [ "$ticks" -lt 50 ]; do
			sleep 0.1
			ticks=$((ticks + 1))
		done
		if pgrep -x "$name" >/dev/null; then pkill -9 -x "$name" || true; fi
	fi
	rm -f "$lock"
	holds_lock=
fi

open -g "$app"
