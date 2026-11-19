import { expect, test } from 'claude-code/testing'

import { writesIn } from '../hooks/writes-in'

const paths = (command: string) => writesIn(command, '/cwd', '/home').map(write => write.path)

test('a command writes the files it names, from where it runs', () => {
  expect(writesIn('echo x > a', '/cwd', '/home')).toEqual([{ path: '/cwd/a', how: 'a redirection' }])
  expect(paths('echo x > ~/a; tee $HOME/b')).toEqual(['/home/a', '/home/b'])
  expect(paths('echo x')).toEqual([])
  expect(paths('')).toEqual([])
})

test('a cd moves the folder the commands after it run in', () => {
  expect(paths('cd d && echo > a')).toEqual(['/cwd/d/a'])
  expect(paths('cd /abs; echo > a')).toEqual(['/abs/a'])
  expect(paths('cd d; cd e; echo > a')).toEqual(['/cwd/d/e/a'])
  expect(paths('cd; echo > a')).toEqual(['/home/a'])
  expect(paths('cd -P d; echo > a')).toEqual(['/cwd/d/a'])
})

test('cd - goes back to the folder before', () => {
  expect(paths('cd /tmp; cd -; echo > a')).toEqual(['/cwd/a'])
  expect(paths('cd d; cd e; cd -; echo > a')).toEqual(['/cwd/d/a'])
})

test('a cd to a folder only the shell knows stays where the session began', () => {
  expect(paths('cd d; cd $X; echo > a')).toEqual(['/cwd/a'])
  expect(paths('cd $(pwd); echo > a')).toEqual(['/cwd/a'])
})

test('a cd into a new temporary folder leaves the project', () => {
  expect(paths('cd $(mktemp -d); echo > a')).toEqual(['/tmp/a'])
  expect(paths('cd `mktemp -d`; echo > a')).toEqual(['/tmp/a'])
  expect(paths('cd $TMPDIR/x; echo > a')).toEqual(['/tmp/a'])
})

test('the cds of a subshell end with it', () => {
  expect(paths('(cd d; echo > a); echo > b')).toEqual(['/cwd/d/a', '/cwd/b'])
  expect(paths('(cd d; (cd e; echo > a); echo > b); echo > c')).toEqual(['/cwd/d/e/a', '/cwd/d/b', '/cwd/c'])
})

test('a substitution runs in the folder the cds left', () => {
  expect(paths('echo $(echo x > a)')).toEqual(['/cwd/a'])
  expect(paths('cd d; echo $(echo x > a) `echo y > b`')).toEqual(['/cwd/d/a', '/cwd/d/b'])
  expect(paths('cd d; diff <(tee a) b')).toEqual(['/cwd/d/a'])
})

test('what bash -c, sh -c and eval run is a command line of its own', () => {
  expect(paths('bash -c "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('sh -c "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('zsh -c "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('dash -c "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('ksh -c "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('bash -lc "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('eval echo x \\> a')).toEqual(['/cwd/a'])
  expect(paths("eval 'echo x' '> a'")).toEqual(['/cwd/a'])
  expect(paths('cd d; bash -c "echo x > a"')).toEqual(['/cwd/d/a'])
  expect(paths('sudo -u me bash -c "echo x > a"')).toEqual(['/cwd/a'])
  expect(paths('bash -c')).toEqual([])
})

test('what a shell reads on its input is a command line of its own', () => {
  expect(paths("bash <<< 'echo x > a'")).toEqual(['/cwd/a'])
  expect(paths('bash <<EOF\necho x > a\nEOF')).toEqual(['/cwd/a'])
  expect(paths('echo "echo x > a" | bash')).toEqual(['/cwd/a'])
  expect(paths('printf "echo x > a" | sh')).toEqual(['/cwd/a'])
  expect(paths('cat <<EOF | bash\necho x > a\nEOF')).toEqual(['/cwd/a'])
  expect(paths('echo "echo x > a" | bash -s')).toEqual(['/cwd/a'])
  expect(paths('echo "echo x > a" | bash -')).toEqual(['/cwd/a'])
})

test('a shell given a script file runs that file, not its input', () => {
  expect(paths('echo "echo x > a" | bash script.sh')).toEqual([])
  expect(paths('bash script.sh <<< "echo x > a"')).toEqual([])
  expect(paths('bash')).toEqual([])
  expect(paths('echo "echo x > a" | cat')).toEqual([])
})

test('a command with its own heredoc reads that, not what is piped', () => {
  expect(paths('echo "echo x > a" | bash <<EOF\necho y > b\nEOF')).toEqual(['/cwd/b'])
})

test('a script piped to an interpreter is read for the files it writes', () => {
  expect(paths('echo \'open("a.txt","w")\' | python3')).toEqual(['/cwd/a.txt'])
  expect(paths('python3 <<EOF\nopen("a.txt","w")\nEOF')).toEqual(['/cwd/a.txt'])
})
