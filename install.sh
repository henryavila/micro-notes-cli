#!/usr/bin/env bash
# install.sh — install `mn` onto PATH
#
# Usage:
#   ./install.sh                 # copy → ~/.local/bin/mn + ensure PATH + pick language
#   ./install.sh --link          # symlink to repo bin (dev)
#   ./install.sh --prefix DIR    # install to DIR instead of ~/.local/bin
#   ./install.sh --alias-only    # only add shell alias (no copy; points to repo)
#   ./install.sh --lang en # language (non-interactive)
#   ./install.sh --pack generic|ai-dev   # status pack (skip prompt)
#   ./install.sh --uninstall     # remove binary + PATH/alias blocks we added
#   ./install.sh --dry-run
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/bin/mn"
LOCALES_SRC="$ROOT/locales"
PREFIX="${MN_PREFIX:-$HOME/.local/bin}"
SHARE_DIR="${MN_SHARE_DIR:-$HOME/.local/share/mn}"
CONFIG_DIR="${MN_CONFIG_DIR:-$HOME/.config/mn}"
CONFIG_FILE="$CONFIG_DIR/config"
MODE="copy"          # copy | link | alias-only
UNINSTALL=0
DRY_RUN=0
FORCE_RC=0           # write rc even if already on PATH
LANG_ARG="${MN_LANG:-}"  # empty → prompt (if TTY) or detect
PACK_ARG="${MN_PACK:-}"  # empty → prompt (if TTY) or generic
MARKER_BEGIN="# >>> micro-notes-cli (mn) >>>"
MARKER_END="# <<< micro-notes-cli (mn) <<<"

usage() {
  cat <<'EOF'
install.sh — micro-notes-cli (mn)

  ./install.sh                 copy bin to ~/.local/bin and ensure PATH
  ./install.sh --link          symlink ~/.local/bin/mn → repo (updates with git pull)
  ./install.sh --prefix DIR    install directory (default: ~/.local/bin)
  ./install.sh --alias-only    add shell alias mn=.../bin/mn (no install dir)
  ./install.sh --lang en set UI language (skip prompt)
  ./install.sh --pack generic|ai-dev   status pack (default: generic)
  ./install.sh --uninstall     remove binary we installed + rc block + config lang
  ./install.sh --force-rc      always (re)write shell rc PATH/alias block
  ./install.sh --dry-run       print actions only
  ./install.sh -h | --help

Env:
  MN_PREFIX     same as --prefix
  MN_LANG       same as --lang (en)
  MN_PACK       same as --pack (generic|ai-dev)
  MN_SHARE_DIR  locales install dir (default: ~/.local/share/mn)
  MN_CONFIG_DIR config dir (default: ~/.config/mn)
EOF
}

log()  { printf '  %s\n' "$*"; }
info() { printf '→ %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  [dry-run] %s\n' "$*"
    return 0
  fi
  eval "$@"
}

normalize_lang() {
  local raw="${1:-}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
  case "$raw" in
    en|en-*|english*|''|*) printf 'en\n' ;;
  esac
}

detect_lang_from_env() {
  local raw="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
  raw="${raw%%.*}"
  normalize_lang "$raw"
}

# Interactive language picker. Default pt-BR.
# CRITICAL: menu/prompts go to stderr (and read from /dev/tty when possible)
# so `SELECTED="$(pick_language)"` only captures the language code on stdout.
# Writing prompts to stdout made the install look "hung" and poisoned awk.
pick_language() {
  # English only for now (pt-BR translation later)
  if [[ -n "$LANG_ARG" ]]; then
    local n
    n="$(normalize_lang "$LANG_ARG")"
    if [[ -n "$n" && "$n" != "en" ]]; then
      warn "only English is supported for now (got: $LANG_ARG) — using en"
    fi
  fi
  printf 'en
'
}

