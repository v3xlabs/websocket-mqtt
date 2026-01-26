import eslintJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.changeset/**',
      'eslint.config.mjs',
      '**/*.js',
    ],
  },
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='id']",
          message:
            'Use a descriptive identifier like user_id, blogpost_id, etc.',
        },
      ],
      'no-control-regex': 'off',
      semi: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': [
        'warn',
        { allow: ['warn', 'error', 'log', 'debug', 'info'] },
      ],
      'linebreak-style': ['error', 'unix'],
      'object-curly-spacing': ['error', 'always'],
      'no-multiple-empty-lines': ['warn', { max: 2 }],
      'prefer-destructuring': 'warn',
      'prefer-arrow-callback': 'warn',

      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];