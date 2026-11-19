// A setting that signs, as `-c` and `git config` hand it over: a boolean that
// is true (set with no value it is too), or a format or key given a value.
export const SIGNING_SETTING =
  /^(?:(?:commit|tag|push)\.gpgsign(?:=(?:true|yes|on|[1-9]\d*))?|(?:gpg\.format|user\.signingkey)=.+)$/i
const SIGNING_KEY = /^(?:commit|tag|push)\.gpgsign$/i
const TRUE = /^(?:true|yes|on|[1-9]\d*)$/i
const SETTING_KEY = /^(?:gpg\.format|user\.signingkey)$/i

// git takes any unique prefix of a long option: `--gpg`, `--gpg-s`.
const isLong = (word: string, name: string, min: number) => {
  const [flag = ''] = word.split('=')

  return flag.length >= min && name.startsWith(flag)
}

export const signsCommit = (word: string) => /^-[a-zA-Z]*S\S*$/.test(word) || isLong(word, '--gpg-sign', 3)
// -s or -u in a cluster, behind flags that take no value: -sm, -as, not -ms.
export const signsTag = (word: string) =>
  /^-[adefilnvE]*[su]\S*$/.test(word) || isLong(word, '--sign', 4) || isLong(word, '--local-user', 4)

// `git config` setting a signing key or turning signing on.
export const configSigns = (args: readonly string[]) =>
  args.some((arg, at) => {
    const value = args[at + 1]

    return (
      (SIGNING_KEY.test(arg) && value !== undefined && TRUE.test(value)) ||
      (SETTING_KEY.test(arg) && value !== undefined && !value.startsWith('-'))
    )
  })

// git's environment settings: GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=true.
export const envSigns = (env: ReadonlyMap<string, string>) =>
  [...env].some(([name, key]) => {
    const n = /^GIT_CONFIG_KEY_(\d+)$/.exec(name)?.[1]

    return n !== undefined && SIGNING_SETTING.test(`${key}=${env.get(`GIT_CONFIG_VALUE_${n}`) ?? ''}`)
  })
