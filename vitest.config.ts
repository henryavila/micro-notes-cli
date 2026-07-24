import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Do NOT alias/dedupe react here. Dual React (nested node_modules) is a real
  // install bug (see tests/react-singleton.test.ts). Masking it in the test
  // runner would let `mn` keep crashing while CI is green.
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
