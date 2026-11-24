/** A session's title as this mod writes one, `Comparar facturas de luz`. */
export type Title = string

declare module 'claude-code' {
  interface PluginState {
    // prompts: the person's own prompts a title is made from, the first two and the last five.
    // counted: how many of their prompts the conversation has had, so far.
    // given: the title this mod last gave the session; null while it gave none.
    // isTitled: this conversation has its title; a /clear starts another one.
    'session-title': { prompts: readonly string[]; counted: number; given: Title | null; isTitled: boolean }
  }
}
