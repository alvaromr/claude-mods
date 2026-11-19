// Every text the mod shows the person, in Spanish, kept together for the
// planned translation.
export const TEXT = {
  title: 'Mods',
  commandFailed: (command: string | undefined, code: number) => `claude plugin ${command} terminó con ${code}`,
  noDescription: 'Sin descripción.',
  noAuthor: 'sin autor',
  // A plugin installed in more than one scope is told apart by it.
  scopes: { user: 'usuario', project: 'proyecto', local: 'local' } as Record<string, string>,
  inScope: (name: string, scope: string) => `${name} (${scope})`,
  doesReload: 'recargar los mods',
  doesRestart: 'reiniciar Claude Code',
  pressEnter: (does: string) => `Pulsa Enter para ${does}`,
  typeCommand: (command: string, does: string) => `Escribe /${command} para ${does}`,
  couldNot: (does: string, reason: string) => `No se pudo ${does}: ${reason}`,
  commandDescription: 'Abre o cierra el panel para activar o desactivar los mods instalados',
  paneOpened: 'Panel de mods abierto.',
  paneClosed: 'Panel de mods cerrado.',
  active: (listed: number) => ` de ${listed} activos`,
  unapplied: (n: number) => ` · ${n} sin aplicar`,
  restart: 'Reiniciar',
  reload: '↻ Recargar',
  searching: 'Buscando mods…',
  noList: 'La lista se ve en la terminal y en la app de escritorio.',
  builtinAuthor: 'Claude Code',
  // What each mod built into Claude Code does, as its docs say it.
  builtins: {
    'cc-plugin-agents-md': 'Carga AGENTS.md como instrucciones del proyecto.',
    'cc-plugin-diff': 'Se encarga de /diff y dibuja su panel; apagado, /diff sigue con la versión de serie.',
    'cc-plugin-plugin-authoring': 'Da a Claude la skill plugin-authoring para escribir mods.',
    'cc-plugin-sec-default':
      'Protege lo que gestiona tu organización de los mods que instalas. No se puede apagar: lo ordena un administrador.',
    'cc-plugin-telemetry': 'Envía los registros de analítica de Claude Code y de sus mods integrados.',
    'cc-plugin-you-should-know': 'Un agente aparte avisa encima del prompt de lo que quizá se te haya pasado.',
  },
}
