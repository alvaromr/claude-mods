import { expect, test } from 'claude-code/testing'

import { lex } from '../hooks/lex'
import { editedFiles, targetDirectory, writesOf, writtenBy } from '../hooks/written'

const words = (command: string) => lex(command).flatMap(segment => segment.words)
const by = (command: string, input: string[] = []) => writtenBy(words(command), input)
const paths = (command: string, input: string[] = []) => by(command, input).map(write => write.path)

test('tee writes the files it names', () => {
  expect(by('tee a b')).toEqual([
    { path: 'a', how: 'tee' },
    { path: 'b', how: 'tee' },
  ])
  expect(by('tee')).toEqual([])
})

test('sed -i writes the files, not the script', () => {
  expect(by('sed -i s/a/b/ f g')).toEqual([
    { path: 'f', how: 'sed -i' },
    { path: 'g', how: 'sed -i' },
  ])
  expect(paths('gsed -ni s/a/b/ f')).toEqual(['f'])
  expect(paths('sed --in-place s/a/b/ f')).toEqual(['f'])
  expect(paths("sed -i '' s/a/b/ f")).toEqual(['f'])
  expect(paths('sed -i -e s/a/b/ f')).toEqual(['f'])
  expect(paths('sed -i --expression s/a/b/ f')).toEqual(['f'])
  expect(paths('sed -i -f script.sed f')).toEqual(['f'])
  expect(paths('sed -i --file script.sed f')).toEqual(['f'])
})

test('sed without -i writes nothing', () => {
  expect(by('sed s/a/b/ f')).toEqual([])
  expect(by('sed -n s/a/b/ f')).toEqual([])
})

test('perl and ruby -i write the files, not the script', () => {
  expect(by('perl -pi -e s/a/b/ f')).toEqual([{ path: 'f', how: 'perl -i' }])
  expect(by('ruby -i -pe x f')).toEqual([{ path: 'f', how: 'ruby -i' }])
  expect(by('perl -e print')).toEqual([])
})

test('awk -i inplace writes the files, not the program', () => {
  expect(by('awk -i inplace {print} f')).toEqual([{ path: 'f', how: 'awk -i inplace' }])
  expect(paths('gawk -i inplace -f prog.awk f')).toEqual(['f'])
  expect(by('awk -i other {print} f')).toEqual([])
  expect(by('awk {print} f')).toEqual([])
})

test('the files an in-place editor rewrites are what follows its script', () => {
  const given = words('-n script f g')

  expect(editedFiles(given, () => false).map(word => word.text)).toEqual(['f', 'g'])
  expect(editedFiles(words('-e script f'), option => option === '-e').map(word => word.text)).toEqual(['f'])
  expect(editedFiles(words('-x f'), () => false)).toEqual([])
})

test('cp and mv write a file only by replacing one', () => {
  expect(by('cp a b')).toEqual([
    { path: 'b', how: 'cp', ifExists: true },
    { path: 'b/a', how: 'cp', ifExists: true },
  ])
  expect(paths('mv a b/')).toEqual(['b//a'])
  expect(paths('cp a b c')).toEqual(['c/a', 'c/b'])
  expect(paths('cp /x/a /y/b d')).toEqual(['d/a', 'd/b'])
  expect(by('mv a b')).toEqual([
    { path: 'b', how: 'mv', ifExists: true },
    { path: 'b/a', how: 'mv', ifExists: true },
  ])
  expect(by('cp a')).toEqual([])
  expect(by('cp')).toEqual([])
})

test('cp and mv -t name the folder the files go into', () => {
  expect(by('cp -t d a b')).toEqual([
    { path: 'd/a', how: 'cp', ifExists: true },
    { path: 'd/b', how: 'cp', ifExists: true },
  ])
  expect(paths('mv -rt d a')).toEqual(['d/a'])
  expect(paths('cp --target-directory d a')).toEqual(['d/a'])
  expect(paths('cp -td a')).toEqual(['d/a'])
  expect(paths('cp --target-directory=d a')).toEqual(['d/a'])
})

test('the folder cp -t names', () => {
  const [word] = words('d')

  expect(targetDirectory(words('-t d a')).word?.text).toBe('d')
  expect(targetDirectory(words('-t d a')).text).toBeUndefined()
  expect(targetDirectory(words('-td a')).text).toBe('d')
  expect(targetDirectory(words('--target-directory=d a')).text).toBe('d')
  expect(targetDirectory(words('a b'))).toEqual({ word: undefined, text: undefined })
  expect(word?.text).toBe('d')
})