write_lang_config() {
  local lang="$1"
  # hard guard: never write multi-line / garbage into config
  case "$lang" in
    en) ;;
    *) die "internal: invalid language code for config: ${lang//$'\n'/\\n}" ;;
  esac
  info "language: $lang → $CONFIG_FILE"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] write lang=$lang to $CONFIG_FILE"
    return 0
  fi
  mkdir -p "$CONFIG_DIR"
  # pure bash rewrite — avoid awk -v with special chars
  local tmp line wrote=0
  tmp="$(mktemp)"
  if [[ -f "$CONFIG_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == lang=* || "$line" == language=* ]]; then
        if [[ $wrote -eq 0 ]]; then
          printf 'lang=%s\n' "$lang"
          wrote=1
        fi
      else
        printf '%s\n' "$line"
      fi
    done <"$CONFIG_FILE" >"$tmp"
  else
    : >"$tmp"
  fi
  if [[ $wrote -eq 0 ]]; then
    printf 'lang=%s\n' "$lang" >>"$tmp"
  fi
  mv -f "$tmp" "$CONFIG_FILE"
}

# Interactive status-pack picker. Prompts on stderr; pack id on stdout.
pick_status_pack() {
  if [[ -n "$PACK_ARG" ]]; then
    case "$PACK_ARG" in
      generic|ai-dev) printf '%s\n' "$PACK_ARG"; return 0 ;;
      *)
        warn "unknown pack '$PACK_ARG' — using generic"
        printf 'generic\n'
        return 0
        ;;
    esac
  fi
  if [[ ! -t 0 ]] || [[ ! -r /dev/tty ]]; then
    printf 'generic\n'
    return 0
  fi
  {
    printf '\n'
    printf '  Status pack (which statuses appear in mn / TUI)\n'
    printf '\n'
    printf '    1) generic   — idle · working · blocked · ready  (default)\n'
    printf '    2) ai-dev    — design → plan → code → review stages\n'
    printf '\n'
    printf '  You can change later: mn status pack list | mn status pack <id>\n'
    printf '  Personal overlay:     mn status init  (edit statuses.json)\n'
    printf '\n'
    printf '  choice [1]: '
  } >&2
  local ans=""
  # shellcheck disable=SC2162
  read -r ans </dev/tty || true
  case "${ans:-1}" in
    2|ai-dev|ai|dev) printf 'ai-dev\n' ;;
    *) printf 'generic\n' ;;
  esac
}

