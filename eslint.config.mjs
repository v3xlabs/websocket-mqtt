import v3xlint from 'eslint-plugin-v3xlabs';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.changeset/**',
      'eslint.config.mjs',
      '**/*.js',
    ],
  },
  ...v3xlint.configs['recommended'],
]);
