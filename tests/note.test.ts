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
  openValidateCount,
  PLACEHOLDER_VALIDATE,
  notePath,
  readNoteFile,
  writeNoteFile,
  initNoteFile,
} from '../tui/src/note.js';
import { cleanup, makeTempDir, readRaw } from './helpers/tempNote.js';

describe('parseNote', () => {
  it('round-trips a filled note (EN schema)', () => {
    const n = emptyNote();
    n.thread = 'paddle webhooks';
    n.description = 'line1\nline2';
    n.now = 'writing tests';
    n.status = 'ready';
    n.validate = [
      { text: 'npm test', done: false },
      { text: 'retry', done: true },
    ];
    n.human = 'do not touch billing';
    n.closed = ['dropped Stripe'];
    const raw = serializeNote(n);
    const p = parseNote(raw);
    expect(p.thread).toBe('paddle webhooks');
    expect(p.description).toContain('line1');
    expect(p.description).toContain('line2');
    expect(p.now).toBe('writing tests');
    expect(p.status).toBe('ready');
    expect(p.validate).toEqual(n.validate);
    expect(p.human).toBe('do not touch billing');
    expect(p.closed).toEqual(['dropped Stripe']);
    expect(raw).toContain('## Thread');
    expect(raw).toContain('## Wait');
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
    // serialize drops wait body when not blocked
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

  it('drops EN and PT validate placeholders', () => {
    expect(parseNote(serializeNote(emptyNote())).validate).toEqual([]);
    const en = `# microNote\nupdated: 10:00\nstatus: idle\n\n## Thread\n\n## Description\n\n## Now\n\n## Wait\n\n## Validate\n- [ ] ${PLACEHOLDER_VALIDATE}\n\n## Human\n\n## Closed\n- \n`;
    expect(parseNote(en).validate).toEqual([]);
    const pt = `# microNote\natualizado: 10:00\nestado: idle\n\n## Validar\n- [ ] (nada ainda)\n\n## Fechado\n- \n`;
    expect(parseNote(pt).validate).toEqual([]);
  });

  it('keeps real items when mixed with a placeholder line', () => {
    const raw = `# microNote
updated: 10:00
status: idle

## Thread
t

## Description

## Now

## Wait

## Validate
- [ ] ${PLACEHOLDER_VALIDATE}
- [ ] real item
- [x] done item

## Human

## Closed
- 
`;
    const p = parseNote(raw);
    expect(p.validate).toEqual([
      { text: 'real item', done: false },
      { text: 'done item', done: true },
    ]);
  });

  it('accepts [X] as done and trims closed bullets', () => {
    const raw = `# microNote
updated: 10:00
status: working

## Thread
t

## Description

## Now

## Validate
- [X] CAPS

## Human

## Closed
-
- first
second bare

`;
    const p = parseNote(raw);
    expect(p.validate).toEqual([{ text: 'CAPS', done: true }]);
    expect(p.closed).toEqual(['first', 'second bare']);
  });

  it('migrates legacy PT headings and keeps bodies', () => {
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
- closed item
`;
    const p = parseNote(raw);
    expect(p.updated).toBe('10:00');
    expect(p.status).toBe('working');
    expect(p.thread).toBe('old thread');
    expect(p.description).toBe('old desc');
    expect(p.now).toBe('old now');
    expect(p.validate).toEqual([]);
    expect(p.human).toBe('note');
    expect(p.closed).toEqual(['closed item']);
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
    const emptyStatus = `# microNote\nupdated: 10:00\nstatus: \n\n## Thread\n\n## Description\n\n## Now\n\n## Validate\n- [ ] ${PLACEHOLDER_VALIDATE}\n\n## Human\n\n## Closed\n- \n`;
    expect(parseNote(emptyStatus).status).toBe('idle');
    const weird = emptyStatus.replace('status: ', 'status: foobar');
    expect(parseNote(weird).status).toBe('foobar');
  });

  it('does not throw on a nearly empty file', () => {
    expect(() => parseNote('# microNote\n')).not.toThrow();
    expect(parseNote('# microNote\n').thread).toBe('');
  });
});

describe('serializeNote', () => {
  it('writes empty validate as the canonical placeholder (bash-compatible)', () => {
    const raw = serializeNote(emptyNote());
    expect(raw).toContain(`- [ ] ${PLACEHOLDER_VALIDATE}`);
    expect(raw).toMatch(/^status: idle$/m);
    expect(raw).toContain('## Thread');
    expect(raw).toContain('## Closed');
    // empty closed is a lone dash line — matches bin/mn template
    expect(raw).toMatch(/## Closed\n- \n/);
  });

  it('round-trips multi-line description', () => {
    const n = emptyNote();
    n.description = 'para one\n\npara two';
    const again = parseNote(serializeNote(n));
    expect(again.description).toBe('para one\n\npara two');
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
      expect(n!.validate).toEqual([]);
      expect(readRaw(path)).toContain(`- [ ] ${PLACEHOLDER_VALIDATE}`);

      writeNoteFile(path, {
        ...n!,
        thread: 'from-ts',
        now: 'io test',
        status: 'working',
        validate: [{ text: 'a', done: false }],
        closed: [],
        human: '',
        description: '',
      });
      const again = readNoteFile(path)!;
      expect(again.thread).toBe('from-ts');
      expect(again.now).toBe('io test');
      expect(again.updated).toMatch(/^\d{2}:\d{2}$/);
      // no leftover atomic temp files
      const leftovers = readdirSync(dir).filter((f) => f.startsWith('.micronote.'));
      expect(leftovers).toEqual([]);
    } finally {
      cleanup(dir);
    }
  });
});

describe('helpers', () => {
  it('openValidateCount counts only open real items', () => {
    const n = emptyNote();
    expect(openValidateCount(n)).toBe(0);
    n.validate = [
      { text: 'a', done: false },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ];
    expect(openValidateCount(n)).toBe(2);
  });

  it('statusToIntent maps catalog statuses used by the TUI chrome', () => {
    expect(statusToIntent('ready')).toBe('ok');
    expect(statusToIntent('blocked')).toBe('error');
    expect(statusToIntent('coding')).toBe('drift');
    expect(statusToIntent('working')).toBe('drift'); // alias → coding
    expect(statusToIntent('idle')).toBe('pending');
    expect(statusToIntent('review-plan')).toBe('warn');
    expect(statusToIntent('review-code')).toBe('warn');
  });

  it('statusGlyph / statusTitle put a mark in the pane title (ai-dev pack)', () => {
    expect(statusGlyph('idle')).toBe('○');
    expect(statusGlyph('coding')).toBe('◉');
    expect(statusGlyph('working')).toBe('◉'); // alias
    expect(statusGlyph('blocked')).toBe('!');
    expect(statusGlyph('ready')).toBe('►');
    expect(statusGlyph('review-plan')).toBe('▣');
    expect(statusGlyph('review-code')).toBe('◐');
    expect(statusTitle('coding')).toBe('◉ coding');
    expect(statusTitle('blocked')).toBe('! blocked');
    expect(statusTitle('review-plan')).toBe('▣ review plan');
  });
});
