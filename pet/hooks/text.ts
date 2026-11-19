// Every text the mod shows the person, in Spanish, kept together for the
// planned translation.
export const TEXT = {
  description: 'Muestra la mascota de escritorio; «/pet salir» la cierra hasta el próximo /pet',
  argumentHint: '[salir]',
  quit: 'salir',
  registerFailedLog: (reason: string) => `pet: no pudo registrarse /pet: ${reason}`,
  openFailedLog: (reason: string) => `pet: no pudo abrirse: ${reason}`,
  runFailed: (isQuit: boolean, reason: string) => `La mascota no pudo ${isQuit ? 'cerrarse' : 'abrirse'}: ${reason}`,
  closed: 'Mascota cerrada.',
  opened: 'Mascota en el escritorio.',
}
