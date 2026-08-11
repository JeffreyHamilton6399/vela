import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript resolves identifiers itself; `no-undef` only adds noise.
      'no-undef': 'off',

      // Non-negotiables from the master prompt.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },

  // The chrome renderer draws UI and nothing else. If it can reach the
  // network, the "exactly two kinds of request" promise is already broken.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Vela makes no network requests from the chrome renderer.' },
        { name: 'XMLHttpRequest', message: 'Vela makes no network requests from the chrome renderer.' },
        { name: 'WebSocket', message: 'Vela makes no network requests from the chrome renderer.' },
      ],
    },
  },

  // The main process gets the security ruleset on top.
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
    },
  },

  // Build scripts and config files are plain Node ESM.
  {
    files: ['scripts/**/*.mjs', '*.config.ts', '*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // `expect(fake.close).toHaveBeenCalled()` is the intended idiom; the rule
      // cannot tell a vi.fn() reference from a real unbound method.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
