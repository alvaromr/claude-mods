/** A session's title as this mod writes one, `comparar-facturas-luz`. */
export type Title = string

declare module 'claude-code' {
  interface PluginState {
    // prompts: the person's own first prompts, the ones a title is made from.
    // given: the title this mod last gave the session; null while it gave none.
    // isTitled: this conversation has its title; a /clear starts another one.
    'session-title': { prompts: readonly string[]; given: Title | null; isTitled: boolean }
  }
}
