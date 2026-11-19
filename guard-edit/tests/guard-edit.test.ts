import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The session runs in /repo, a git project whose `dist/` git ignores; any
// other folder is no project. `/repo/old.ts` and `/repo/src/x.ts` are files
// already there, the only ones a path marked `?` counts for.
const EXISTING = new Set(['/repo/old.ts', '/repo/src/x.ts'])
const stage = (on: On) => {
  const asked: string[][] = []
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', (_, e) => {
    expect(e.argv[1]?.endsWith('/guard-edit/scripts/in-project.sh')).toBe(true)
    const paths = e.argv.slice(2)
    asked.push(paths)
    const inProject = paths
      .filter(path => !path.startsWith('?') || EXISTING.has(path.slice(1)))
      .map(path => path.replace(/^\?/, ''))
      .filter(path => path.startsWith('/repo') && !path.startsWith('/repo/dist'))

    return {
      value: {
        exitCode: 0,
        stdout: inProject.join('\n'),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))

  return asked
}

const run = async ($: Engine, command: string) => {
  const result = await $.tool.call({ tool: 'Bash', command })

  return 'deny' in result && result.deny !== undefined ? result.deny : 'ran'
}

test('denies the shell edits of a project file', async ($, on) => {
  stage(on)

  for (const command of [
    "sed -i '' 's/a/b/' src/a.ts",
    'sed -E -i "s/x/y/g" /repo/src/*.ts',
    "perl -pi -e 's/a/b/' src/a.ts",
    'echo hola > notes.md',
    'cat >> /repo/README.md <<EOF\nmás\nEOF',
    'jq . a.json | tee src/b.json',
    "python3 - <<'EOF'\nfrom pathlib import Path\np = Path('src/a.ts')\ns = p.read_text()\np.write_text(s.replace('a', 'b'))\nEOF",
    "node -e \"require('fs').writeFileSync('src/a.ts', 'x')\"",
    'cd src && sed -i "" "s/a/b/" a.ts',
    "env LC_ALL=C nice sed -i -e 's/a/b/' src/a.ts",
    "python3 -c \"open('src/a.ts', 'w').write('x')\"",
    'echo $(date) > notes.md # stamp',
    'cp /tmp/x.ts old.ts',
    'git apply /tmp/fix.patch',
    // Blanks a word stops at but no space: a \r line end, a no-break space.
    'echo hola > notes.md\r\n',
    'echo hola > notes.md',
    // An empty suffix glued to -i, as portable scripts write it.
    "sed -i'' 's/a/b/' src/a.ts",
    'sed -i"" -e "s/a/b/" src/a.ts',
    "perl -pi'.bak' -e 's/a/b/' src/a.ts",
    // A command line handed to a shell or to eval.
    "bash -c 'echo x > src/a.ts'",
    'sh -lc "sed -i \'\' s/a/b/ src/a.ts"',
    "eval 'echo x > notes.md'",
    // Into a folder named with no slash, over a file there.
    'cp /tmp/x.ts src',
    'git -C /repo apply /tmp/fix.patch',
    'echo x > /tmp/../repo/notes.md',
    // Every editor and every way of naming what it writes.
    'gsed -i s/a/b/ src/a.ts',
    'sed --in-place s/a/b/ src/a.ts',
    'sed -ni s/a/b/p src/a.ts',
    'sed -i -f s.sed src/a.ts',
    'sed -i --expression s/a/b/ src/a.ts',
    'sed -i --file s.sed src/a.ts',
    "ruby -i -pe '$_.upcase!' src/a.ts",
    "awk -i inplace '{ print }' src/a.ts",
    "gawk -i inplace '{ print }' src/a.ts",
    'awk -i inplace -f p.awk src/a.ts',
    'mv /tmp/x.ts old.ts',
    'patch -p1 < /tmp/fix.patch',
    'git -c core.x=y apply /tmp/fix.patch',
    'git --git-dir .git apply /tmp/fix.patch',
    'git --work-tree x apply /tmp/fix.patch',
    'git --namespace n apply /tmp/fix.patch',
    'git --super-prefix p/ apply /tmp/fix.patch',
    'echo x >| notes.md',
    'echo x >& notes.md',
    'cat 3<> notes.md',
    'echo x 2> notes.md',
    'echo x &> notes.md',
    'echo x >> notes.md',
    'echo x > $PWD/notes.md',
    'echo x > ${PWD}/notes.md',
    'FOO=1 sed -i s/a/b/ src/a.ts',
    '/bin/sed -i s/a/b/ src/a.ts',
    '/usr/bin/env sed -i s/a/b/ src/a.ts',
    // What a script writes, in any of the languages and calls it may use.
    "python -c \"open('src/a.ts', 'w').write('x')\"",
    "bun -e \"require('fs').writeFileSync('src/a.ts', 'x')\"",
    "deno run - <<'EOF'\nrequire('fs').writeFileSync('src/a.ts', 'x')\nEOF",
    "node --eval \"require('fs').writeFileSync('src/a.ts', 'x')\"",
    "ruby -e \"File.write('src/a.ts', 'x')\"",
    "perl -e \"open(F, 'src/a.ts', 'w')\"",
    'python3 -c "import shutil; shutil.copy(s, \'/repo/abs.txt\')"',
    'python3 -c "import shutil; shutil.move(s, \'out.txt\')"',
    // Redirections that only look like tests, and the tests a line leaves open.
    'echo [[ > notes.md',
    '"[[" a > notes.md',
    '[[ a ]] > notes.md',
    '[[ a\necho x > notes.md',
    '[[ a ; echo x > notes.md',
    // A <<- heredoc ends at its tab-indented delimiter, so what follows runs.
    'cat <<-EOF\n\ttext\n\tEOF\necho y > notes.md',
    // A script on the input, with its own heredoc or piped in, to any shell.
    'echo "echo x > notes.md" |& sh',
    'echo foo | bash <<EOF\necho x > notes.md\nEOF',
    'zsh -c "echo x > notes.md"',
    'dash -c "echo x > notes.md"',
    'ksh -c "echo x > notes.md"',
    'bash -ec "echo x > notes.md"',
    "bash -s arg <<< 'echo x > notes.md'",
    'bash - <<EOF\necho x > notes.md\nEOF',
  ]) {
    expect(await run($, command), command).toMatch(/^guard-edit: this command writes \/repo[/ ]/)
  }
})

