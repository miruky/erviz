import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.ERVIZ_BASE ?? '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
