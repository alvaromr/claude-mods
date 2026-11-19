#!/bin/sh
# How many of the branch's commits no remote has yet, whether or not it tracks
# an upstream (a worktree's branch seldom does); 0 where there is no remote to
# integrate into.
export GIT_OPTIONAL_LOCKS=0
[ -n "$(git remote 2>/dev/null)" ] && git rev-list --count HEAD --not --remotes 2>/dev/null || echo 0