test('finds the command past keywords and wrappers', async ($, on) => {
  stage(on)

  for (const command of [
    'if [ -f f ]; then sed -i s/a/b/ src/a.ts; fi',
    'for x in a; do sed -i s/x/y/ src/a.ts; done',
    'while true; do echo x > notes.md; done',
    '{ tee notes.md; }',
    '! sed -i s/a/b/ src/a.ts',
    'env -i sed -i s/a/b/ src/a.ts',
    'env -u HOME sed -i s/a/b/ src/a.ts',
    'timeout 5 sed -i s/a/b/ src/a.ts',
    'timeout -k 1 5 tee notes.md',
    'ionice -c 3 sed -i s/a/b/ src/a.ts',
    'nice -n 5 sed -i s/a/b/ src/a.ts',
    'sudo -u x sed -i s/a/b/ src/a.ts',
    // What the files come from is unknown: the folder it runs in.
    'find . | xargs sed -i s/a/b/',
    'xargs -0 -n1 sed -i s/a/b/',
    'xargs -I{} sed -i s/a/b/ {}',
    'xargs -I X tee X',
    "find src -name '*.ts' -exec sed -i s/a/b/ {} \\;",
    'find . -type f -exec sed -i s/a/b/ {} +',
    'find . -exec grep a {} \\; -exec sed -i s/a/b/ {} \\;',
    'find . -exec sudo -u x sed -i s/a/b/ {} \\;',
    'if false; then true; else sed -i s/a/b/ src/a.ts; fi',
    'if false; then true; elif sed -i s/a/b/ src/a.ts; then true; fi',
    'until sed -i s/a/b/ src/a.ts; do :; done',
    'while sed -i s/a/b/ src/a.ts; do :; done',
    'find . -execdir sed -i s/a/b/ {} \\;',
    'find . -ok sed -i s/a/b/ {} \\;',
    'find . -okdir sed -i s/a/b/ {} \\;',
    // Each wrapper, and each option of one that takes a value.
    'command sed -i s/a/b/ src/a.ts',
    'builtin sed -i s/a/b/ src/a.ts',
    'exec sed -i s/a/b/ src/a.ts',
    'exec -a name sed -i s/a/b/ src/a.ts',
    'nohup sed -i s/a/b/ src/a.ts',
    'setsid sed -i s/a/b/ src/a.ts',
    'time sed -i s/a/b/ src/a.ts',
    'time -f %e sed -i s/a/b/ src/a.ts',
    'time -o out.txt sed -i s/a/b/ src/a.ts',
    'time --format %e sed -i s/a/b/ src/a.ts',
    'time --output out.txt sed -i s/a/b/ src/a.ts',
    'env -C /tmp sed -i s/a/b/ src/a.ts',
    'env -S x sed -i s/a/b/ src/a.ts',
    'env --unset X sed -i s/a/b/ src/a.ts',
    'env --chdir /tmp sed -i s/a/b/ src/a.ts',
    'env --split-string x sed -i s/a/b/ src/a.ts',
    'sudo sed -i s/a/b/ src/a.ts',
    'sudo --user x sed -i s/a/b/ src/a.ts',
    'sudo -D /tmp sed -i s/a/b/ src/a.ts',
    'doas sed -i s/a/b/ src/a.ts',
    'doas -u x sed -i s/a/b/ src/a.ts',
    'nice sed -i s/a/b/ src/a.ts',
    'nice --adjustment 5 sed -i s/a/b/ src/a.ts',
    'ionice sed -i s/a/b/ src/a.ts',
    'ionice -n 4 sed -i s/a/b/ src/a.ts',
    'ionice --class 3 sed -i s/a/b/ src/a.ts',
    'ionice --classdata 4 sed -i s/a/b/ src/a.ts',
    'timeout 5 tee notes.md',
    'timeout -s KILL 5 tee notes.md',
    'timeout --kill-after 1 5 tee notes.md',
    'timeout --signal KILL 5 tee notes.md',
    'stdbuf sed -i s/a/b/ src/a.ts',
    'stdbuf -i L sed -i s/a/b/ src/a.ts',
    'stdbuf -o L sed -i s/a/b/ src/a.ts',
    'stdbuf -e L sed -i s/a/b/ src/a.ts',
    'stdbuf --input L sed -i s/a/b/ src/a.ts',
    'stdbuf --output L sed -i s/a/b/ src/a.ts',
    'stdbuf --error L sed -i s/a/b/ src/a.ts',
    'xargs -J X tee X',
    'xargs -n 1 -P 4 -L 1 -s 100 -d x -E eof -a list -R 1 -S 100 -I X tee X',
    'xargs --max-args 1 --max-procs 2 --delimiter x -I X tee X',
  ]) {
    expect(await run($, command), command).toMatch(/^guard-edit: this command writes \/repo[/ ]/)
  }
})

