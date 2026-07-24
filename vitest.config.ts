import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Do NOT alias/dedupe react here. Dual React under file:../blink-tui is a
  // real install bug (see .npmrc install-links + tests/react-singleton.test.ts).
  // Masking it in the test runner would let `mn` keep crashing while CI is green.
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    // TUI tests set process.env.MN_FILE; parallel files race the env.
    fileParallelism: false,
    poolOptions: {
      threads: { singleThread: true },
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});
