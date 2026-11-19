import type { Mode, Setup, View } from '../types'
import { modesOn } from './modes'

/** Reading the turns: opened or minimized, and not switched off in the pane. */
export const isReading = (now: View, isOn: boolean) => now !== 'off' && isOn

/** Whether some mode comments: the advisor reads the turns and a mode is on. */
export const isCommenting = (now: View, isOn: boolean, setups: Record<Mode, Setup>) =>
  isReading(now, isOn) && modesOn(setups).length > 0

/**
 * The view a session starts in, none when it keeps the one it has. The
 * engine's record wins: a pane that stayed up while the state started over (a
 * reload, a new session) is the advisor on. Set to, an interactive new session
 * whose conversation is still empty (`isEmpty`, asked only then) starts it
 * minimized: commenting, the pane away.
 */
export const startView = async (
  { now, isUp, isInteractive, startsOpen }: { now: View; isUp: boolean; isInteractive: boolean; startsOpen: boolean },
  isEmpty: () => Promise<boolean>,
): Promise<View | undefined> => {
  const isOff = now === 'off'

  if (isUp && isOff) {
    return 'open'
  }

  return isOff && isInteractive && startsOpen && (await isEmpty()) ? 'minimized' : undefined
}
