import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores(['**/.claude-plugin/types/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  // Each mod's files are typed by the nearest tsconfig.json, its own.
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
  // A hook on a streaming event must be an async generator even when it only
  // returns its result, so a generator without yield is how the API is used.
  { rules: { 'require-yield': 'off' } },
  {
    rules: {
      // Checking a promise passed as an argument never ends on a call to `on`,
      // whose overloads span every engine event, so that one check is off.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
      // A number reads the same in any text it is put in.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // The scripts are plain JavaScript outside every mod's project.
  { files: ['**/*.mjs'], extends: [tseslint.configs.disableTypeChecked] },
)
