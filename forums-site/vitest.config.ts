import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: { '@': path.resolve(__dirname, '.') },
        },
        test: {
          name: 'unit',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: {
          alias: { '@': path.resolve(__dirname, '.') },
        },
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
        },
      },
    ],
  },
});
