// A `cd` target only the shell knows, but that is scratch all the same: a new
// `mktemp` folder or one under $TMPDIR. Any other unknown target may be the
// project, so it counts as where the session started, never as a way out.
export const SCRATCH_DIR = /^(?:\$\(\s*mktemp\b|`\s*mktemp\b|\$\{?TMPDIR\}?(?=\/|$))/
// Where writing is never an edit of a project, asked of no git.
export const SCRATCH = /^(?:\/dev\/|\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/private\/var\/folders\/)|\/\.git\//

// The path a word names, from where the command runs; undefined where only the
// shell knows it (a variable, a substitution). A glob stands for its folder.
export const resolve = (text: string, cwd: string, home: string): string | undefined => {
  const path = text
    .replace(/^~(?=\/|$)/, home)
    .replace(/^\$\{?HOME\}?(?=\/|$)/, home)
    .replace(/^\$\{?PWD\}?(?=\/|$)/, cwd)

  if (/[$`]/.test(path) || path === '') {
    return undefined
  }

  const glob = path.search(/[*?[]/)
  const fixed = glob < 0 ? path : path.slice(0, path.lastIndexOf('/', glob) + 1) || '.'
  const absolute = fixed.startsWith('/') ? fixed : `${cwd}/${fixed}`
  // `.` and `..` taken out, so /tmp/../repo is no scratch folder.
  const parts = absolute.split('/').reduce<string[]>((kept, part) => {
    if (part === '..') {
      kept.pop()
    } else if (part !== '.' && part !== '') {
      kept.push(part)
    }

    return kept
  }, [])

  return `/${parts.join('/')}`
}
