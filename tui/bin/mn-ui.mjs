#!/usr/bin/env node
/**
 * mn-ui — microNote TUI launcher (blink + ink).
 * Prefer built dist; fall back to tsx for dev.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const dist = join(here, '../dist/index.js');
const src = join(here, '../src/index.tsx');

if (existsSync(dist)) {
  await import(pathToFileURL(dist).href);
} else {
  const tsxCli = join(root, 'node_modules/tsx/dist/cli.mjs');
  const entry = existsSync(tsxCli) ? tsxCli : 'tsx';
  const r = spawnSync(
    process.execPath,
    existsSync(tsxCli) ? [tsxCli, src, ...process.argv.slice(2)] : ['--import', 'tsx', src, ...process.argv.slice(2)],
    { stdio: 'inherit', cwd: root, env: process.env },
  );
  process.exit(r.status ?? 1);
}
