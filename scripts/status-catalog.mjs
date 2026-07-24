#!/usr/bin/env node
/**
 * status-catalog.mjs — shell-facing catalog bridge for bin/mn.
 * Fast pure-JSON path (schemas/packs + config pack= + statuses.json overlay).
 * Keeps resolution aligned with tui/src/status-catalog.ts.
 *
 * Usage:
 *   node scripts/status-catalog.mjs ids|list|glyph|label|intent|badge|requires-wait|valid|canon|source|pack|pack-id|packs [id]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
/** Directory that contains schemas/ when this script lives in scripts/. */
const scriptRoot = join(here, '..');

function readConfigValue(configFile, key) {
  if (!existsSync(configFile)) return undefined;
  for (const line of readFileSync(configFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    if (t.slice(0, eq).trim() === key) return t.slice(eq + 1).trim();
  }
  return undefined;
}

/** Prefer MN_ROOT / config root= / MN_SHARE_DIR, then script-adjacent root. */
function packSearchRoots(configFile) {
  const roots = [];
  const push = (p) => {
    if (p && !roots.includes(p)) roots.push(p);
  };
  push(process.env.MN_ROOT?.trim());
  push(readConfigValue(configFile, 'root'));
  push(readConfigValue(configFile, 'MN_ROOT'));
  push(process.env.MN_SHARE_DIR?.trim());
  push(scriptRoot);
  return roots;
}

function loadPackJson(id, configFile) {
  for (const root of packSearchRoots(configFile)) {
    const path = join(root, 'schemas/packs', `${id}.json`);
    if (existsSync(path)) {
      return { pack: JSON.parse(readFileSync(path, 'utf8')), path };
    }
  }
  return null;
}

function deepMerge(base, over) {
  return {
    ...base,
    ...over,
    pack: over.pack ?? base.pack,
    order: over.order ?? base.order,
    aliases: { ...(base.aliases || {}), ...(over.aliases || {}) },
    statuses: { ...(base.statuses || {}), ...(over.statuses || {}) },
  };
}

function loadCatalog() {
  const configDir = process.env.MN_CONFIG_DIR || join(homedir(), '.config/mn');
  const configFile = process.env.MN_CONFIG_FILE || join(configDir, 'config');
  // pack= in config is sticky: installer + `mn status pack` both write it.
  const packId =
    process.env.MN_PACK?.trim() ||
    readConfigValue(configFile, 'pack') ||
    readConfigValue(configFile, 'MN_PACK') ||
    'generic';

  let pack;
  let source;

  const pathOverride =
    process.env.MN_STATUSES?.trim() || readConfigValue(configFile, 'statuses');
  if (pathOverride && existsSync(pathOverride)) {
    pack = JSON.parse(readFileSync(pathOverride, 'utf8'));
    source = pathOverride;
  } else {
    const loaded = loadPackJson(packId, configFile) || loadPackJson('generic', configFile);
    if (!loaded) {
      pack = {
        pack: packId === 'ai-dev' ? 'ai-dev' : 'generic',
        order:
          packId === 'ai-dev'
            ? [
                'idle',
                'designing',
                'await-design',
                'planning',
                'review-plan',
                'coding',
                'review-code',
                'blocked',
                'ready',
              ]
            : ['idle', 'working', 'blocked', 'ready'],
        aliases: packId === 'ai-dev' ? { working: 'coding' } : {},
        statuses: {
          idle: { intent: 'ignore', glyph: '○', label: 'idle' },
          working: { intent: 'ignore', glyph: '◉', label: 'working' },
          coding: { intent: 'ignore', glyph: '◉', label: 'coding' },
          designing: { intent: 'ignore', glyph: '◈', label: 'designing' },
          'await-design': { intent: 'act', glyph: '◇', label: 'await design' },
          planning: { intent: 'ignore', glyph: '▤', label: 'planning' },
          'review-plan': { intent: 'act', glyph: '▣', label: 'review plan' },
          'review-code': { intent: 'act', glyph: '◐', label: 'review code' },
          blocked: {
            intent: 'act',
            glyph: '!',
            label: 'blocked',
            requiresWait: true,
            badge: 'needs you',
          },
          ready: { intent: 'act', glyph: '►', label: 'ready', badge: 'validate' },
        },
      };
      source = `builtin:${pack.pack}`;
    } else {
      pack = loaded.pack;
      source = loaded.path;
    }
  }

  const userFile = join(configDir, 'statuses.json');
  if (existsSync(userFile) && pathOverride !== userFile) {
    try {
      const over = JSON.parse(readFileSync(userFile, 'utf8'));
      pack = deepMerge(pack, over);
    } catch {
      /* keep */
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
    packId: pack.pack || packId,
    configuredPackId: packId,
    source,
    order: uniq,
    aliases,
    statuses,
    canon,
    resolve(id) {
      const c = canon(id);
      const s = statuses[c] || {};
      return {
        id: c,
        intent: s.intent === 'act' ? 'act' : 'ignore',
        glyph: s.glyph || '?',
        label: s.label || c,
        badge: s.badge || '',
        requiresWait: s.requiresWait === true || c === 'blocked',
      };
    },
    valid(id) {
      return Boolean(statuses[canon(id)]) || Boolean(aliases[id]);
    },
  };
}

const cat = loadCatalog();
const [cmd, arg = ''] = process.argv.slice(2);

switch (cmd) {
  case 'ids':
    process.stdout.write(cat.order.join('|') + '\n');
    break;
  case 'list':
    for (const id of cat.order) process.stdout.write(id + '\n');
    break;
  case 'glyph':
    process.stdout.write(cat.resolve(arg).glyph + '\n');
    break;
  case 'label':
    process.stdout.write(cat.resolve(arg).label + '\n');
    break;
  case 'intent':
    process.stdout.write(cat.resolve(arg).intent + '\n');
    break;
  case 'badge':
    process.stdout.write(cat.resolve(arg).badge + '\n');
    break;
  case 'requires-wait':
    process.stdout.write((cat.resolve(arg).requiresWait ? '1' : '0') + '\n');
    break;
  case 'valid':
    process.stdout.write((cat.valid(arg) ? '1' : '0') + '\n');
    break;
  case 'canon':
    process.stdout.write(cat.canon(arg) + '\n');
    break;
  case 'source':
    process.stdout.write(cat.source + '\n');
    break;
  case 'pack':
  case 'pack-id':
    process.stdout.write(cat.configuredPackId + '\n');
    break;
  case 'packs':
    process.stdout.write('generic\tGeneric\tidle / working / blocked / ready\n');
    process.stdout.write('ai-dev\tAI / multi-agent\tdesign → plan → code → review\n');
    break;
  default:
    process.stderr.write(
      'usage: status-catalog.mjs ids|list|glyph|label|intent|badge|requires-wait|valid|canon|source|pack|packs [id]\n',
    );
    process.exit(2);
}
