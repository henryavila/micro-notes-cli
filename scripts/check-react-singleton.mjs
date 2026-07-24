#!/usr/bin/env node
/**
 * postinstall guard: fail fast if blink resolves a different React than the app.
 * Mirrors tests/react-singleton.test.ts so a broken file: install never ships silently.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRequire = createRequire(join(root, 'package.json'));
const blinkRoot = join(root, 'node_modules', '@henryavila', 'blink-tui');
const blinkEntry = join(blinkRoot, 'dist', 'index.js');

function fail(msg) {
  console.error(`\n[micro-notes-cli] dual React / Ink detected:\n  ${msg}`);
  console.error(`
  Fix: ensure .npmrc has install-links=true, then:
    rm -rf node_modules/@henryavila/blink-tui
    npm install

  A symlink into ../blink-tui keeps that package's node_modules/react, so Ink
  and ThemeProvider load two Reacts → invalid hook call on \`mn\` / \`mn ui\`.
`);
  process.exit(1);
}

if (!existsSync(blinkEntry)) {
  // partial install / package not present yet
  process.exit(0);
}

const realBlink = realpathSync(blinkRoot);
const nested = join(realBlink, 'node_modules', 'react', 'package.json');
if (existsSync(nested)) {
  fail(`nested react at ${nested}`);
}

const appReact = realpathSync(appRequire.resolve('react'));
const blinkReact = realpathSync(createRequire(blinkEntry).resolve('react'));
if (appReact !== blinkReact) {
  fail(`app react:   ${appReact}\n  blink react: ${blinkReact}`);
}