test('patch and git apply write the files they patch', () => {
  expect(by('patch -p1')).toEqual([{ path: '.', how: 'patch' }])
  expect(by('git apply x.diff')).toEqual([{ path: '.', how: 'git apply' }])
  expect(by('git -C repo -c a=b --git-dir g --work-tree w --namespace n --super-prefix p apply x')).toEqual([
    { path: '.', how: 'git apply' },
  ])
})

test('a patch only checked or measured writes nothing', () => {
  for (const option of ['--check', '--stat', '--numstat', '--summary', '--dry-run']) {
    expect(by(`patch ${option}`)).toEqual([])
    expect(by(`git apply ${option}`)).toEqual([])
  }

  expect(by('git status')).toEqual([])
  expect(by('git commit apply')).toEqual([])
})

test('find -exec writes what its command writes on the files found', () => {
  expect(by('find src -exec tee {} \\;')).toEqual([{ path: 'src', how: 'tee' }])
  expect(paths('find src lib -execdir tee {} +')).toEqual(['src', 'lib'])
  expect(paths('find -ok tee {} +')).toEqual(['.'])
  expect(paths('find -okdir tee {} +')).toEqual(['.'])
  expect(paths('find -H src -L -exec tee {} +')).toEqual(['src'])
  expect(paths('find ! -name x -exec tee {} +')).toEqual(['.'])
  expect(paths('find ( -name x ) -exec tee {} +')).toEqual(['.'])
  expect(paths('find src -exec tee')).toEqual(['src'])
  expect(paths('find src -exec tee {} \\; -exec tee out +')).toEqual(['src', 'out', 'src'])
  expect(by('find src -name x')).toEqual([])
})

test('a script that writes a file writes the one it names', () => {
  expect(by('python3', ['open("a.txt", "w").write(1)'])).toEqual([{ path: 'a.txt', how: 'a python3 script' }])
  expect(paths('python', ['open(\'a.txt\', "a")'])).toEqual(['a.txt'])
  expect(paths('python', ['Path("o.txt").write_text("x")'])).toEqual(['o.txt'])
  expect(paths('node', ["fs.writeFileSync('o.json', x)"])).toEqual(['o.json'])
  expect(paths('bun', ['fs.appendFile(`p.log`, x)'])).toEqual(['p.log'])
  expect(paths('deno', ['fs.writeFile("q.txt", x)'])).toEqual(['q.txt'])
  expect(paths('ruby', ['File.write("r.rb", x)'])).toEqual(['r.rb'])
  expect(paths('perl', ['File.write("s.pl", x)'])).toEqual(['s.pl'])
})

test('a script that writes with no literal path is read for any path in it', () => {
  expect(paths('python3', ['shutil.copy(a, "dir/b")'])).toEqual(['dir/b'])
  expect(paths('python3', ['shutil.move(a, "/abs/b")'])).toEqual(['/abs/b'])
  expect(paths('node', ['fs.writeFileSync(name, "x.json")'])).toEqual(['x.json'])
  expect(paths('python3', ['p.write_text("x"); q = "~/h"; r = "./d/e"'])).toEqual(['~/h', './d/e'])
  expect(paths('python3', ['p.write_text("x"); q = "word"'])).toEqual([])
})

test('a script that writes no file writes none', () => {
  expect(by('python3', ['print("a.txt")'])).toEqual([])
  expect(by('ls', ['open("a.txt", "w")'])).toEqual([])
})

test('a script is also read from -c and -e', () => {
  expect(paths('python3 -c \'open("a.txt","w")\'')).toEqual(['a.txt'])
  expect(paths('node -e "fs.writeFileSync(\'b.txt\', 1)"')).toEqual(['b.txt'])
  expect(paths('node --eval "fs.writeFileSync(\'c.txt\', 1)"')).toEqual(['c.txt'])
  expect(paths('python3 other \'open("a.txt","w")\'')).toEqual([])
})

test('the files of a segment are its redirections and its command, resolved', () => {
  const written = (command: string, input: string[] = []) => {
    const [segment] = lex(command)

    return segment === undefined ? [] : writesOf(segment, input, '/cwd', '/home')
  }

  expect(written('echo x > out')).toEqual([{ path: '/cwd/out', how: 'a redirection' }])
  expect(written('tee ~/a')).toEqual([{ path: '/home/a', how: 'tee' }])
  expect(written('echo x > $X')).toEqual([])
  expect(written('cp a b')).toEqual([
    { path: '/cwd/b', how: 'cp', ifExists: true },
    { path: '/cwd/b/a', how: 'cp', ifExists: true },
  ])
  expect(written('tee a > b')).toEqual([
    { path: '/cwd/b', how: 'a redirection' },
    { path: '/cwd/a', how: 'tee' },
  ])
  expect(written('python3', ['open("a.txt","w")'])).toEqual([{ path: '/cwd/a.txt', how: 'a python3 script' }])
})
