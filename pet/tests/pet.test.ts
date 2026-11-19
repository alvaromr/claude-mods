import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const RUN = {
  command: 'pet',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const
const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

// The engine beneath the mod, and the launcher (app/launch.sh) it runs: what
// the launcher was asked, and how it answers.
const world = (on: On) => {
  const it = {
    /** What followed `sh` in each run of the launcher. */
    runs: [] as string[],
    /** The time the launcher was given to run, in each run. */
    timeouts: [] as (number | undefined)[],
    /** The names the command was registered under. */
    registered: [] as string[],
    logged: [] as string[],
    ran: RAN,
    /** Why the launcher may not be run at all, when something refuses it. */
    refusal: null as string | null,
    /** Why the command may not be registered, when something refuses it. */
    registerRefusal: null as string | null,
  }

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => {
    it.registered.push(e.name)

    return it.registerRefusal === null ? { value: { command: e.name } } : { deny: it.registerRefusal }
  })
  on('ui.log', (_, e) => {
    it.logged.push(e.text)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    it.runs.push(e.argv.slice(1).join(' '))
    it.timeouts.push(e.init?.timeoutMs)

    return it.refusal === null ? { value: it.ran } : { deny: it.refusal }
  })

  return it
}

test('an interactive session starts the pet, a headless one does not', async ($, on) => {
  const it = world(on)

  await $.session.start({ ...START, surface: null, isInteractive: false })
  expect(it.runs).toEqual([])

  await $.session.start(START)
  expect(it.runs).toHaveLength(1)
  expect(it.runs[0]).toMatch(/\/app\/launch\.sh start$/)
  expect(it.logged).toEqual([])
})

test('the session registers /pet, and the launcher has time to compile the pet', async ($, on) => {
  const it = world(on)

  await $.session.start(START)
  await $.command.run({ ...RUN, args: '' })
  expect(it.registered).toEqual(['pet'])
  expect(it.timeouts).toEqual([180_000, 180_000])
})

test('a command that cannot be registered says so, and the pet still opens', async ($, on) => {
  const it = world(on)

  it.registerRefusal = 'no commands here'
  await $.session.start(START)
  expect(it.logged).toHaveLength(1)
  expect(it.logged[0]).toMatch(/^pet: no pudo registrarse \/pet: .*no commands here/)
  expect(it.runs).toHaveLength(1)
  expect(it.runs[0]).toMatch(/\/app\/launch\.sh start$/)
})

test('a pet that fails to open as the session starts is said in the transcript', async ($, on) => {
  const it = world(on)

  it.ran = { ...RAN, exitCode: 1, stderr: 'swiftc: command not found\n' }
  await $.session.start(START)
  expect(it.logged).toEqual(['pet: no pudo abrirse: swiftc: command not found'])

  it.refusal = 'no shell here'
  await $.session.start(START)
  expect(it.logged[1]).toContain('pet: no pudo abrirse: ')
  expect(it.logged[1]).toContain('no shell here')
})

test('/pet opens the pet and /pet salir closes it', async ($, on) => {
  const it = world(on)

  await $.session.start({ ...START, isInteractive: false })

  expect((await $.command.run({ ...RUN, args: '' })).text).toBe('Mascota en el escritorio.')
  expect((await $.command.run({ ...RUN, args: ' salir ' })).text).toBe('Mascota cerrada.')
  expect(it.runs.map(run => run.split(' ').at(-1))).toEqual(['open', 'quit'])
})

test('a pet that fails to open or to close says why', async ($, on) => {
  const it = world(on)

  it.ran = { ...RAN, exitCode: 1, stderr: 'swiftc: command not found\n' }
  await $.session.start({ ...START, isInteractive: false })

  expect((await $.command.run({ ...RUN, args: '' })).text).toBe('La mascota no pudo abrirse: swiftc: command not found')
  expect((await $.command.run({ ...RUN, args: 'salir' })).text).toBe(
    'La mascota no pudo cerrarse: swiftc: command not found',
  )

  // A launcher that may not run at all.
  it.refusal = 'no shell here'
  expect((await $.command.run({ ...RUN, args: '' })).text).toMatch(/^La mascota no pudo abrirse: .*no shell here/)
})
