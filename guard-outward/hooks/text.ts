// Every text the mod shows the person, in Spanish, kept together for the
// planned translation. The reason is the permission dialog's, and the model's
// error where nobody can be asked.
export const TEXT = {
  reason: (what: string) => `${what} sale fuera de esta sesión: solo una persona puede aprobarlo.`,
  failed: 'Su comprobación ha fallado, así que lo aprueba una persona.',
}
