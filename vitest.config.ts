import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    exclude: ['node_modules', '.cache'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
    },
  },
});
