/**
 * Regression: dual React under `file:../blink-tui`.
 *
 * When @henryavila/blink-tui is a symlink into a package that has its own
 * node_modules/react, ThemeProvider's useState and Ink's reconciler load
 * different React copies → "Invalid hook call" / "Cannot read properties of
 * null (reading 'useState')".
 *
 * Contract: React (and Ink) resolved from the blink package entry must be the
 * exact same module as the app's dependency. Enforced by install-links in
 * .npmrc (copy file: deps without nested node_modules).
 *
 * Uses Node createRequire from the blink dist entry — not the test bundler —
 * so the result matches what `node tui/bin/mn-ui.mjs` / `mn` load at runtime.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { realpathSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as AppReact from 'react';
import { describe, expect, it } from 'vitest';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const appRequire = createRequire(join(root, 'package.json'));

function blinkInstallRoot(): string {
  return realpathSync(join(root, 'node_modules', '@henryavila', 'blink-tui'));
}

function blinkEntry(): string {
  return join(blinkInstallRoot(), 'dist', 'index.js');
}

function resolveFrom(parentFile: string, specifier: string): string {
  return createRequire(parentFile).resolve(specifier);
}

describe('single React / Ink for blink + app', () => {
  it('blink install tree has no nested react (install-links, not symlink)', () => {
    const nestedReact = join(blinkInstallRoot(), 'node_modules', 'react', 'package.json');

    expect(
      existsSync(nestedReact),
      `nested react under blink install at ${nestedReact} — re-run npm install (install-links) or remove the symlink`,
    ).toBe(false);
  });

  it('react resolved from blink entry === app react (realpath)', () => {
    const appReact = realpathSync(appRequire.resolve('react'));
    const blinkReact = realpathSync(resolveFrom(blinkEntry(), 'react'));

    expect(blinkReact, `app: ${appReact}\nblink: ${blinkReact}`).toBe(appReact);
  });

  it('ink resolved from blink entry === app ink (realpath)', () => {
    const appInk = realpathSync(appRequire.resolve('ink'));
    const blinkInk = realpathSync(resolveFrom(blinkEntry(), 'ink'));

    expect(blinkInk, `app: ${appInk}\nblink: ${blinkInk}`).toBe(appInk);
  });

  it('react/jsx-runtime is also a single copy', () => {
    const appJsx = realpathSync(appRequire.resolve('react/jsx-runtime'));
    const blinkJsx = realpathSync(resolveFrom(blinkEntry(), 'react/jsx-runtime'));

    expect(blinkJsx).toBe(appJsx);
  });

  it('useState identity matches (two Reacts ⇒ two useState functions)', async () => {
    const blinkReactPath = resolveFrom(blinkEntry(), 'react');
    const BlinkReact = await import(pathToFileURL(blinkReactPath).href);
    // Same physical module ⇒ same function identity. Dual copy breaks hooks.
    expect(BlinkReact.useState).toBe(AppReact.useState);
  });
});
