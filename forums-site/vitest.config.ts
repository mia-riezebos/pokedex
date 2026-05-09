import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
