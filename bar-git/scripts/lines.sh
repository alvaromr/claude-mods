#!/bin/sh
# One `added<TAB>removed` row per changed file of the whole repository of the
# current folder: the tracked ones from numstat (against the empty tree where
# there is no commit yet, so the files staged in a new repository count), each
# untracked text file as its line count. The status lists the same untracked
# files, one by one.
export GIT_OPTIONAL_LOCKS=0
cd "$(git rev-parse --show-toplevel)" && {
  git diff "$(git rev-parse -q --verify HEAD || git hash-object -t tree /dev/null)" --numstat
  git ls-files -o --exclude-standard -z | xargs -0 grep -cI '' | awk -F: '{print $NF "\t0"}'
} 2>/dev/null