write_pack_config() {
  local pack="$1"
  case "$pack" in
    generic|ai-dev) ;;
    *) die "internal: invalid pack: $pack" ;;
  esac
  info "status pack: $pack → $CONFIG_FILE"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] write pack=$pack to $CONFIG_FILE"
    return 0
  fi
  mkdir -p "$CONFIG_DIR"
  local tmp line wrote=0
  tmp="$(mktemp)"
  if [[ -f "$CONFIG_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == pack=* ]]; then
        if [[ $wrote -eq 0 ]]; then
          printf 'pack=%s\n' "$pack"
          wrote=1
        fi
      else
        printf '%s\n' "$line"
      fi
    done <"$CONFIG_FILE" >"$tmp"
  else
    : >"$tmp"
  fi
  if [[ $wrote -eq 0 ]]; then
    printf 'pack=%s\n' "$pack" >>"$tmp"
  fi
  mv -f "$tmp" "$CONFIG_FILE"
}

install_locales() {
  [[ -d "$LOCALES_SRC" ]] || die "missing $LOCALES_SRC"
  local dest="$SHARE_DIR/locales"
  info "installing locales → $dest"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] mkdir -p $dest && cp locales/*"
    return 0
  fi
  mkdir -p "$dest"
  cp -f "$LOCALES_SRC/en.sh" "$dest/" 2>/dev/null || true
}

# ── args ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --link)       MODE="link"; shift ;;
    --alias-only) MODE="alias-only"; shift ;;
    --prefix)     PREFIX="${2:-}"; [[ -n "$PREFIX" ]] || die "--prefix needs DIR"; shift 2 ;;
    --prefix=*)   PREFIX="${1#*=}"; shift ;;
    --lang)       LANG_ARG="${2:-}"; [[ -n "$LANG_ARG" ]] || die "--lang needs en"; shift 2 ;;
    --lang=*)     LANG_ARG="${1#*=}"; shift ;;
    --pack)       PACK_ARG="${2:-}"; [[ -n "$PACK_ARG" ]] || die "--pack needs generic|ai-dev"; shift 2 ;;
    --pack=*)     PACK_ARG="${1#*=}"; shift ;;
    --uninstall)  UNINSTALL=1; shift ;;
    --force-rc)   FORCE_RC=1; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "unknown arg: $1 (try --help)" ;;
  esac
done

[[ -f "$SRC" ]] || die "missing $SRC"
[[ -x "$SRC" ]] || run "chmod +x \"$SRC\""

# ── detect shell rc files to patch ──────────────────────────────────
detect_rcs() {
  local shell_name rcs=()
  shell_name="$(basename "${SHELL:-/bin/zsh}")"
  case "$shell_name" in
    zsh)
      rcs+=("$HOME/.zshrc")
      # login-only zsh sometimes only has zprofile
      [[ -f "$HOME/.zprofile" ]] && rcs+=("$HOME/.zprofile")
      ;;
    bash)
      rcs+=("$HOME/.bashrc")
      [[ -f "$HOME/.bash_profile" ]] && rcs+=("$HOME/.bash_profile")
      [[ -f "$HOME/.profile" ]] && rcs+=("$HOME/.profile")
      ;;
    fish)
      mkdir -p "$HOME/.config/fish"
      rcs+=("$HOME/.config/fish/config.fish")
      ;;
    *)
      rcs+=("$HOME/.profile")
      [[ -f "$HOME/.zshrc" ]] && rcs+=("$HOME/.zshrc")
      [[ -f "$HOME/.bashrc" ]] && rcs+=("$HOME/.bashrc")
      ;;
  esac
  # always consider common ones if they exist (multi-shell users)
  for f in "$HOME/.zshrc" "$HOME/.bashrc"; do
    local seen=0 rc
    for rc in "${rcs[@]+"${rcs[@]}"}"; do
      [[ "$rc" == "$f" ]] && seen=1
    done
    if [[ $seen -eq 0 && -f "$f" ]]; then
      rcs+=("$f")
    fi
  done
  printf '%s\n' "${rcs[@]}"
}

path_has_prefix() {
  case ":$PATH:" in
    *":$PREFIX:"*) return 0 ;;
    *) return 1 ;;
  esac
}

# ── rc block content ────────────────────────────────────────────────
rc_block_posix() {
  if [[ "$MODE" == "alias-only" ]]; then
    cat <<EOF
$MARKER_BEGIN
# micro-notes-cli — https://github.com (local: $ROOT)
alias mn='$SRC'
$MARKER_END
EOF
  else
    cat <<EOF
$MARKER_BEGIN
# micro-notes-cli — ensure $PREFIX on PATH
if [ -d "$PREFIX" ]; then
  case ":\$PATH:" in
    *":$PREFIX:"*) ;;
    *) PATH="$PREFIX:\$PATH" ;;
  esac
  export PATH
fi
$MARKER_END
EOF
  fi
}

rc_block_fish() {
  if [[ "$MODE" == "alias-only" ]]; then
    cat <<EOF
$MARKER_BEGIN
# micro-notes-cli
alias mn='$SRC'
$MARKER_END
EOF
  else
    cat <<EOF
$MARKER_BEGIN
# micro-notes-cli
if test -d "$PREFIX"
  fish_add_path -m "$PREFIX"
end
$MARKER_END
EOF
  fi
}

remove_rc_block() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  if ! grep -qF "$MARKER_BEGIN" "$file" 2>/dev/null; then
    return 0
  fi
  info "removing block from $file"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] strip markers in $file"
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  # portable: awk between markers exclusive
  awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
    $0 == b { skip=1; next }
    $0 == e { skip=0; next }
    !skip { print }
  ' "$file" >"$tmp"
  # drop trailing extra blank lines introduced? keep as-is
  mv -f "$tmp" "$file"
}

install_rc_block() {
  local file="$1"
  local block="$2"
  local dir
  dir="$(dirname "$file")"
  [[ -d "$dir" ]] || run "mkdir -p \"$dir\""

  if [[ -f "$file" ]] && grep -qF "$MARKER_BEGIN" "$file" 2>/dev/null; then
    info "updating block in $file"
    remove_rc_block "$file"
  else
    info "adding block to $file"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] append block → $file"
    return 0
  fi

  # ensure file exists
  touch "$file"
  # blank line before block if file non-empty and doesn't end with nl blank
  if [[ -s "$file" ]]; then
    printf '\n' >>"$file"
  fi
  printf '%s\n' "$block" >>"$file"
}

# ── uninstall ───────────────────────────────────────────────────────
do_uninstall() {
  info "uninstalling mn"
  if [[ -e "$PREFIX/mn" || -L "$PREFIX/mn" ]]; then
    # only remove if ours (symlink to repo or regular file named mn)
    if [[ -L "$PREFIX/mn" ]]; then
      local target
      target="$(readlink "$PREFIX/mn" 2>/dev/null || true)"
      log "remove symlink $PREFIX/mn → $target"
    else
      log "remove $PREFIX/mn"
    fi
    run "rm -f \"$PREFIX/mn\""
  else
    log "no binary at $PREFIX/mn"
  fi

  if [[ -d "$SHARE_DIR" ]]; then
    info "remove share dir $SHARE_DIR"
    run "rm -rf \"$SHARE_DIR\""
  fi

  # keep config by default? remove lang file if only lang key — remove whole config dir if ours
  if [[ -f "$CONFIG_FILE" ]]; then
    info "remove config $CONFIG_FILE"
    run "rm -f \"$CONFIG_FILE\""
    # remove empty config dir
    if [[ -d "$CONFIG_DIR" ]] && [[ -z "$(ls -A "$CONFIG_DIR" 2>/dev/null || true)" ]]; then
      run "rmdir \"$CONFIG_DIR\" 2>/dev/null || true"
    fi
  fi

  local rc
  while IFS= read -r rc; do
    [[ -n "$rc" ]] || continue
    remove_rc_block "$rc"
  done < <(detect_rcs)

  info "done — open a new shell (or: source ~/.zshrc)"
  exit 0
}

[[ "$UNINSTALL" -eq 1 ]] && do_uninstall

# ── install binary ──────────────────────────────────────────────────
info "micro-notes-cli installer"
log "repo:   $ROOT"
log "mode:   $MODE"
log "prefix: $PREFIX"

# language: prompts on stderr; only the code is captured on stdout
SELECTED_LANG="$(pick_language)"
case "$SELECTED_LANG" in
  en) ;;
  *) die "failed to resolve language (got: ${SELECTED_LANG//$'\n'/ | })" ;;
esac
log "lang:   $SELECTED_LANG"

write_lang_config "$SELECTED_LANG"

SELECTED_PACK="$(pick_status_pack)"
case "$SELECTED_PACK" in
  generic|ai-dev) ;;
  *) die "failed to resolve status pack (got: ${SELECTED_PACK//$'\n'/ | })" ;;
esac
log "pack:   $SELECTED_PACK"
write_pack_config "$SELECTED_PACK"
# Persist repo root so `mn ui` finds the blink TUI after install --link / copy from repo
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] write root=$ROOT to $CONFIG_FILE"
else
  mkdir -p "$CONFIG_DIR"
  tmp_root="$(mktemp)"
  wrote_root=0
  if [[ -f "$CONFIG_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == root=* ]]; then
        if [[ $wrote_root -eq 0 ]]; then
          printf 'root=%s\n' "$ROOT"
          wrote_root=1
        fi
      else
        printf '%s\n' "$line"
      fi
    done <"$CONFIG_FILE" >"$tmp_root"
  else
    : >"$tmp_root"
  fi
  if [[ $wrote_root -eq 0 ]]; then
    printf 'root=%s\n' "$ROOT" >>"$tmp_root"
  fi
  mv -f "$tmp_root" "$CONFIG_FILE"
  info "root: $ROOT → $CONFIG_FILE"
fi
install_locales

if [[ "$MODE" != "alias-only" ]]; then
  run "mkdir -p \"$PREFIX\""
  case "$MODE" in
    copy)
      info "copying bin/mn → $PREFIX/mn"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log "[dry-run] install -m 755 $SRC $PREFIX/mn"
      else
        # replace prior symlink/install; `install` errors if SRC and dest are the same file
        if [[ -e "$PREFIX/mn" || -L "$PREFIX/mn" ]]; then
          if [[ "$PREFIX/mn" -ef "$SRC" ]]; then
            log "already present (same file as $SRC) — leaving in place"
          else
            rm -f "$PREFIX/mn"
            install -m 755 "$SRC" "$PREFIX/mn"
          fi
        else
          install -m 755 "$SRC" "$PREFIX/mn"
        fi
      fi
      ;;
    link)
      info "symlink $PREFIX/mn → $SRC"
      run "rm -f \"$PREFIX/mn\""
      run "ln -s \"$SRC\" \"$PREFIX/mn\""
      ;;
  esac
fi

# ── PATH / alias in shell rc ────────────────────────────────────────
need_rc=0
if [[ "$MODE" == "alias-only" ]]; then
  need_rc=1
elif [[ "$FORCE_RC" -eq 1 ]]; then
  need_rc=1
elif ! path_has_prefix; then
  need_rc=1
  warn "$PREFIX is not on PATH in this shell"
else
  # still ensure future shells if marker missing in primary rc
  primary=""
  case "$(basename "${SHELL:-zsh}")" in
    zsh)  primary="$HOME/.zshrc" ;;
    bash) primary="$HOME/.bashrc" ;;
    fish) primary="$HOME/.config/fish/config.fish" ;;
    *)    primary="$HOME/.profile" ;;
  esac
  if [[ -n "$primary" ]] && ! grep -qF "$MARKER_BEGIN" "$primary" 2>/dev/null; then
    # PATH works now but might be from another tool — still add idempotent block
    # only if PREFIX not already exported in that file as bare path string
    if ! grep -qF "$PREFIX" "$primary" 2>/dev/null; then
      need_rc=1
      log "PATH ok now, but $primary has no $PREFIX — will add block for new shells"
    else
      log "PATH already includes $PREFIX (found in $primary)"
    fi
  else
    log "PATH already includes $PREFIX"
  fi
fi

if [[ "$need_rc" -eq 1 ]]; then
  local_rcs=()
  while IFS= read -r rc; do
    [[ -n "$rc" ]] || continue
    local_rcs+=("$rc")
  done < <(detect_rcs)

  # prefer writing to the primary interactive rc only (avoid double PATH)
  primary=""
  case "$(basename "${SHELL:-zsh}")" in
    zsh)  primary="$HOME/.zshrc" ;;
    bash) primary="$HOME/.bashrc" ;;
    fish) primary="$HOME/.config/fish/config.fish" ;;
    *)    primary="$HOME/.profile" ;;
  esac

  targets=("$primary")
  # if primary doesn't exist, create it; also patch other existing rcs that lack marker
  # keep it simple: only primary unless --force-rc and multiple shells detected
  if [[ "$FORCE_RC" -eq 1 ]]; then
    targets=("${local_rcs[@]}")
  fi

  for rc in "${targets[@]}"; do
    [[ -n "$rc" ]] || continue
    if [[ "$rc" == *.fish ]]; then
      block="$(rc_block_fish)"
    else
      block="$(rc_block_posix)"
    fi
    install_rc_block "$rc" "$block"
  done
fi

# ── verify ──────────────────────────────────────────────────────────
info "verify"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] skip verify"
  exit 0
fi

# current shell may already have PATH
export PATH="$PREFIX:$PATH"
if [[ "$MODE" == "alias-only" ]]; then
  if [[ -x "$SRC" ]]; then
    log "alias target ok: $SRC ($("$SRC" --version))"
  fi
else
  if [[ -x "$PREFIX/mn" ]]; then
    log "binary:  $PREFIX/mn"
    log "version: $("$PREFIX/mn" --version)"
    log "lang:    $(MN_LANG= "$PREFIX/mn" lang 2>/dev/null | head -1 || echo "$SELECTED_LANG")"
  else
    die "binary missing after install"
  fi
fi

# hash lookup
if command -v mn >/dev/null 2>&1; then
  log "command: $(command -v mn)"
else
  warn "mn not found via command -v yet (PATH in this process may be stale)"
fi

cat <<EOF

✓ install complete  (lang=$SELECTED_LANG)

  Try now:
    hash -r 2>/dev/null; mn --version
    mn help
    mn show           # one-shot card
    mn ui             # blink TUI (needs npm install in repo)

  Or open a new terminal tab.

  Herdr pane:
    mn watch

  Uninstall:
    $ROOT/install.sh --uninstall

  Dev (live updates from repo):
    $ROOT/install.sh --link --lang $SELECTED_LANG
EOF
