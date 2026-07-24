/**
 * Status catalog — built-in packs + optional user override.
 *
 * Built-in packs:
 *   - generic (default) — idle · working · blocked · ready
 *   - ai-dev — design → plan → code → review stages
 *
 * Active pack: pack= in ~/.config/mn/config (or $MN_PACK).
 *
 * Resolution for the effective catalog:
 *   1. $MN_STATUSES file path → base pack from that file (full override path)
 *   2. statuses= in config → same
 *   3. Else built-in pack from pack= / $MN_PACK (default: generic)
 *   4. Then deep-merge ~/.config/mn/statuses.json if present (personal overlay)
 *
 * Every effective status must resolve to intent `ignore` | `act`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Attention = 'ignore' | 'act';

export type BuiltinPackId = 'generic' | 'ai-dev';

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
  label?: string;
  description?: string;
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

export interface PackMeta {
  id: string;
  label: string;
  description: string;
  builtin: boolean;
}

export interface ResolvedCatalog {
  pack: string;
  order: string[];
  statuses: Record<string, StatusDef>;
  aliases: Record<string, string>;
  /** Path or label of the base pack source. */
  source: string;
  /** Whether a user statuses.json (or path override) was merged / used. */
  userOverride: boolean;
  userOverridePath?: string;
}

const BUILTIN_GENERIC: StatusPackFile = {
  version: 1,
  pack: 'generic',
  label: 'Generic',
  description: 'Native re-entry statuses — idle / working / blocked / ready',
  order: ['idle', 'working', 'blocked', 'ready'],
  aliases: {},
  statuses: {
    idle: { intent: 'ignore', glyph: '○', label: 'idle' },
    working: { intent: 'ignore', glyph: '◉', label: 'working' },
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

const BUILTIN_AI_DEV: StatusPackFile = {
  version: 1,
  pack: 'ai-dev',
  label: 'AI / multi-agent',
  description: 'Design → plan → code → review stages for agent worktrees',
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

const BUILTIN_BY_ID: Record<string, StatusPackFile> = {
  generic: BUILTIN_GENERIC,
  'ai-dev': BUILTIN_AI_DEV,
};

export const DEFAULT_PACK_ID: BuiltinPackId = 'generic';

function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../..');
}

function packFilePath(id: string): string {
  return join(repoRoot(), 'schemas/packs', `${id}.json`);
}

function loadJsonFile(path: string): StatusPackFile | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StatusPackFile;
  } catch {
    return null;
  }
}

/** Load a built-in pack: disk file preferred, else in-memory BUILTIN. */
export function loadBuiltinPack(id: string): StatusPackFile {
  const path = packFilePath(id);
  if (existsSync(path)) {
    const file = loadJsonFile(path);
    if (file?.statuses) return { ...BUILTIN_BY_ID[id], ...file, pack: id };
  }
  return BUILTIN_BY_ID[id] ?? BUILTIN_GENERIC;
}

export function listBuiltinPacks(): PackMeta[] {
  return (['generic', 'ai-dev'] as const).map((id) => {
    const p = loadBuiltinPack(id);
    return {
      id,
      label: p.label || id,
      description: p.description || '',
      builtin: true,
    };
  });
}

function readConfigValue(configFile: string, key: string): string | undefined {
  if (!existsSync(configFile)) return undefined;
  const raw = readFileSync(configFile, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (k === key) return val;
  }
  return undefined;
}

/** Read or write a single key in ~/.config/mn/config (preserves other lines). */
export function writeConfigValue(
  key: string,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME || env.USERPROFILE || '',
): string {
  const configDir = env.MN_CONFIG_DIR || join(home, '.config/mn');
  const configFile = env.MN_CONFIG_FILE || join(configDir, 'config');
  mkdirSync(configDir, { recursive: true });
  const lines: string[] = [];
  let wrote = false;
  if (existsSync(configFile)) {
    for (const line of readFileSync(configFile, 'utf8').split('\n')) {
      if (line.trim().startsWith(`${key}=`) || line.trim().startsWith(`${key} =`)) {
        if (!wrote) {
          lines.push(`${key}=${value}`);
          wrote = true;
        }
        continue;
      }
      if (line.length || lines.length > 0) lines.push(line);
    }
  }
  if (!wrote) lines.push(`${key}=${value}`);
  // drop trailing empty duplicates
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  writeFileSync(configFile, lines.join('\n') + '\n', 'utf8');
  resetStatusCatalogCache();
  return configFile;
}

