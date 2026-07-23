# shellcheck shell=bash
# micro-notes-cli — pt-BR (português do Brasil)
# Sourced by bin/mn; do not execute directly.

MN_LANG_NAME="Português (Brasil)"

# ── errors / status ─────────────────────────────────────────────────
MSG_MISSING_FILE='mn: arquivo não encontrado: %s'
MSG_RUN_INIT='    rode: mn init'
MSG_NO_MICRONOTE='mn: sem MICRONOTE — rode mn init'
MSG_ALREADY_EXISTS='mn: já existe %s'
MSG_CREATED='mn: criado %s'
MSG_UNKNOWN_CMD='mn: comando desconhecido: %s'
MSG_SEE_HELP='    mn ajuda'
MSG_INVALID_STATE='mn: estado inválido: %s (use idle|working|blocked|ready)'

# ── usage ───────────────────────────────────────────────────────────
MSG_USAGE_FIO='uso: mn fio <texto>'
MSG_USAGE_AGORA='uso: mn agora <texto>'
MSG_USAGE_VALIDAR='uso: mn validar <texto>'
MSG_USAGE_ESTADO='uso: mn estado <idle|working|blocked|ready>'
MSG_USAGE_HUMANO='uso: mn humano [--replace] <texto>'
MSG_USAGE_FECHAR='uso: mn fechar <texto>'

# ── check ───────────────────────────────────────────────────────────
MSG_CHECK_MISSING='fail: arquivo não encontrado (%s) — mn init'
MSG_CHECK_HEADING='fail: falta o heading ## %s'
MSG_CHECK_STATE_EMPTY='fail: estado vazio'
MSG_CHECK_STATE_INVALID='fail: estado inválido: %s'
MSG_CHECK_FIO_EMPTY='fail: Fio vazio'
MSG_CHECK_VALIDAR_EMPTY='fail: Validar vazio — adicione um item ou: - [ ] (nada ainda)'
MSG_CHECK_VALIDAR_NO_CB='fail: Validar sem checkboxes — use mn validar "…" ou o placeholder'
MSG_CHECK_OK='ok'

# ── show / badges ───────────────────────────────────────────────────
MSG_TO_VALIDATE='%s por validar'
MSG_NEEDS_YOU='precisa de você'
MSG_EMPTY='(vazio)'
MSG_PLACEHOLDER_BODY='(nada ainda)'
MSG_DASH='—'

# ── watch ───────────────────────────────────────────────────────────
MSG_WATCH_HEADER=' mn watch · %ss · Ctrl+C para sair'

# ── menu ────────────────────────────────────────────────────────────
MSG_MENU_VALIDAR='validar — o que eu verifico'
MSG_MENU_FIO='fio — do que falamos'
MSG_MENU_AGORA='agora — o que está acontecendo'
MSG_MENU_ESTADO='estado — idle/working/blocked/ready'
MSG_MENU_HUMANO='humano — minha nota'
MSG_MENU_FECHAR='fechar — decisão fechada'
MSG_MENU_FEITO='feito — marcar validar'
MSG_MENU_SHOW='ver card'
MSG_MENU_CHECK='check'
MSG_MENU_CANCEL='cancelar'
MSG_MENU_TITLE='mn +  (menu)'
MSG_MENU_PROMPT='escolha [1-%d]: '
MSG_PROMPT_VALIDAR='validar: '
MSG_PROMPT_FIO='fio: '
MSG_PROMPT_AGORA='agora: '
MSG_PROMPT_ESTADO='estado (idle|working|blocked|ready): '
MSG_PROMPT_HUMANO='humano: '
MSG_PROMPT_FECHAR='fechar: '
MSG_PROMPT_FEITO='feito (n ou texto, vazio=primeiro): '
MSG_FZF_PROMPT='mn › '
MSG_FZF_ESTADO='estado › '

# ── help ────────────────────────────────────────────────────────────
MSG_HELP_HEADER='mn v%s — microNote (card de reentrada humana)

Arquivo: %s  (override: MN_FILE)
Path:     %s

Leitura
  mn              ver card (cores + símbolos)
  mn show         idem
  mn watch [n]    atualiza a cada n segundos (default 1)
  mn path         imprime o path do arquivo
  mn check        valida a estrutura (exit 0/1)
  mn ajuda        esta ajuda

Escrita
  mn init
  mn fio <texto>
  mn agora <texto>
  mn validar <texto>
  mn estado <idle|working|blocked|ready>
  mn humano [--replace] <texto>
  mn fechar <texto>
  mn feito [n|texto]   marca item Validar como feito
  mn limpar-validar
  mn touch             só atualiza a hora
  mn +                 menu interativo

Atalhos
  f→fio  a→agora  v→validar  e→estado  h→humano  x→fechar

Idioma
  MN_LANG=pt-BR|en   (config: %s)

Env
  MN_FILE  MN_COLOR=0  NO_COLOR  MN_ASCII=1  MN_WATCH_INTERVAL  MN_LANG

Herdr: painel lateral →  mn watch'
