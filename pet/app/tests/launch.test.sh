#!/bin/sh
# The launcher's own tests (launch.sh), with a home of their own and stand-ins for the compiler
# and for what it opens and closes, so nothing here touches the pet that runs.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

failures=0
expect() { # expect <got> <wanted> <what>
	if [ "$1" != "$2" ]; then
		failures=$((failures + 1))
		echo "  $3: got $1, wanted $2"
	fi
}
# how many times a line of the log starts with the word
count() { grep -c "^$1" "$tmp/log" || true; }
# eventually <command…>: waits until the command holds, for five seconds at most
eventually() {
	tries=0
	until "$@"; do
		tries=$((tries + 1))
		[ "$tries" -lt 100 ] || return 1
		/bin/sleep 0.05
	done
}
compiling() { [ -e "$LOG.compiler" ]; }
# the compiler has started, and three other launchers wait for its lock
contended() { compiling && [ "$(sort -u "$LOG.waits" | grep -c .)" -ge 3 ]; }

export HOME="$tmp/home"
dir="$HOME/Library/Application Support/claude-pet"
mkdir -p "$HOME" "$tmp/bin" "$tmp/src"
: >"$tmp/log"
for file in main.swift Controller.swift Text.swift Info.plist; do echo "$file" >"$tmp/src/$file"; done
cp "$here/launch.sh" "$tmp/src/launch.sh"
launch() { sh "$tmp/src/launch.sh" "$@"; }

# the compiler says its pid and writes what it was asked for, once the test lets it through the
# fifo that GATE names, if any
cat >"$tmp/bin/swiftc" <<'EOF'
#!/bin/sh
echo swiftc >>"$LOG"
echo $$ >"$LOG.compiler"
while [ "$1" != -o ]; do shift; done
[ -z "${GATE:-}" ] || read -r _ <"$GATE"
echo built >"$2"
chmod +x "$2"
EOF
# a launcher waiting for the lock sleeps between tries: the stand-in says which one
# shellcheck disable=SC2016
printf '#!/bin/sh\necho "$PPID" >>"$LOG.waits"\nexec /bin/sleep "$@"\n' >"$tmp/bin/sleep"
for tool in open pkill; do
	# The stand-in expands "$@" when it runs, not here.
	# shellcheck disable=SC2016
	printf '#!/bin/sh\necho %s "$@" >>"$LOG"\n' "$tool" >"$tmp/bin/$tool"
done
printf '#!/bin/sh\nexit 1\n' >"$tmp/bin/pgrep"
chmod +x "$tmp/bin/"*
export LOG="$tmp/log" PATH="$tmp/bin:$PATH"

# the first launch compiles and opens; the next ones only open, whatever the files' dates say
launch open
expect "$(count swiftc)" 1 "first launch compiles:"
expect "$(count open)" 1 "first launch opens:"
touch "$tmp/src/Controller.swift"
launch open
expect "$(count swiftc)" 1 "same sources, newer date:"
expect "$(count open)" 2 "opens again:"

# other sources compile again, whatever date they carry, and the old pet is closed first
closed=$(count pkill)
echo changed >"$tmp/src/Controller.swift"
touch -t 200001010000 "$tmp/src/Controller.swift"
launch open
expect "$(count swiftc)" 2 "other sources, old date:"
expect "$(count pkill)" $((closed + 1)) "the old pet is closed:"

# closing it keeps it closed for the sessions that start, until someone opens it
launch quit
expect "$([ -e "$dir/quit" ] && echo yes || echo no)" yes "quit is remembered:"
opens=$(count open)
launch start
expect "$(count open)" "$opens" "a session start leaves it closed:"
launch open
expect "$([ -e "$dir/quit" ] && echo yes || echo no)" no "open forgets it:"
launch start
expect "$(count open)" $((opens + 2)) "a session start opens it again:"

# launchers at once: one compiles, the rest wait for it and leave no trace
echo again >"$tmp/src/Controller.swift"
compiled=$(count swiftc)
mkfifo "$tmp/gate"
rm -f "$LOG.compiler"
: >"$LOG.waits"
for _ in 1 2 3 4; do GATE="$tmp/gate" sh "$tmp/src/launch.sh" open & done
eventually contended || expect no yes "three launchers wait for the one that compiles:"
! compiling || echo go >"$tmp/gate"
wait
expect "$(count swiftc)" $((compiled + 1)) "four launchers at once:"
expect "$(ls "$dir/Pet.app/Contents/MacOS")" claude-pet "no half-built binary:"
expect "$([ -L "$dir/launch.lock" ] && echo yes || echo no)" no "the lock is let go:"

# a lock left by a launcher that is gone does not hold the next one
echo more >"$tmp/src/Controller.swift"
compiled=$(count swiftc)
ln -s 99999999 "$dir/launch.lock"
launch open
expect "$(count swiftc)" $((compiled + 1)) "a stale lock:"

# one that is stopped mid-compile takes its compiler, its temporary and its lock with it
echo last >"$tmp/src/Controller.swift"
rm -f "$LOG.compiler"
GATE="$tmp/gate" sh "$tmp/src/launch.sh" open &
launcher=$!
eventually compiling || expect no yes "it compiles:"
kill -TERM "$launcher"
wait "$launcher" || true
expect "$(kill -0 "$(cat "$LOG.compiler")" 2>/dev/null && echo alive || echo gone)" gone "its compiler:"
expect "$(ls "$dir/Pet.app/Contents/MacOS")" claude-pet "its temporary:"
expect "$([ -L "$dir/launch.lock" ] && echo yes || echo no)" no "its lock:"

if [ "$failures" -eq 0 ]; then echo "launcher: all passed"; else echo "launcher: $failures failed"; fi
[ "$failures" -eq 0 ]
