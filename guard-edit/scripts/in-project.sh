#!/bin/sh
# Prints each path given that belongs to a git project and is not ignored there:
# `git check-ignore` exits 1 for one, 0 for an ignored one, 128 outside a project.
# A path marked `?` counts only if it is a file already there.
for p; do
	case $p in '?'*)
		p=${p#?}
		[ -f "$p" ] || continue
		;;
	esac
	d=$p
	[ -d "$d" ] || d=$(dirname "$d")
	while [ ! -d "$d" ]; do d=$(dirname "$d"); done
	git -C "$d" check-ignore -q -- "$p" 2>/dev/null
	[ $? -eq 1 ] && printf '%s\n' "$p"
done
exit 0
