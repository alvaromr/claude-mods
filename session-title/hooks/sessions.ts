/** What a live session's metadata file holds of its name, as far as the mod reads. */
export type Meta = { sessionId?: unknown; nameSource?: unknown; name?: unknown }

/** The folder where Claude Code keeps the metadata of each live session. */
export const folderOf = (home: string | undefined) => `${home}/.claude/sessions`

/** The entries of the sessions' folder that are metadata files. */
export const metadataFiles = <T extends { name: string }>(entries: readonly T[]) =>
  entries.filter(entry => entry.name.endsWith('.json'))

/** A metadata file's content; none for what is not JSON, as another live session may be halfway through writing its own. */
export const metaOf = (text: string) => {
  try {
    return JSON.parse(text) as Meta | null
  } catch {
    return null
  }
}

/** Whether a session's metadata says its name is still the one it was born with, or the one this mod gave (`mine`). */
export const isNameOurs = (meta: Meta, mine: unknown) => meta.nameSource === 'derived' || meta.name === mine

/** Without metadata: whether the name the session has is the one it was born with, none, or the one this mod gave. */
export const isNameOursUnlisted = (current: string, mine: string | null) => current === '' || current === mine
