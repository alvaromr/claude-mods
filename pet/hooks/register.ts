import type { EngineInterface, Register } from 'claude-code'

import { reasonOf } from './failure'
import { actionOf, answerTo, startFailure } from './launch'
import type { Action } from './launch'
import { TEXT } from './text'

// The pet is a native app of its own (the Swift in app/): it outlives the session
// that opened it and reads every session's state itself, so the mod only opens
// and closes it. The first run compiles it, hence the long timeout. A session
// starting only `start`s it, which leaves it closed when its person closed it
// (`quit`) and has not asked for it since (`open`).
const pet = ($: EngineInterface, action: Action) =>
  $.process.run(['/bin/sh', `${$.plugin.root}/app/launch.sh`, action], { timeoutMs: 180_000 })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // A command that cannot be registered says so, and does not keep the pet from opening.
    try {
      await $.command.register({
        name: 'pet',
        description: TEXT.description,
        argumentHint: TEXT.argumentHint,
      })
    } catch (error) {
      $.ui.log(TEXT.registerFailedLog(reasonOf(error)))
    }

    // Not awaited: the session does not wait for the pet to compile.
    if (e.isInteractive) {
      void pet($, 'start').then(
        ran => {
          const failure = startFailure(ran)

          if (failure !== undefined) {
            $.ui.log(failure)
          }
        },
        (error: unknown) => {
          $.ui.log(TEXT.openFailedLog(String(error)))
        },
      )
    }

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const action = actionOf(e.args)
    // A launch that cannot run at all says why, as one that fails does.
    const ran = await pet($, action).catch((error: unknown) => ({ exitCode: 1, stderr: reasonOf(error) }))

    return { text: answerTo(action, ran) }
  })
}
