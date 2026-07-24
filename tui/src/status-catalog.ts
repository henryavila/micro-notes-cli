/**
 * Status catalog — product default + optional user override.
 *
 * Resolution order:
 *   1. $MN_STATUSES (file path)
 *   2. statuses= in ~/.config/mn/config
 *   3. ~/.config/mn/statuses.json
 *   4. schemas/statuses.default.json (shipped with the repo)
 *
 * Override deep-merges `statuses` by id and may replace `order` / `aliases`.
 * Every effective status must resolve to intent `ignore` | `act`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Attention = 'ignore' | 'act';

export interface StatusDef {
  id: string;
  intent: Attention;
  glyph: string;
  label: string;
  badge?: string;
  /** When true, ## Wait is required (blocked). */
  requiresWait?: boolean;
}

export interface StatusPackFile {
  version?: number;
  pack?: string;
  order?: string[];
  aliases?: Record<string, string>;
  statuses?: Record<
    string,
    {
      intent?: Attention;
      glyph?: string;
      label?: string;
      badge?: string;
      requiresWait?: boolean;
      mapsTo?: string;
    }
  >;
}

export interface ResolvedCatalog {
  pack: string;
  order: string[];
  statuses: Record<string, StatusDef>;
  aliases: Record<string, string>;
  source: string;
}

const BUILTIN: StatusPackFile = {
  version: 1,
  pack: 'ai-dev',
  order: [
    'idle',
    'designing',
    'await-design',
    'planning',
    'review-plan',
    'coding',
    'review-code',
    'blocked',
    'ready',
  ],
  aliases: { working: 'coding' },
  statuses: {
    idle: { intent: 'ignore', glyph: '○', label: 'idle' },
    designing: { intent: 'ignore', glyph: '◈', label: 'designing' },
    'await-design': {
      intent: 'act',
      glyph: '◇',
      label: 'await design',
      badge: 'approve design',
    },
    planning: { intent: 'ignore', glyph: '▤', label: 'planning' },
    'review-plan': {
      intent: 'act',
      glyph: '▣',
      label: 'review plan',
      badge: 'triage plan',
    },
    coding: { intent: 'ignore', glyph: '◉', label: 'coding' },
    'review-code': {
      intent: 'act',
      glyph: '◐',
      label: 'review code',
      badge: 'triage code',
    },
    blocked: {
      intent: 'act',
      glyph: '!',
      label: 'blocked',
      badge: 'needs you',
      requiresWait: true,
    },
    ready: { intent: 'act', glyph: '►', label: 'ready', badge: 'validate' },
  },
};

function repoDefaultPath(): string {
  // tui/src → repo root
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../../schemas/statuses.default.json');
}

function readConfigStatusesPath(
  configFile: string,
): string | undefined {
  if (!existsSync(configFile)) return undefined;
  const raw = readFileSync(configFile, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (key === 'statuses' || key === 'MN_STATUSES') return val;
  }
  return undefined;
}

function loadJsonFile(path: string): StatusPackFile | null {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as StatusPackFile;
  } catch {
    return null;
  }
}

function deepMergePack(base: StatusPackFile, over: StatusPackFile): StatusPackFile {
  const statuses = { ...(base.statuses ?? {}) };
  for (const [id, patch] of Object.entries(over.statuses ?? {})) {
    statuses[id] = { ...(statuses[id] ?? {}), ...patch };
  }
  return {
    version: over.version ?? base.version,
    pack: over.pack ?? base.pack,
    order: over.order ?? base.order,
    aliases: { ...(base.aliases ?? {}), ...(over.aliases ?? {}) },
    statuses,
  };
}

function resolvePack(pack: StatusPackFile, source: string): ResolvedCatalog {
  const aliases = { ...(pack.aliases ?? {}) };
  const rawStatuses = pack.statuses ?? {};
  const statuses: Record<string, StatusDef> = {};

  const resolveId = (id: string, seen = new Set<string>()): string => {
    if (seen.has(id)) return id;
    seen.add(id);
    if (aliases[id]) return resolveId(aliases[id], seen);
    const maps = rawStatuses[id]?.mapsTo;
    if (maps) return resolveId(maps, seen);
    return id;
  };

  const order = (pack.order ?? Object.keys(rawStatuses)).map((id) => resolveId(id));
  // unique order
  const seenOrder = new Set<string>();
  const uniqOrder: string[] = [];
  for (const id of order) {
    if (seenOrder.has(id)) continue;
    seenOrder.add(id);
    uniqOrder.push(id);
  }

  for (const id of uniqOrder) {
    const raw = rawStatuses[id] ?? {};
    const intent: Attention = raw.intent === 'act' ? 'act' : 'ignore';
    statuses[id] = {
      id,
      intent,
      glyph: raw.glyph || '?',
      label: raw.label || id,
      badge: raw.badge,
      requiresWait: raw.requiresWait === true || id === 'blocked',
    };
  }

  // Also register alias keys pointing at canonical defs (for lookup by old id)
  for (const [from, to] of Object.entries(aliases)) {
    const canon = resolveId(to);
    if (statuses[canon] && !statuses[from]) {
      // lookup-only: isValidStatus(from) true via alias map
    }
  }

  return {
    pack: pack.pack ?? 'default',
    order: uniqOrder,
    statuses,
    aliases,
    source,
  };
}

