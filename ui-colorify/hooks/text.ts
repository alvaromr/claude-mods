import type { AlertFrame, Kind, PromptFrame } from '../types'

// Every text the mod shows the person or the model, in Spanish, kept together
// for the planned translation.
export const TEXT = {
  title: 'Colores',
  sources: { project: 'Ajustes de este proyecto', global: 'Ajustes globales', defaults: 'Ajustes por defecto' },
  noProject: 'Esta sesión no dice cuál es su proyecto',
  unsaved: ' · cambios sin guardar',
  projectHasOwn: 'Este proyecto tiene los suyos, que mandan al arrancar.',
  scope: 'Cada cambio vale para esta sesión; abajo se guarda para el proyecto o para todos.',
  active: 'Activado',
  activeNote:
    'Encendido, colorea lo que eliges abajo y enseña a Claude cuándo usar cada alerta. Apagado, todo se ve como lo dibuja Claude Code y Claude deja de escribir alertas en las respuestas nuevas.',
  prompts: 'Tus mensajes',
  promptFrames: { normal: 'normal', box: 'caja', lines: 'líneas' } satisfies Record<PromptFrame, string>,
  dashed: 'Borde punteado',
  promptsNote:
    'Tus mensajes en la conversación, en una caja o entre una línea arriba y otra abajo, de este color. Normal: como los dibuja Claude Code.',
  headings: 'Títulos',
  headingsNote: 'Los títulos de las respuestas (de # a ######), en negrita y en este color.',
  draw: 'Colorear',
  color: 'Color',
  frame: 'Forma',
  frames: { box: 'caja', lines: 'líneas', title: 'solo título' } satisfies Record<AlertFrame, string>,
  titleField: 'Título',
  titleRefusal: 'Un título de hasta 30 caracteres',
  kindsNote:
    'Apagada, se ve como Claude Code dibuja una cita: gris, en cursiva y con la marca [!…] a la vista. Sin título, el marco lleva solo el texto.',
  labels: {
    NOTE: '[!NOTE]',
    TIP: '[!TIP]',
    IMPORTANT: '[!IMPORTANT]',
    WARNING: '[!WARNING]',
    CAUTION: '[!CAUTION]',
    QUOTE: '> cita sin marca',
  } satisfies Record<Kind, string>,
  copy: 'Copiar el texto',
  copied: 'Texto copiado',
  notCopied: (reason: string) => `No se ha copiado el texto: ${reason}`,
  colors: {
    suggestion: 'azul',
    success: 'verde',
    merged: 'morado',
    warning: 'amarillo',
    error: 'rojo',
    subtle: 'gris',
  } as Record<string, string>,
  // Muted tones quieter than the alerts', for the person's own prompts. The
  // theme's own quiet colours look alike, so all but one are fixed: the same
  // in a light theme as in a dark one.
  softColors: {
    '#7a8aa6': 'pizarra',
    '#6fa3a0': 'turquesa',
    '#8fa98a': 'salvia',
    '#b8a27a': 'arena',
    '#b07a6a': 'teja',
    '#a88aa8': 'malva',
    // The theme's own, which reads apart from the rest.
    permission: 'lavanda',
  } as Record<string, string>,
  // The markers' own words, translated as they are.
  titles: {
    NOTE: 'Nota',
    TIP: 'Consejo',
    IMPORTANT: 'Importante',
    WARNING: 'Advertencia',
    CAUTION: 'Precaución',
    QUOTE: '',
  } satisfies Record<Kind, string>,
  saveProject: 'Guardar para este proyecto',
  saveGlobal: 'Guardar como globales',
  forgetProject: 'Olvidar los del proyecto',
  reset: 'Restablecer',
  // The section of the system prompt; Spanish, as it makes the model write for the person.
  prompt: `# Alertas en las respuestas
La terminal de la persona colorea las alertas de GitHub, para que lo que no puede pasar por alto salte a la vista. Una alerta es una cita que empieza con la marca sola en su línea:

> [!IMPORTANT]
> Elige si el cambio va a producción hoy o el lunes; hasta entonces no lo despliego.

Úsalas poco: la mayoría de respuestas no llevan ninguna, y una respuesta lleva como mucho una. Si todo destaca, nada destaca.

- [!IMPORTANT]: una decisión o una acción que solo la persona puede tomar y sin la que no puedes seguir.
- [!CAUTION]: algo irreversible o que llega a otras personas (borrar, publicar, enviar, subir). Siempre antes de la orden, nunca después.
- [!WARNING]: un riesgo real que la persona tiene que conocer antes de actuar.
- [!TIP] y [!NOTE]: casi nunca. Un atajo o un dato de fondo van en el texto normal.

Nunca una alerta para matizar tu propio trabajo (lo que no comprobaste, una suposición, un detalle técnico): eso va en una frase del texto.`,
}
