import type { EngineInterface, On } from 'claude-code'

import { linkPaths } from './path-links'
import { orElse, shown } from './settings'

// Whether each path exists, asked once per session: a message is drawn again as
// it streams. A path not there is asked again after a while: Claude often names
// a file before it writes it.
const known = new Map<string, Promise<boolean>>()
const MISSING_MS = 5000

const exists = ($: EngineInterface, path: string) => {
  const cached = known.get(path)

  if (cached !== undefined) {
    return cached
  }

  const asked = $.fs.exists(path).catch(orElse($, `looking for ${path}`, false))
  known.set(path, asked)
  void asked.then(found => {
    if (!found) {
      $.clock.after(MISSING_MS, () => void known.delete(path))
    }
  })

  return asked
}

// The paths of an assistant message as links that open them.
export const registerPaths = (on: On) => {
  // A file link opens on the machine that draws it: not on the phone.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'mobile' || !(await shown($)).paths) {
      return next(e)
    }

    // Without a home, a `~/` path is not linked: see isHomeless in path-links.ts.
    const home = (await $.env.get('HOME')) ?? ''

    return next({ ...e, props: { ...e.props, text: await linkPaths(path => exists($, path), home, e.props.text) } })
  })
}
