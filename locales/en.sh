# shellcheck shell=bash
# micro-notes-cli — English
# Sourced by bin/mn; do not execute directly.

MN_LANG_NAME="English"

# ── errors / status ─────────────────────────────────────────────────
MSG_MISSING_FILE='mn: file not found: %s'
MSG_RUN_INIT='    run: mn init'
MSG_NO_MICRONOTE='mn: no MICRONOTE — run mn init'
MSG_ALREADY_EXISTS='mn: already exists %s'
MSG_CREATED='mn: created %s'
MSG_UNKNOWN_CMD='mn: unknown command: %s'
MSG_SEE_HELP='    mn help'
MSG_INVALID_STATE='mn: invalid status: %s (use idle|working|blocked|ready)'

# ── usage ───────────────────────────────────────────────────────────
MSG_USAGE_FIO='usage: mn fio <text>'
MSG_USAGE_AGORA='usage: mn agora <text>'
MSG_USAGE_VALIDAR='usage: mn validar <text>'
MSG_USAGE_ESTADO='usage: mn estado <idle|working|blocked|ready>'
MSG_USAGE_HUMANO='usage: mn humano [--replace] <text>'
MSG_USAGE_FECHAR='usage: mn fechar <text>'

# ── check ───────────────────────────────────────────────────────────
MSG_CHECK_MISSING='fail: file not found (%s) — mn init'
MSG_CHECK_HEADING='fail: missing heading ## %s'
MSG_CHECK_STATE_EMPTY='fail: empty status'
MSG_CHECK_STATE_INVALID='fail: invalid status: %s'
MSG_CHECK_FIO_EMPTY='fail: Thread (Fio) is empty'
MSG_CHECK_VALIDAR_EMPTY='fail: Validate empty — add an item or: - [ ] (nada ainda)'
MSG_CHECK_VALIDAR_NO_CB='fail: Validate has no checkboxes — use mn validar "…" or the placeholder'
MSG_CHECK_OK='ok'

# ── show / badges ───────────────────────────────────────────────────
MSG_TO_VALIDATE='%s to validate'
MSG_NEEDS_YOU='needs you'
MSG_EMPTY='(empty)'
MSG_PLACEHOLDER_BODY='(nada ainda)'
MSG_DASH='—'

# ── watch ───────────────────────────────────────────────────────────
MSG_WATCH_HEADER=' mn watch · %ss · Ctrl+C to quit'

# ── menu ────────────────────────────────────────────────────────────
MSG_MENU_VALIDAR='validar — what I should check'
MSG_MENU_FIO='fio — conversation thread'
MSG_MENU_AGORA='agora — what is happening now'
MSG_MENU_ESTADO='estado — idle/working/blocked/ready'
MSG_MENU_HUMANO='humano — my note'
MSG_MENU_FECHAR='fechar — closed decision'
MSG_MENU_FEITO='feito — mark validate item done'
MSG_MENU_SHOW='show card'
MSG_MENU_CHECK='check'
MSG_MENU_CANCEL='cancel'
MSG_MENU_TITLE='mn +  (menu)'
MSG_MENU_PROMPT='choice [1-%d]: '
MSG_PROMPT_VALIDAR='validar: '
MSG_PROMPT_FIO='fio: '
MSG_PROMPT_AGORA='agora: '
MSG_PROMPT_ESTADO='status (idle|working|blocked|ready): '
MSG_PROMPT_HUMANO='humano: '
MSG_PROMPT_FECHAR='fechar: '
MSG_PROMPT_FEITO='feito (n or text, empty=first): '
MSG_FZF_PROMPT='mn › '
MSG_FZF_ESTADO='status › '

# ── help ────────────────────────────────────────────────────────────
MSG_HELP_HEADER='mn v%s — microNote (human re-entry card)

File: %s  (override: MN_FILE)
Path:     %s

Read
  mn              show card (colors + symbols)
  mn show         same
  mn watch [n]    refresh every n seconds (default 1)
  mn path         print file path
  mn check        validate structure (exit 0/1)
  mn help         this help

Write
  mn init
  mn fio <text>          thread / context
  mn agora <text>        what is happening now
  mn validar <text>      checklist item
  mn estado <idle|working|blocked|ready>
  mn humano [--replace] <text>
  mn fechar <text>       closed decision
  mn feito [n|text]      mark Validate item done
  mn limpar-validar
  mn touch               only refresh timestamp
  mn +                   interactive menu

Shortcuts
  f→fio  a→agora  v→validar  e→estado  h→humano  x→fechar

Language
  MN_LANG=pt-BR|en   (config: %s)

Env
  MN_FILE  MN_COLOR=0  NO_COLOR  MN_ASCII=1  MN_WATCH_INTERVAL  MN_LANG

Herdr: side pane →  mn watch'
