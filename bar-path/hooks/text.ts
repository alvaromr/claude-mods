// Every text the mod shows the person, in Spanish, kept together for the
// planned translation.
export const TEXT = {
  title: 'Ruta',
  parts: 'Partes',
  showParents: 'Carpetas superiores',
  showTilde: 'Carpeta personal como ~',
  colors: 'Colores',
  colorsNote: '#rrggbb, un nombre (red) o una clave del tema (warning).',
  parentColor: 'Carpetas superiores',
  nameColor: 'Carpeta del proyecto',
  notAColor: 'No es un color: usa #rrggbb, red o warning',
  sources: { project: 'Ajustes de este proyecto', global: 'Ajustes globales', defaults: 'Ajustes por defecto' },
  unsaved: ' · cambios sin guardar',
  projectHasOwn: 'Este proyecto tiene los suyos, que mandan al arrancar.',
  scope:
    'Cada cambio vale para esta sesión; abajo se guarda para el proyecto o para todos. La ruta solo se ve en la terminal.',
  noProject: 'Esta sesión no dice cuál es su proyecto',
  cannotSave: (reason: string) => `No se pudieron guardar los ajustes: ${reason}`,
  cannotForget: (reason: string) => `No se pudieron olvidar los ajustes del proyecto: ${reason}`,
  saveProject: 'Guardar para este proyecto',
  saveGlobal: 'Guardar como globales',
  forgetProject: 'Olvidar los del proyecto',
  reset: 'Restablecer',
}
