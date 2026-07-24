import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseNote,
  serializeNote,
  emptyNote,
  statusToIntent,
  statusGlyph,
  statusTitle,
  blockedNeedsWait,
  withStatus,
  openTodoCount,
  PLACEHOLDER_TODO,
  notePath,
  readNoteFile,
  writeNoteFile,
  initNoteFile,
  removeTodo,
  clearDoneTodos,
  clearAllTodos,
  clearActivity,
  clearSoft,
} from '../tui/src/note.js';
import { resetStatusCatalogCache } from '../tui/src/status-catalog.js';
import { cleanup, makeTempDir, readRaw } from './helpers/tempNote.js';

// Glyph / intent tests cover the ai-dev pack.
process.env.MN_PACK = 'ai-dev';
process.env.MN_STATUSES_TEST_BUST = '1';
resetStatusCatalogCache();

describe('parseNote / serializeNote (SCHEMA v0.1)', () => {
  it('round-trips a filled note (Thread · Description · Now · Wait · Todo · Finished)', () => {
    const n = emptyNote();
    n.thread = 'paddle webhooks';
    n.description = 'idempotency + dual-write context';
    n.now = 'writing tests';
    n.status = 'ready';
    n.todo = [
      { text: 'npm test', done: false },
      { text: 'retry', done: true },
    ];
    n.finished = ['dropped Stripe'];
    const raw = serializeNote(n);
    const p = parseNote(raw);
    expect(p.thread).toBe('paddle webhooks');
    expect(p.description).toBe('idempotency + dual-write context');
    expect(p.now).toBe('writing tests');
    expect(p.status).toBe('ready');
    expect(p.todo).toEqual(n.todo);
    expect(p.finished).toEqual(['dropped Stripe']);
    expect(raw).toContain('## Thread');
    expect(raw).toContain('## Description');
    expect(raw).toContain('## Now');
    expect(raw).toContain('## Wait');
    expect(raw).toContain('## Todo');
    expect(raw).toContain('## Finished');
    expect(raw).not.toContain('## Human');
    expect(raw).not.toContain('## Validate');
    expect(raw).toContain('- [ ] npm test');
    expect(raw).toContain('- [x] retry');
  });

  it('round-trips Wait when blocked and clears Wait when not blocked', () => {
    const n = emptyNote();
    n.thread = 't';
    n.status = 'blocked';
    n.wait = 'cutover now vs dual-write?';
    const raw = serializeNote(n);
    expect(raw).toContain('## Wait');
    expect(raw).toContain('cutover now vs dual-write?');
    expect(parseNote(raw).wait).toBe('cutover now vs dual-write?');

    n.status = 'working';
    const unblocked = serializeNote(n);
    expect(parseNote(unblocked).wait).toBe('');
    expect(unblocked).toMatch(/## Wait\n\n/);
  });

  it('blockedNeedsWait / withStatus enforce the blocked-on rule', () => {
    const n = emptyNote();
    n.status = 'blocked';
    n.wait = '';
    expect(blockedNeedsWait(n)).toBe(true);
    n.wait = 'need decision on API shape';
    expect(blockedNeedsWait(n)).toBe(false);

    const left = withStatus({ ...n, wait: 'x' }, 'working');
    expect(left.status).toBe('working');
    expect(left.wait).toBe('');

    const entered = withStatus(emptyNote(), 'blocked');
    expect(entered.status).toBe('blocked');
    expect(blockedNeedsWait(entered)).toBe(true);
  });

  it('drops EN/PT todo placeholders and maps legacy Validate/Need → Todo', () => {
    expect(parseNote(serializeNote(emptyNote())).todo).toEqual([]);
    const en = `# microNote\nupdated: 10:00\nstatus: idle\n\n## Thread\n\n## Now\n\n## Wait\n\n## Todo\n- [ ] ${PLACEHOLDER_TODO}\n\n## Finished\n- \n`;
    expect(parseNote(en).todo).toEqual([]);
    const legacyValidate = `# microNote\nupdated: 10:00\nstatus: idle\n\n## Validate\n- [ ] ${PLACEHOLDER_TODO}\n\n## Finished\n- \n`;
    expect(parseNote(legacyValidate).todo).toEqual([]);
    const pt = `# microNote\natualizado: 10:00\nestado: idle\n\n## Validar\n- [ ] (nada ainda)\n\n## Fechado\n- \n`;
    expect(parseNote(pt).todo).toEqual([]);
  });

  it('keeps real Todo items when mixed with a placeholder line', () => {
    const raw = `# microNote
updated: 10:00
status: idle

## Thread
t

## Now

## Wait

## Todo
- [ ] ${PLACEHOLDER_TODO}
- [ ] real item
- [x] done item

## Finished
- 
`;
    const p = parseNote(raw);
    expect(p.todo).toEqual([
      { text: 'real item', done: false },
      { text: 'done item', done: true },
    ]);
  });

  it('accepts [X] as done and trims finished bullets', () => {
    const raw = `# microNote
updated: 10:00
status: working

## Thread
t

## Now

## Todo
- [X] CAPS

## Finished
-
- first
second bare

`;
    const p = parseNote(raw);
    expect(p.todo).toEqual([{ text: 'CAPS', done: true }]);
    expect(p.finished).toEqual(['first', 'second bare']);
  });

  it('migrates legacy PT headings; keeps Description, drops Human', () => {
    const raw = `# microNote
atualizado: 10:00
estado: working

## Fio
old thread

## Descricao
old desc

## Agora
old now

## Validar
- [ ] (nada ainda)

## Humano
note

## Fechado
- finished item
`;
    const p = parseNote(raw);
    expect(p.updated).toBe('10:00');
    expect(p.status).toBe('working');
    expect(p.thread).toBe('old thread');
    expect(p.description).toBe('old desc');
    expect(p.now).toBe('old now');
    expect(p.todo).toEqual([]);
    expect(p.finished).toEqual(['finished item']);
    // Human dropped; Descricao → Description; Closed → Finished
    const out = serializeNote(p);
    expect(out).toContain('## Description');
    expect(out).toContain('old desc');
    expect(out).not.toContain('## Human');
    expect(out).toContain('## Finished');
    expect(out).not.toContain('## Closed');
    expect(out).not.toContain('## Fechado');
    expect(out).not.toContain('## Humano');
    expect(out).not.toContain('## Descricao');
  });

  it('parses CRLF the same as LF', () => {
    const lf = serializeNote({
      ...emptyNote(),
      thread: 'crlf',
      now: 'x',
      status: 'idle',
    });
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(parseNote(crlf).thread).toBe('crlf');
    expect(parseNote(crlf).now).toBe('x');
  });

  it('defaults empty status meta to idle; keeps unknown status strings', () => {
    const emptyStatus = `# microNote\nupdated: 10:00\nstatus: \n\n## Thread\n\n## Now\n\n## Todo\n- [ ] ${PLACEHOLDER_TODO}\n\n## Finished\n- \n`;
    expect(parseNote(emptyStatus).status).toBe('idle');
    const weird = emptyStatus.replace('status: ', 'status: foobar');
    expect(parseNote(weird).status).toBe('foobar');
  });

  it('does not throw on a nearly empty file', () => {
    expect(() => parseNote('# microNote\n')).not.toThrow();
    expect(parseNote('# microNote\n').thread).toBe('');
  });

  it('writes empty Todo as the canonical placeholder (bash-compatible)', () => {
    const raw = serializeNote(emptyNote());
    expect(raw).toContain(`- [ ] ${PLACEHOLDER_TODO}`);
    expect(raw).toMatch(/^status: idle$/m);
    expect(raw).toContain('## Thread');
    expect(raw).toContain('## Todo');
    expect(raw).toContain('## Finished');
    expect(raw).toMatch(/## Finished\n- \n/);
  });
});

describe('notePath / IO', () => {
  it('prefers MN_FILE (trimmed) over cwd default', () => {
    expect(notePath('/cwd', { MN_FILE: ' /tmp/note.md ' })).toBe('/tmp/note.md');
    expect(notePath('/cwd', {})).toBe('/cwd/MICRONOTE.md');
    expect(notePath('/cwd', { MN_FILE: '' })).toBe('/cwd/MICRONOTE.md');
  });

  it('readNoteFile returns null when missing; init + write are parseable', () => {
    const dir = makeTempDir();
    try {
      const path = `${dir}/MICRONOTE.md`;
      expect(readNoteFile(path)).toBeNull();
      initNoteFile(path);
      const n = readNoteFile(path);
      expect(n).not.toBeNull();
      expect(n!.status).toBe('idle');
      expect(n!.todo).toEqual([]);
      expect(readRaw(path)).toContain(`- [ ] ${PLACEHOLDER_TODO}`);
      expect(readRaw(path)).toContain('## Todo');
      expect(readRaw(path)).toContain('## Description');
      expect(readRaw(path)).not.toContain('## Human');

      writeNoteFile(path, {
        ...n!,
        thread: 'from-ts',
        description: 'context',
        now: 'io test',
        status: 'working',
        todo: [{ text: 'a', done: false }],
        finished: [],
      });
      const again = readNoteFile(path)!;
      expect(again.thread).toBe('from-ts');
      expect(again.now).toBe('io test');
      expect(again.todo).toEqual([{ text: 'a', done: false }]);
      expect(again.updated).toMatch(/^\d{2}:\d{2}$/);
      const leftovers = readdirSync(dir).filter((f) => f.startsWith('.micronote.'));
      expect(leftovers).toEqual([]);
    } finally {
      cleanup(dir);
    }
  });
});

describe('helpers', () => {
  it('openTodoCount counts only open real items', () => {
    const n = emptyNote();
    expect(openTodoCount(n)).toBe(0);
    n.todo = [
      { text: 'a', done: false },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ];
    expect(openTodoCount(n)).toBe(2);
  });

  it('removeTodo drops one item by index (immutable)', () => {
    const n = emptyNote();
    n.todo = [
      { text: 'a', done: false },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ];
    const next = removeTodo(n, 1);
    expect(next.todo).toEqual([
      { text: 'a', done: false },
      { text: 'c', done: false },
    ]);
    expect(n.todo).toHaveLength(3);
    expect(removeTodo(n, 99).todo).toEqual(n.todo);
  });

  it('clearDoneTodos keeps only open items', () => {
    const n = emptyNote();
    n.todo = [
      { text: 'a', done: false },
      { text: 'b', done: true },
      { text: 'c', done: true },
    ];
    expect(clearDoneTodos(n).todo).toEqual([{ text: 'a', done: false }]);
  });

  it('clearAllTodos empties the checklist', () => {
    const n = emptyNote();
    n.todo = [{ text: 'a', done: false }];
    expect(clearAllTodos(n).todo).toEqual([]);
    expect(serializeNote(clearAllTodos(n))).toContain(`- [ ] ${PLACEHOLDER_TODO}`);
  });

  it('clearActivity zeros now + wait only', () => {
    const n = emptyNote();
    n.thread = 'stream';
    n.now = 'working';
    n.wait = 'on review';
    n.todo = [{ text: 'a', done: false }];
    n.finished = ['old'];
    const next = clearActivity(n);
    expect(next.now).toBe('');
    expect(next.wait).toBe('');
    expect(next.thread).toBe('stream');
    expect(next.todo).toEqual([{ text: 'a', done: false }]);
    expect(next.finished).toEqual(['old']);
  });

  it('clearSoft resets body but keeps thread', () => {
    const n = emptyNote();
    n.thread = 'paddle';
    n.description = 'long context';
    n.status = 'coding';
    n.now = 'tests';
    n.wait = 'ci';
    n.todo = [{ text: 'a', done: true }];
    n.finished = ['shipped'];
    const next = clearSoft(n);
    expect(next.thread).toBe('paddle');
    expect(next.status).toBe('idle');
    expect(next.description).toBe('');
    expect(next.now).toBe('');
    expect(next.wait).toBe('');
    expect(next.todo).toEqual([]);
    expect(next.finished).toEqual([]);
  });

  it('statusToIntent maps catalog statuses used by the TUI chrome', () => {
    expect(statusToIntent('ready')).toBe('ok');
    expect(statusToIntent('blocked')).toBe('error');
    expect(statusToIntent('coding')).toBe('drift');
    expect(statusToIntent('working')).toBe('drift');
    expect(statusToIntent('idle')).toBe('pending');
    expect(statusToIntent('review-plan')).toBe('warn');
    expect(statusToIntent('review-code')).toBe('warn');
  });

  it('statusGlyph / statusTitle put a mark in the pane title (ai-dev pack)', () => {
    expect(statusGlyph('idle')).toBe('○');
    expect(statusGlyph('coding')).toBe('◉');
    expect(statusGlyph('working')).toBe('◉');
    expect(statusGlyph('blocked')).toBe('!');
    expect(statusGlyph('ready')).toBe('►');
    expect(statusGlyph('review-plan')).toBe('▣');
    expect(statusGlyph('review-code')).toBe('◐');
    expect(statusTitle('coding')).toBe('◉ coding');
    expect(statusTitle('blocked')).toBe('! blocked');
    expect(statusTitle('review-plan')).toBe('▣ review plan');
  });
});