export function getConfiguredPackId(
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME || env.USERPROFILE || '',
): string {
  if (env.MN_PACK?.trim()) return env.MN_PACK.trim();
  const configDir = env.MN_CONFIG_DIR || join(home, '.config/mn');
  const configFile = env.MN_CONFIG_FILE || join(configDir, 'config');
  const fromConfig = readConfigValue(configFile, 'pack');
  if (fromConfig && (fromConfig in BUILTIN_BY_ID || existsSync(packFilePath(fromConfig)))) {
    return fromConfig;
  }
  return DEFAULT_PACK_ID;
}

/** Persist pack=generic|ai-dev (or other known id). */
export function setActivePack(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME || env.USERPROFILE || '',
): { ok: true; pack: string; configFile: string } | { ok: false; error: string } {
  const known = id in BUILTIN_BY_ID || existsSync(packFilePath(id));
  if (!known) {
    return {
      ok: false,
      error: `unknown pack: ${id} (built-in: ${Object.keys(BUILTIN_BY_ID).join(', ')})`,
    };
  }
  const configFile = writeConfigValue('pack', id, env, home);
  return { ok: true, pack: id, configFile };
}

function deepMergePack(base: StatusPackFile, over: StatusPackFile): StatusPackFile {
  const statuses = { ...(base.statuses ?? {}) };
  for (const [id, patch] of Object.entries(over.statuses ?? {})) {
    statuses[id] = { ...(statuses[id] ?? {}), ...patch };
  }
  return {
    version: over.version ?? base.version,
    pack: over.pack ?? base.pack,
    label: over.label ?? base.label,
    description: over.description ?? base.description,
    order: over.order ?? base.order,
    aliases: { ...(base.aliases ?? {}), ...(over.aliases ?? {}) },
    statuses,
  };
}

function resolvePack(
  pack: StatusPackFile,
  source: string,
  userOverride: boolean,
  userOverridePath?: string,
): ResolvedCatalog {
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

  return {
    pack: pack.pack ?? 'generic',
    order: uniqOrder,
    statuses,
    aliases,
    source,
    userOverride,
    userOverridePath,
  };
}

let cached: ResolvedCatalog | null = null;

/** Resolve catalog paths and merge. Pass env for tests. */
export function loadStatusCatalog(
  env: NodeJS.ProcessEnv = process.env,
  home = env.HOME || env.USERPROFILE || '',
): ResolvedCatalog {
  if (cached && !env.MN_STATUSES_TEST_BUST) return cached;

  const configDir = env.MN_CONFIG_DIR || join(home, '.config/mn');
  const configFile = env.MN_CONFIG_FILE || join(configDir, 'config');

  // Explicit file path wins as base (env or config statuses=)
  const pathCandidates: string[] = [];
  if (env.MN_STATUSES?.trim()) pathCandidates.push(env.MN_STATUSES.trim());
  const statusesKey = readConfigValue(configFile, 'statuses') || readConfigValue(configFile, 'MN_STATUSES');
  if (statusesKey) pathCandidates.push(statusesKey);

  let base: StatusPackFile;
  let source: string;
  let usedPathBase = false;

  let pathBase: string | undefined;
  for (const p of pathCandidates) {
    if (p && existsSync(p)) {
      pathBase = p;
      break;
    }
  }

  if (pathBase) {
    const file = loadJsonFile(pathBase);
    if (file?.statuses) {
      base = file;
      source = pathBase;
      usedPathBase = true;
    } else {
      const packId = getConfiguredPackId(env, home);
      base = loadBuiltinPack(packId);
      source = `pack:${packId}`;
    }
  } else {
    const packId = getConfiguredPackId(env, home);
    base = loadBuiltinPack(packId);
    const disk = packFilePath(packId);
    source = existsSync(disk) ? disk : `builtin:${packId}`;
  }

  // Personal overlay: ~/.config/mn/statuses.json (unless MN_STATUSES already is that path)
  const userFile = join(configDir, 'statuses.json');
  let userOverride = usedPathBase;
  let userOverridePath: string | undefined = usedPathBase ? pathBase : undefined;

  if (existsSync(userFile) && pathBase !== userFile) {
    const over = loadJsonFile(userFile);
    if (over && (over.statuses || over.order)) {
      base = deepMergePack(base, over);
      userOverride = true;
      userOverridePath = userFile;
      // keep pack id from base unless overlay renames
      if (over.pack) base.pack = over.pack;
    }
  }

  cached = resolvePack(base, source, userOverride, userOverridePath);
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
  if (st.id === 'coding' || st.id === 'designing' || st.id === 'planning' || st.id === 'working') {
    return 'drift';
  }
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
  if (st.id === 'ready' && openValidate > 0) return `${openValidate} open todo`;
  if (st.badge) return st.badge;
  return null;
}
