import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'docs']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Tests exercise untyped harnesses and mock shapes; allow `any` there.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Cytoscape's typings are loose (its `data()` returns untyped shapes);
  // GraphCanvas bridges them to our typed Node/Edge models. Allow `any`
  // in that single file until SP-3's renderer swap removes the bridge.
  {
    files: ['src/components/graph/GraphCanvas.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
