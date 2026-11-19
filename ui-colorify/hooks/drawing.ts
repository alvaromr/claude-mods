import type { RenderSurface } from 'claude-code'

import type { Preferences } from '../types'
import type { Part } from './parts'

// The width a line is drawn at where the surface tells none.
const COLUMNS = 80
// What a reply's first block is drawn after: its bullet.
const BULLET = 2

type Heading = Extract<Part, { heading: number }>
type Alert = Extract<Part, { kind: unknown }>

/** Whether the model is taught the alerts: only where a terminal draws them. */
export const teachesAlerts = (surfaces: readonly RenderSurface[]) => surfaces.includes('terminal')

/** Whether a reply is for the mod to draw: a terminal's, other than a summary. */
export const isReplyDrawn = (surface: RenderSurface, isSummary: boolean | undefined) =>
  surface === 'terminal' && !isSummary

/** Whether a part is a heading the mod draws. */
export const drawsHeading = (part: Part, s: Preferences): part is Heading => 'heading' in part && s.headings.on

/** Whether a part is an alert or a quote the mod draws, its look on. */
export const drawsAlert = (part: Part, s: Preferences): part is Alert => 'kind' in part && s.looks[part.kind].on

/** Whether any part of a reply is one the mod draws; none, the reply is left as it is. */
export const drawsAny = (parts: readonly Part[], s: Preferences) =>
  s.on && parts.some(part => drawsAlert(part, s) || drawsHeading(part, s))

/** How far a reply's blocks are drawn in: a reply's first block is drawn after its bullet, and what follows lines up there. */
export const indentOf = (isFirstOfReply: boolean) => (isFirstOfReply ? BULLET : 0)

/** The width a row is drawn at, where the surface tells none, a default. */
export const columnsOf = (viewport: { columns: number } | undefined) => viewport?.columns ?? COLUMNS

/** Whether the person's own prompt is framed: by a mod that is on, in a terminal, and for what the person typed or a bridge sent. */
export const framesPrompt = (s: Preferences, surface: RenderSurface, origin: string) =>
  s.on && surface === 'terminal' && s.prompts.frame !== 'normal' && (origin === 'composer' || origin === 'bridge')

/** Whether the panes open include the mod's, `id`. */
export const isPaneOpen = (panes: readonly { id: string }[], id: string) => panes.some(pane => pane.id === id)
