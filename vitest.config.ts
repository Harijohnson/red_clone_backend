import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 60000,
    // First run downloads the MongoDB binary (~700 MB); allow extra time for that
    hookTimeout: 600000,
    include: ['src/**/*.test.ts'],
    // Run each test file in its own worker so Mongoose model state doesn't bleed across files
    pool: 'forks',
  },
});
