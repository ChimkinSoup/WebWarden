import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/extension/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@extension': path.resolve(__dirname, 'extension/lib'),
    },
  },
});
