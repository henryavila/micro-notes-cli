/**
 * MICRONOTE.md parse / serialize — English canonical schema.
 * Matches bin/mn file format (Thread, Description, Now, Validate, Human, Closed).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export type NoteStatus = 'idle' | 'working' | 'blocked' | 'ready';

export interface ValidateItem {
  text: string;
  done: boolean;
}

export interface MicroNote {
  updated: string;
  status: NoteStatus | string;
  thread: string;
  description: string;
  now: string;
  validate: ValidateItem[];
  human: string;
  closed: string[];
}

export const PLACEHOLDER_VALIDATE = '(nothing yet)';
export const VALID_STATUSES: NoteStatus[] = ['idle', 'working', 'blocked', 'ready'];

export function notePath(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  if (env.MN_FILE && env.MN_FILE.trim()) return env.MN_FILE.trim();
  return join(cwd, 'MICRONOTE.md');
}

function nowHm(d = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function emptyNote(): MicroNote {
  return {
    updated: nowHm(),
    status: 'idle',
    thread: '',
    description: '',
    now: '',
    validate: [],
    human: '',
    closed: [],
  };
}

/** Map legacy PT headings/meta when reading old files. */
function normalizeHeading(h: string): string {
  const map: Record<string, string> = {
    Fio: 'Thread',
    Descricao: 'Description',
    Agora: 'Now',
    Validar: 'Validate',
    Humano: 'Human',
    Fechado: 'Closed',
  };
  return map[h] ?? h;
}

export function parseNote(raw: string): MicroNote {
  const note = emptyNote();
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let section: string | null = null;
  const bodies: Record<string, string[]> = {
    Thread: [],
    Description: [],
    Now: [],
    Validate: [],
    Human: [],
    Closed: [],
  };

  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) continue;

    const metaUpdated = line.match(/^(updated|atualizado):\s*(.*)$/i);
    if (metaUpdated) {
      note.updated = metaUpdated[2].trim();
      continue;
    }
    const metaStatus = line.match(/^(status|estado):\s*(.*)$/i);
    if (metaStatus) {
      note.status = metaStatus[2].trim() || 'idle';
      continue;
    }

    const hm = line.match(/^##\s+(.+)\s*$/);
    if (hm) {
      section = normalizeHeading(hm[1].trim());
      if (!(section in bodies)) bodies[section] = [];
      continue;
    }

    if (section && section in bodies) {
      bodies[section].push(line);
    }
  }

  const trimBody = (xs: string[]) =>
    xs
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      .trim();

  note.thread = trimBody(bodies.Thread ?? []);
  note.description = trimBody(bodies.Description ?? []);
  note.now = trimBody(bodies.Now ?? []);
  note.human = trimBody(bodies.Human ?? []);

  note.validate = [];
  for (const line of bodies.Validate ?? []) {
    const t = line.trim();
    if (!t) continue;
    const done = t.match(/^- \[[xX]\]\s+(.*)$/);
    const open = t.match(/^- \[ \]\s+(.*)$/);
    if (done) {
      const text = done[1].trim();
      if (text === PLACEHOLDER_VALIDATE || text === '(nada ainda)') continue;
      note.validate.push({ text, done: true });
    } else if (open) {
      const text = open[1].trim();
      if (text === PLACEHOLDER_VALIDATE || text === '(nada ainda)') continue;
      note.validate.push({ text, done: false });
    }
  }

  note.closed = [];
  for (const line of bodies.Closed ?? []) {
    const t = line.trim();
    if (!t || t === '-') continue;
    if (/^-\s*$/.test(t)) continue;
    if (t.startsWith('- ')) note.closed.push(t.slice(2).trim());
    else note.closed.push(t);
  }

  return note;
}

export function serializeNote(note: MicroNote): string {
  const validateLines =
    note.validate.length === 0
      ? [`- [ ] ${PLACEHOLDER_VALIDATE}`]
      : note.validate.map((v) => `- [${v.done ? 'x' : ' '}] ${v.text}`);

  const closedLines =
    note.closed.length === 0 ? ['- '] : note.closed.map((c) => `- ${c}`);

  const block = (title: string, body: string) => {
    const b = body.trim();
    return b ? `## ${title}\n${b}\n` : `## ${title}\n\n`;
  };

  return [
    '# microNote',
    `updated: ${note.updated || nowHm()}`,
    `status: ${note.status || 'idle'}`,
    '',
    block('Thread', note.thread).trimEnd(),
    '',
    block('Description', note.description).trimEnd(),
    '',
    block('Now', note.now).trimEnd(),
    '',
    `## Validate`,
    ...validateLines,
    '',
    block('Human', note.human).trimEnd(),
    '',
    `## Closed`,
    ...closedLines,
    '',
  ].join('\n');
}

export function readNoteFile(path: string): MicroNote | null {
  if (!existsSync(path)) return null;
  return parseNote(readFileSync(path, 'utf8'));
}

export function writeNoteFile(path: string, note: MicroNote): void {
  const stamped: MicroNote = { ...note, updated: nowHm() };
  const content = serializeNote(stamped);
  const body = content.endsWith('\n') ? content : content + '\n';
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.micronote.${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, path);
}

export function initNoteFile(path: string): MicroNote {
  const note = emptyNote();
  writeNoteFile(path, note);
  return readNoteFile(path) ?? note;
}

/** blink state intent for header/list status column */
export function statusToIntent(status: string): string {
  switch (status) {
    case 'ready':
      return 'ok';
    case 'blocked':
      return 'error';
    case 'working':
      return 'drift';
    case 'idle':
    default:
      return 'pending';
  }
}

export function openValidateCount(note: MicroNote): number {
  return note.validate.filter((v) => !v.done).length;
}