test('keeps a here-string from swallowing the lines after it', async ($, on) => {
  stage(on)

  for (const command of [
    'cat <<< hi\necho x > notes.md',
    'cat <<< hi\necho x > notes.md\nsed -i s/a/b/ src/a.ts',
    'cat <<< hi && echo x > notes.md',
  ]) {
    expect(await run($, command), command).toMatch(/^guard-edit: this command writes \/repo\/notes\.md/)
  }
})

test('follows the folder the cds leave', async ($, on) => {
  stage(on)

  for (const [command, file] of [
    ['(cd /tmp && ls); echo x > src/a.ts', '/repo/src/a.ts'],
    ['(cd /tmp); echo x > notes.md', '/repo/notes.md'],
    ['cd /tmp; cd -; echo x > notes.md', '/repo/notes.md'],
    ['cd src; cd /tmp; cd -; echo x > a.ts', '/repo/src/a.ts'],
    ['cd -P src && echo x > a.ts', '/repo/src/a.ts'],
    // Unknown where: the project is assumed, not let through.
    ['cd "$X" && echo x > notes.md', '/repo/notes.md'],
    ['cd /tmp && cd "$X" && echo x > notes.md', '/repo/notes.md'],
    ['cd "$(git rev-parse --show-toplevel)" && echo x > notes.md', '/repo/notes.md'],
  ] as const) {
    expect(await run($, command), command).toMatch(new RegExp(`^guard-edit: this command writes ${file}[ ,]`))
  }
})

