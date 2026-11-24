import type { ClientModule } from 'claude-code'

/**
 * Draws nothing: the engine tells a surface module, and no hooks module, whether
 * the window has the focus, so it posts the answer each time the function runs
 * again, as the focus changes (resend.ts reads it).
 */
const WindowFocus: ClientModule = (_props, surface) => {
  surface.post({ isFocused: surface.isWindowFocused })

  return surface.elements.Box({})
}

export default WindowFocus
