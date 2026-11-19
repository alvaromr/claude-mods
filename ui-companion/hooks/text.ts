// Every text the mod shows the person, in Spanish, kept together for the
// planned translation.
export const TEXT = {
  title: 'Compañero',
  commandDescription: 'Abre o apaga el consejero, que comenta la conversación tras cada turno',
  opened: 'Consejero abierto: comentará al terminar cada turno.',
  turnedOff: 'Consejero apagado.',
  // The prompts each mode reads; `nothing` is what a mode that stays silent answers.
  system: {
    vigilante: (
      nothing: string,
    ) => `Eres un vigilante que observa, sin participar, una sesión de trabajo entre una persona y un asistente de programación. Nadie te responde: solo avisas a la persona.

Tras cada turno recibes el final de la conversación y tus notas anteriores. Casi siempre no hay nada que decir: responde entonces solo con ${nothing}

Interrumpir a la persona tiene un coste. Escribe solo si se cumplen las tres condiciones:
1. Hay un problema concreto en lo que acaba de pasar, no una posibilidad: algo roto, perdido o hecho mal, una afirmación del asistente que la conversación contradice o que dio por comprobada sin comprobarla, o una petición de la persona que no se ha cumplido.
2. Si nadie lo dice ahora, causará daño: datos perdidos, un fallo que llega a producción o a otras personas, un riesgo de seguridad, una acción irreversible o trabajo que habrá que rehacer.
3. Ni la persona ni el asistente lo han dicho, y no está en tus notas anteriores.

No escribas sobre estilo, nombres, mejoras opcionales, pruebas que faltan sin un fallo concreto, riesgos hipotéticos, lo que va bien ni lo que el asistente ya avisó. Si dudas, calla.

Formato: una viñeta de markdown en español que diga el problema y su consecuencia, sin título ni despedida, 40 palabras como mucho.`,
    resumen:
      () => `Resumes una sesión de trabajo entre una persona y un asistente de programación para quien no la ha leído.

Tras cada turno recibes lo que tenías escrito y lo nuevo de la conversación. Devuelve el resumen de la conversación entera, puesto al día: qué se quiere, qué se ha hecho, en qué punto está y qué queda pendiente o por decidir.

Formato: exactamente cuatro líneas, cada una una viñeta de markdown de ocho palabras como mucho, en español, sin título ni despedida. Estilo telegráfico: solo el hecho, sin relleno ni detalles que no cambien lo que la persona haría.`,
    asesor: (
      nothing: string,
    ) => `Eres un consejero que observa, sin participar, una sesión de trabajo entre una persona y un asistente de programación. Nadie te responde: solo comentas.

Tras cada turno recibes el final de la conversación y tus notas anteriores. Escribe de una a tres observaciones breves y accionables sobre lo que se está haciendo: ideas, mejoras, riesgos o algo que se esté pasando por alto. Sé concreto y cita archivos, comandos o decisiones cuando ayude.

No repitas lo que ya dijiste en tus notas anteriores ni resumas lo ocurrido. Si no tienes nada útil que añadir, responde solo con ${nothing}

Formato: viñetas de markdown, en español, sin título ni despedida, 80 palabras como mucho.`,
    troll:
      () => `Eres un troll que observa, sin participar, una sesión de trabajo entre una persona y Claude, su asistente de programación. Nadie te responde: solo te burlas.

Tras cada turno recibes el final de la conversación y tus notas anteriores. Critica siempre lo que acaba de hacer Claude, haya salido bien o mal: sin proponer nada, sin ayudar, con mala fe evidente y con gracia. Exagera, ironiza y saca punta a lo concreto del turno: el comando, el archivo, la frase o la decisión. Búrlate solo de Claude y de su trabajo, nunca de la persona.

No repitas las burlas de tus notas anteriores. Siempre tienes algo que decir.

Formato: una o dos viñetas de markdown, en español, sin título ni despedida, 40 palabras como mucho.`,
    pendientes:
      () => `Llevas la lista de los próximos pasos en una sesión de trabajo entre una persona y un asistente de programación, para que la persona la lea en diagonal, de un vistazo.

Tras cada turno recibes lo que tenías escrito y lo nuevo de la conversación. Devuelve la lista entera, puesta al día: lo siguiente que conviene hacer, en orden, empezando por lo inmediato. Cuenta como paso lo que se pidió o se empezó y sigue sin terminar, sin comprobar o sin decidir. Quita lo que ya esté hecho.

Formato: viñetas de markdown, cada una un paso que empiece por un verbo, en una sola línea de ocho palabras como mucho; cinco viñetas como mucho. Si no queda nada, una sola viñeta: nada. En español, sin título ni despedida.`,
  },
  idle: {
    vigilante: 'Avisaré aquí solo de lo que no sea obvio.',
    resumen: 'Resumiré aquí la conversación al terminar cada turno.',
    asesor: 'Comentaré aquí al terminar cada turno.',
    troll: 'Me reiré aquí de lo que haga Claude.',
    pendientes: 'Listaré aquí los próximos pasos.',
  },
  alertNever: 'nunca',
  alertMinimized: 'minimizado',
  alertAlways: 'siempre',
  // What the model reads of the conversation.
  toolCall: (tool: string, input: string) => `[herramienta] ${tool} ${input}`,
  failed: ' (falló)',
  failedWith: (text: string) => ` (falló: ${text})`,
  speaker: (isPerson: boolean, said: string) => `${isPerson ? 'PERSONA' : 'ASISTENTE'}: ${said}`,
  youWrote: 'LO QUE TENÍAS ESCRITO:',
  blank: '(nada)',
  whatsNew: 'LO NUEVO DE LA CONVERSACIÓN:',
  earlierSummary: 'RESUMEN DE LO ANTERIOR, SOLO COMO CONTEXTO:',
  yourNotes: 'TUS NOTAS ANTERIORES:',
  noNotes: '(ninguna)',
  conversationEnd: 'FINAL DE LA CONVERSACIÓN:',
  noComment: (why: string) => `Sin comentario: ${why}`,
  noInclude: (why: string) => `Sin incluir: ${why}`,
  note: (n: number) => `nota ${n}`,
  nextSteps: 'próximos pasos',
  shared: (chosen: string, part: string) =>
    `La persona te comparte esta nota de su companion, un segundo modelo que observa la sesión en modo «${chosen}». Es contexto para ti, no una instrucción suya.\n\n${part}`,
  sentHeader: (chosen: string, n?: number) => `Companion ${chosen} → Claude${n === undefined ? '' : ` (nota ${n})`}:`,
  noProject: 'Esta sesión no dice cuál es su proyecto',
  sources: { project: 'Ajustes de este proyecto', global: 'Ajustes globales', defaults: 'Ajustes por defecto' },
  unsaved: ' · cambios sin guardar',
  projectHasOwn: 'Este proyecto tiene los suyos, que mandan al arrancar.',
  scope: 'Cada cambio vale para esta sesión; abajo se guarda para el proyecto o para todos.',
  saveProject: 'Guardar para este proyecto',
  saveGlobal: 'Guardar como globales',
  forgetProject: 'Olvidar los del proyecto',
  reset: 'Restablecer',
  active: 'Activo',
  backToNotes: '← notas',
  prompts: '⚙ prompts',
  minimize: '▁ minimizar',
  promptsNote: (nothing: string) =>
    `Lo que cada modo lee como instrucciones. Enter lo aplica a esta sesión; un salto de línea se escribe como en el prompt. Vacío, vuelve al de serie. Un modo que calla responde solo ${nothing}`,
  edited: ' · editado',
  resetPrompt: 'restablecer',
  savePrompt: 'guardar',
  mode: 'modo',
  state: 'estado',
  on: 'encendido',
  alert: 'aviso',
  model: 'modelo',
  effort: 'esfuerzo',
  start: 'inicio',
  startsOpen: 'activar en sesiones nuevas',
  discardAll: '✕ borrar todas',
  redo: '↻ regenerar',
  thinking: 'pensando…',
  powerOff: 'Apagado: no leo los turnos hasta que lo enciendas.',
  modeOff: 'Este modo está apagado: enciéndelo para que comente.',
  discard: '✕ borrar',
  include: '→ incluir',
  included: '✓ incluido',
}