test('reads a shell script wherever it comes from', async ($, on) => {
  stage(on)

  for (const command of [
    'bash <<EOF\necho x > notes.md\nEOF',
    "bash <<'EOF'\nsed -i s/a/b/ src/a.ts\nEOF",
    'sh <<EOF\ncd src\necho x > a.ts\nEOF',
    "bash -s <<< 'echo x > notes.md'",
    "echo 'sed -i s/a/b/ src/a.ts' | sh",
    "printf '%s\\n' 'echo x > notes.md' | bash",
    'cat <<EOF | bash\necho x > notes.md\nEOF',
    'echo $(echo x > notes.md)',
    'echo `echo x > notes.md`',
    'echo "$(sed -i s/a/b/ src/a.ts)"',
    'echo "`echo x > notes.md`"',
    'FOO=$(echo x > notes.md) true',
    'echo y > >(tee notes.md)',
    'diff <(echo x > notes.md) /dev/null',
    'echo $(cd src && echo x > a.ts)',
  ]) {
    expect(await run($, command), command).toMatch(/^guard-edit: this command writes \/repo[/ ]/)
  }
})

test('puts a cp or mv into the folder -t names', async ($, on) => {
  stage(on)

  for (const command of [
    'cp -t src /tmp/x.ts',
    'mv -t src /tmp/x.ts',
    'cp -rt src /tmp/x.ts',
    'cp --target-directory=src /tmp/x.ts',
    'cp --target-directory src /tmp/x.ts',
    'cp -tsrc /tmp/x.ts',
    'cp /tmp/x.ts -t src',
  ]) {
    expect(await run($, command), command).toMatch(
      /^guard-edit: this command writes \/repo\/src\/x\.ts from the shell \(/,
    )
  }
})

test('names the files a command writes and how, once each', async ($, on) => {
  stage(on)

  for (const [command, files, how] of [
    // Where the files an xargs or a find runs on come from.
    ['xargs -I X tee X', '/repo', 'tee'],
    ['xargs -IX tee X', '/repo', 'tee'],
    ['xargs -J X tee X', '/repo', 'tee'],
    ['xargs -iX tee X', '/repo', 'tee'],
    ['xargs --replace=X tee X', '/repo', 'tee'],
    ['xargs -i tee {}', '/repo', 'tee'],
    ['xargs --replace tee {}', '/repo', 'tee'],
    ['xargs tee', '/repo', 'tee'],
    ['find src -exec tee {} \\;', '/repo/src', 'tee'],
    ['find src -exec tee {} +', '/repo/src', 'tee'],
    ['find -L src -exec tee {} \\;', '/repo/src', 'tee'],
    ['find ! -name x -exec tee {} \\;', '/repo', 'tee'],
    ['find -exec tee {} \\;', '/repo', 'tee'],
    // A quoted word is a file name, whatever it starts with.
    ['tee "-x.md"', '/repo/-x.md', 'tee'],
    ["tee '-y.md'", '/repo/-y.md', 'tee'],
    // The script a program takes is no file to edit, nor an empty suffix.
    ["sed -i '' s/a/b/ src/a.ts", '/repo/src/a.ts', 'sed -i'],
    ['perl -pi -e s/a/b/ -e s/c/d/ src/a.ts', '/repo/src/a.ts', 'perl -i'],
    ['sed -i -e s/a/b/ -e s/c/d/ src/a.ts', '/repo/src/a.ts', 'sed -i'],
    ['sed -i -f s.sed -f t.sed src/a.ts', '/repo/src/a.ts', 'sed -i'],
    ['sed -i --expression s/a/b/ --expression s/c/d/ src/a.ts', '/repo/src/a.ts', 'sed -i'],
    ['sed -i --file s.sed --file t.sed src/a.ts', '/repo/src/a.ts', 'sed -i'],
    ["awk -i inplace '{ print }' src/a.ts", '/repo/src/a.ts', 'awk -i inplace'],
    ['awk -i inplace -f p.awk -f q.awk src/a.ts', '/repo/src/a.ts', 'awk -i inplace'],
    // A patch is named as what it is.
    ['git apply /tmp/fix.patch', '/repo', 'git apply'],
    ['patch -p1 < /tmp/fix.patch', '/repo', 'patch'],
    // The files a script names as it writes, and no other path it holds.
    ["python3 -c \"open('src/a.ts', 'w').write(open('data.json').read())\"", '/repo/src/a.ts', 'a python3 script'],
    ["python3 -c \"Path('src/a.ts').write_text(open('data.json').read())\"", '/repo/src/a.ts', 'a python3 script'],
    [
      "node -e \"require('fs').writeFileSync('src/a.ts', require('fs').readFileSync('data.json'))\"",
      '/repo/src/a.ts',
      'a node script',
    ],
    ["ruby -e \"File.write('src/a.ts', File.read('data.json'))\"", '/repo/src/a.ts', 'a ruby script'],
    // A glob stands for its folder; the paths as the shell reads them.
    ['echo x > src/*.ts', '/repo/src', 'a redirection'],
    ['echo x > ./notes.md', '/repo/notes.md', 'a redirection'],
    ['echo x > my\\ notes.md', '/repo/my notes.md', 'a redirection'],
    ['echo x > "a\\"b.md"', '/repo/a"b.md', 'a redirection'],
    // The folder the cds left, for a substitution too.
    ['cd src && echo $(echo x > a.ts)', '/repo/src/a.ts', 'a redirection'],
    ['echo $(cd src && echo $(date) > a.ts)', '/repo/src/a.ts', 'a redirection'],
    ['echo $(cd src && echo \\) > a.ts)', '/repo/src/a.ts', 'a redirection'],
    // A file and a way named once, however often the command writes it.
    ['echo x > notes.md; echo y > notes.md', '/repo/notes.md', 'a redirection'],
    ['echo x > a.md; echo y > b.md', '/repo/a.md, /repo/b.md', 'a redirection'],
  ] as const) {
    expect(await run($, command), command).toContain(`writes ${files} from the shell (${how})`)
  }
})

test('denies them in the command a Monitor runs', async ($, on) => {
  stage(on)
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({ tool: 'Monitor', command: 'echo hola > notes.md', description: 'd', timeout_ms: 1 })

  expect('deny' in ran ? ran.deny : undefined).toMatch(/^guard-edit: this command writes \/repo\/notes\.md/)
})

test('lets through what writes no project file', async ($, on) => {
  const asked = stage(on)

  for (const command of [
    'ls -la 2>&1 | head',
    'pnpm test > /dev/null 2>&1',
    'grep -n "a > b" src/a.ts',
    "sed -n 's/a/b/p' src/a.ts",
    "env LC_ALL=C sed -e 's/a/b/' src/a.ts",
    'echo x#y # > notes.md',
    'echo x > /tmp/scratch.txt',
    'cat > "$TMPDIR/x.json" <<EOF\n{}\nEOF',
    'pnpm build > dist/log.txt',
    'cp src/a.ts new.ts',
    "python3 - <<'EOF'\nprint(open('src/a.ts').read())\nEOF",
    "git commit -q -F - <<'EOF'\nmensaje > con flecha\nEOF",
    'echo x > ~/elsewhere/notes.md',
    // Only checked or measured: no file written.
    'git apply --check /tmp/fix.patch',
    'patch --dry-run -p1 < /tmp/fix.patch',
    'git apply --stat /tmp/fix.patch',
    'git apply --numstat /tmp/fix.patch',
    'git apply --summary /tmp/fix.patch',
    // Not a write: a script that writes nothing, another awk library, one operand, a quoted keyword.
    'python3 -c "print(\'src/a.ts\')"',
    'awk -i join "{ print }" src/a.ts',
    'mv src/x.ts',
    "'if' sed -i s/a/b/ src/a.ts",
    // Not a file: a path only the shell knows, an empty name, a closed descriptor, a comment.
    'echo x > $F',
    'tee ""',
    'echo x >&-',
    '# echo x > notes.md',
    'cd ${TMPDIR}/work && echo x > f',
    // The scratch folders, and what git keeps inside a project.
    'echo x > /private/tmp/x',
    'echo x > /var/folders/ab/x',
    'echo x > /private/var/folders/ab/x',
    'echo x > .git/info/exclude',
    // Asked of git, which says they are no project's.
    'echo x > $HOME/notes.md',
    'echo x > ${HOME}/n.md',
    'cd; echo x > notes.md',
    'cp -t src /tmp/new.ts',
    'cp /tmp/n.ts src/',
    'cp a.ts b.ts dest',
    'python3 -c "import shutil; shutil.copy(s, \'~/x.txt\')"',
  ]) {
    expect(await run($, command), command).toBe('ran')
  }

  // Git is asked only when something is written outside the scratch folders.
  expect(asked).toEqual([
    ['/repo/dist/log.txt'],
    ['?/repo/new.ts', '?/repo/new.ts/a.ts'],
    ['/Users/me/elsewhere/notes.md'],
    ['/Users/me/notes.md'],
    ['/Users/me/n.md'],
    ['/Users/me/notes.md'],
    ['?/repo/src/new.ts'],
    ['?/repo/src/n.ts'],
    ['?/repo/dest/a.ts', '?/repo/dest/b.ts'],
    ['/Users/me/x.txt'],
  ])
})

test('lets through what only looks like a write', async ($, on) => {
  const asked = stage(on)

  for (const command of [
    // `>` and `<` compare inside `[[ ]]`.
    '[[ a > b ]]',
    '[[ $x > 1 ]] && echo yes',
    'if [[ a > b && c < d ]]; then echo yes; fi',
    '[[ -f a || b > c ]] || echo no',
    'x=1; [[ $x > 0 ]]; echo $((x > 0))',
    // A new temporary folder, however the shell names it.
    'cd "$(mktemp -d)" && echo x > f',
    'cd `mktemp -d` && echo x > f',
    'cd "$TMPDIR/work" && echo x > f',
    // A subshell's cd ends with it; so does a substitution's.
    '(cd /tmp && echo x > f)',
    'cd /tmp; (cd /repo); echo x > f',
    'cd /tmp; cd /repo; cd -; echo x > f',
    'echo $(cd /repo); cd /tmp; echo x > f',
    // Writes in the scratch folders, through what the line runs.
    'bash <<EOF\necho x > /tmp/f\nEOF',
    "echo 'echo x > /tmp/f' | sh",
    'echo $(echo x > /tmp/f)',
    'find /tmp/work -exec sed -i s/a/b/ {} \\;',
    'cp -t /tmp/out src/a.ts',
    'cat <<< hi',
    'cat <<< hi\necho x > /tmp/f',
    'echo then if > /tmp/f',
    // Not run by the shell it is piped to: a script file.
    'echo hi | bash script.sh',
    'bash script.sh <<EOF\necho x > notes.md\nEOF',
  ]) {
    expect(await run($, command), command).toBe('ran')
  }

  expect(asked).toEqual([])
})

test('lets a Monitor with no command run', async ($, on) => {
  stage(on)
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({ tool: 'Monitor', description: 'd', timeout_ms: 1 })

  expect('deny' in ran ? ran.deny : undefined).toBeUndefined()
})

test('denies a command its own check fails on', async ($, on) => {
  on('session.cwd', () => {
    throw new Error('no folder')
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const watched = await $.tool.call({ tool: 'Monitor', command: 'ls', description: 'd', timeout_ms: 1 })

  expect(await run($, 'ls')).toBe('guard-edit: its guard failed.')
  expect('deny' in watched ? watched.deny : undefined).toBe('guard-edit: its guard failed.')
})