let cached: ResolvedCatalog | null = null;

/** Resolve catalog paths and merge. Pass env/cwd for tests. */
export function loadStatusCatalog(
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME || env.USERPROFILE || '',
): ResolvedCatalog {
  if (cached && !env.MN_STATUSES_TEST_BUST) return cached;

  const configDir = env.MN_CONFIG_DIR || join(home, '.config/mn');
  const configFile = env.MN_CONFIG_FILE || join(configDir, 'config');

  let base: StatusPackFile = BUILTIN;
  let source = 'builtin';

  const defaultPath = env.MN_STATUSES_DEFAULT || repoDefaultPath();
  if (existsSync(defaultPath)) {
    const file = loadJsonFile(defaultPath);
    if (file?.statuses) {
      base = deepMergePack(BUILTIN, file);
      source = defaultPath;
    }
  }

  const candidates: string[] = [];
  if (env.MN_STATUSES?.trim()) candidates.push(env.MN_STATUSES.trim());
  const fromConfig = readConfigStatusesPath(configFile);
  if (fromConfig) candidates.push(fromConfig);
  candidates.push(join(configDir, 'statuses.json'));

  let merged = base;
  let usedSource = source;
  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    const file = loadJsonFile(p);
    if (!file?.statuses && !file?.order) continue;
    merged = deepMergePack(merged, file);
    usedSource = p;
    break; // first existing override wins (env → config key → statuses.json)
  }

  cached = resolvePack(merged, usedSource);
  return cached;
}

/** Test helper: drop memoized catalog. */
export function resetStatusCatalogCache(): void {
  cached = null;
}

export function getCatalog(): ResolvedCatalog {
  return loadStatusCatalog();
}

/** Canonical id (follows aliases). Unknown ids returned as-is. */
export function canonicalizeStatus(id: string): string {
  const cat = getCatalog();
  const raw = (id || 'idle').trim() || 'idle';
  if (cat.aliases[raw]) {
    const t = cat.aliases[raw];
    return cat.statuses[t] ? t : t;
  }
  return raw;
}

export function isValidStatus(id: string): boolean {
  const cat = getCatalog();
  const c = canonicalizeStatus(id);
  return Boolean(cat.statuses[c]) || Boolean(cat.aliases[id]);
}

export function resolveStatus(id: string): StatusDef {
  const cat = getCatalog();
  const c = canonicalizeStatus(id);
  return (
    cat.statuses[c] ?? {
      id: c || 'idle',
      intent: 'ignore',
      glyph: '?',
      label: c || 'idle',
    }
  );
}

export function statusIds(): string[] {
  return [...getCatalog().order];
}

/** Pipe-joined ids for bash VALID_STATUSES-style checks. */
export function statusIdsPipe(): string {
  return statusIds().join('|');
}

export function statusRequiresWait(id: string): boolean {
  return resolveStatus(id).requiresWait === true;
}

/** blink ChoicePicker / list intent names */
export function statusToIntent(status: string): string {
  const st = resolveStatus(status);
  if (st.id === 'ready') return 'ok';
  if (st.requiresWait || st.id === 'blocked') return 'error';
  if (st.intent === 'act') return 'warn';
  if (st.id === 'coding' || st.id === 'designing' || st.id === 'planning') return 'drift';
  return 'pending';
}

export function statusGlyph(status: string): string {
  return resolveStatus(status).glyph;
}

export function statusTitle(status: string): string {
  const st = resolveStatus(status);
  return `${st.glyph} ${st.label}`;
}

export function statusBadge(status: string, openValidate = 0): string | null {
  const st = resolveStatus(status);
  if (st.id === 'ready' && openValidate > 0) return `${openValidate} to validate`;
  if (st.badge) return st.badge;
  return null;
}
