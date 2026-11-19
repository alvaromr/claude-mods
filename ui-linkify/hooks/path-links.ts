// What must stay as written comes first (a code fence, a markdown link, a URL),
// then a code span, which is linked when it holds a path and nothing else, then
// where a bare path starts: `~/` or `/` opening a word.
const KEPT_OR_PATH =
  /```[\s\S]*?```|\[[^\]\n]*\]\([^)\n]*\)|\b[a-z][a-z0-9+.-]*:\/\/\S+|`([^`\n]+)`|(?<![^\s([{«“‘"'¿¡*_<=])~?\/(?=[^\s/])/g

// Where a bare path may end: before a space or punctuation, as in «en ~/a b/guion.md. Para».
const END = /[\s.,;:!?…—|)\]}»”’"'*_>`]/
// The ends that also begin or join a name, as in `.env`, `_x` or `proj.bak`: they end a path
// only before a space or another end, so «~/a/.env» does not link «~/a/».
const JOINS = /[.,*_]/
// The longest a bare path is looked for, so a long line costs a bounded number of checks.
const LONGEST = 300
// A line, and a column, after a path in a code span: `~/a/b.ts:12:3`.
const LINE = /:\d+(?::\d+)?$/

/** Whether a path exists, as the file system says it. */
export type Exists = (path: string) => Promise<boolean>

// A `~/` path with no home to resolve it: `~/x` would become `/x`, another file.
const isHomeless = (home: string, path: string) => home === '' && path.startsWith('~/')

const absolute = (home: string, path: string) => (path.startsWith('~/') ? home + path.slice(1) : path)

/** A path as a link opens it: images.tsx links each pasted image's original too. */
export const fileUrl = (path: string) =>
  'file://' +
  path
    .split('/')
    .map(part => encodeURIComponent(part).replace(/\(/g, '%28').replace(/\)/g, '%29'))
    .join('/')

const link = (home: string, label: string, path: string) =>
  `[${label.replace(/[[\]]/g, '\\$&')}](${fileUrl(absolute(home, path))})`

// The path a code span holds, line and column aside, when it exists.
const codedPath = async (exists: Exists, home: string, code: string) => {
  const path = code.replace(LINE, '')

  return /^~?\//.test(path) && !isHomeless(home, path) && (await exists(absolute(home, path))) ? path : undefined
}

// The longest stretch from where a bare path starts to the end of its line that
// exists: a name may hold spaces, so only the file system says where it ends.
const barePath = async (exists: Exists, home: string, rest: string) => {
  const [line = ''] = rest.slice(0, LONGEST).split('\n')

  if (isHomeless(home, line)) {
    return undefined
  }

  // Whether a path may end before `line[end]` without cutting a name in two.
  const isBoundary = (end: number) => {
    const [next, after] = [line.charAt(end), line.charAt(end + 1)]

    return end === line.length || (END.test(next) && (!JOINS.test(next) || after === '' || END.test(after)))
  }

  for (let end = line.length; end > 1; end--) {
    const isEnd = isBoundary(end)

    if (isEnd && !/\s/.test(line.charAt(end - 1)) && (await exists(absolute(home, line.slice(0, end))))) {
      return line.slice(0, end)
    }
  }

  return undefined
}

/** The markdown with each path that exists, bare or in a code span, as a link that opens it. */
export const linkPaths = async (exists: Exists, home: string, markdown: string) => {
  let drawn = ''
  let at = 0

  for (const found of markdown.matchAll(KEPT_OR_PATH)) {
    if (found.index < at) {
      continue
    }

    const [text, code] = found
    const isStart = text === '/' || text === '~/'

    if (code !== undefined) {
      const path = await codedPath(exists, home, code)

      drawn += markdown.slice(at, found.index) + (path === undefined ? text : link(home, text, path))
      at = found.index + text.length
    } else if (isStart) {
      const path = await barePath(exists, home, markdown.slice(found.index))

      if (path !== undefined) {
        drawn += markdown.slice(at, found.index) + link(home, path, path)
        at = found.index + path.length
      }
    } else {
      drawn += markdown.slice(at, found.index) + text
      at = found.index + text.length
    }
  }

  return drawn + markdown.slice(at)
}
