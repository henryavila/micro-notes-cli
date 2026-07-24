#!/usr/bin/env node
/**
 * status-catalog.mjs — shell-facing catalog bridge for bin/mn.
 *
 * Usage:
 *   node scripts/status-catalog.mjs ids          → idle|designing|...
 *   node scripts/status-catalog.mjs list         → one id per line
 *   node scripts/status-catalog.mjs glyph ID
 *   node scripts/status-catalog.mjs label ID
 *   node scripts/status-catalog.mjs intent ID    → ignore|act
 *   node scripts/status-catalog.mjs badge ID
 *   node scripts/status-catalog.mjs requires-wait ID → 0|1
 *   node scripts/status-catalog.mjs valid ID     → 0|1
 *   node scripts/status-catalog.mjs canon ID     → canonical id
 *   node scripts/status-catalog.mjs source
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const catalogTs = join(root, 'tui/src/status-catalog.ts');
const catalogJs = join(root, 'tui/dist/status-catalog.js');

async function loadCatalogModule() {
  // Prefer compiled dist; else tsx-register via dynamic import of .ts through tsx
  if (existsSync(catalogJs)) {
    return import(pathToFileURL(catalogJs).href);
  }
  // Dev: run ourselves under tsx if needed
  const tsx = join(root, 'node_modules/tsx/dist/cli.mjs');
  if (existsSync(tsx) && existsSync(catalogTs)) {
    // Import via tsx loader
    const { register } = await import('node:module');
    try {
      // Node 20.6+ --import tsx equivalent via spawn is more reliable
    } catch {
      /* fall through */
    }
  }
  // Inline minimal JSON loader (no TS) so bash never depends on tsx for ids
  const { readFileSync } = await import('node:fs');
  const { homedir } = await import('node:os');

  const builtinPath = join(root, 'schemas/statuses.default.json');
  let pack = JSON.parse(readFileSync(builtinPath, 'utf8'));

  const configDir = process.env.MN_CONFIG_DIR || join(homedir(), '.config/mn');
  const override =
    process.env.MN_STATUSES?.trim() ||
    join(configDir, 'statuses.json');
  if (override && existsSync(override)) {
    try {
      const over = JSON.parse(readFileSync(override, 'utf8'));
      pack = {
        ...pack,
        ...over,
        order: over.order ?? pack.order,
        aliases: { ...(pack.aliases || {}), ...(over.aliases || {}) },
        statuses: { ...(pack.statuses || {}), ...(over.statuses || {}) },
      };
    } catch {
      /* keep base */
    }
  }

  const aliases = pack.aliases || {};
  const canon = (id) => {
    let cur = id;
    const seen = new Set();
    while (aliases[cur] && !seen.has(cur)) {
      seen.add(cur);
      cur = aliases[cur];
    }
    return cur;
  };
  const order = (pack.order || Object.keys(pack.statuses || {})).map(canon);
  const uniq = [...new Set(order)];
  const statuses = pack.statuses || {};

  return {
    statusIds: () => uniq,
    statusIdsPipe: () => uniq.join('|'),
    canonicalizeStatus: canon,
    isValidStatus: (id) => Boolean(statuses[canon(id)]) || Boolean(aliases[id]),
    resolveStatus: (id) => {
      const c = canon(id);
      const s = statuses[c] || {};
      return {
        id: c,
        intent: s.intent === 'act' ? 'act' : 'ignore',
        glyph: s.glyph || '?',
        label: s.label || c,
        badge: s.badge,
        requiresWait: s.requiresWait === true || c === 'blocked',
      };
    },
    statusRequiresWait: (id) => {
      const c = canon(id);
      const s = statuses[c] || {};
      return s.requiresWait === true || c === 'blocked';
    },
    statusGlyph: (id) => {
      const c = canon(id);
      return (statuses[c] || {}).glyph || '?';
    },
    getCatalog: () => ({ source: existsSync(override) ? override : builtinPath, pack: pack.pack }),
  };
}

const mod = await loadCatalogModule();
const [cmd, arg = ''] = process.argv.slice(2);

switch (cmd) {
  case 'ids':
    process.stdout.write(mod.statusIdsPipe() + '\n');
    break;
  case 'list':
    for (const id of mod.statusIds()) process.stdout.write(id + '\n');
    break;
  case 'glyph':
    process.stdout.write(mod.resolveStatus(arg).glyph + '\n');
    break;
  case 'label':
    process.stdout.write(mod.resolveStatus(arg).label + '\n');
    break;
  case 'intent':
    process.stdout.write(mod.resolveStatus(arg).intent + '\n');
    break;
  case 'badge':
    process.stdout.write((mod.resolveStatus(arg).badge || '') + '\n');
    break;
  case 'requires-wait':
    process.stdout.write((mod.statusRequiresWait(arg) ? '1' : '0') + '\n');
    break;
  case 'valid':
    process.stdout.write((mod.isValidStatus(arg) ? '1' : '0') + '\n');
    break;
  case 'canon':
    process.stdout.write(mod.canonicalizeStatus(arg) + '\n');
    break;
  case 'source':
    process.stdout.write((mod.getCatalog?.().source || '') + '\n');
    break;
  default:
    process.stderr.write(
      'usage: status-catalog.mjs ids|list|glyph|label|intent|badge|requires-wait|valid|canon|source [id]\n',
    );
    process.exit(2);
}
