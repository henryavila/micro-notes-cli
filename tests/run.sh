#!/usr/bin/env bash
# smoke tests for mn
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MN="$ROOT/bin/mn"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export MN_FILE="$TMP/MICRONOTE.md"
export MN_COLOR=0
export MN_ASCII=1
export MN_LOCALES_DIR="$ROOT/locales"
export MN_CONFIG_FILE="$TMP/mn-config"
export MN_CONFIG_DIR="$TMP"
# default tests in pt-BR
export MN_LANG=pt-BR

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'ok  %s\n' "$*"; }

# ── i18n: missing file message (pt-BR) ──────────────────────────────
out="$("$MN" show 2>&1 || true)"
printf '%s\n' "$out" | grep -q 'rode mn init' || fail "pt-BR missing file should say 'rode mn init' (got: $out)"
printf '%s\n' "$out" | grep -q 'corre ' && fail "should not use pt-PT 'corre'"
pass "i18n pt-BR no-file message"

# ── i18n: English ───────────────────────────────────────────────────
out="$(MN_LANG=en "$MN" show 2>&1 || true)"
printf '%s\n' "$out" | grep -q 'run mn init' || fail "en missing file should say 'run mn init' (got: $out)"
pass "i18n en no-file message"

# ── i18n: lang command ──────────────────────────────────────────────
lang_out="$("$MN" lang)"
printf '%s\n' "$lang_out" | grep -q 'pt-BR' || fail "lang should report pt-BR"
pass "lang inspect"

MN_LANG= "$MN" lang en >/dev/null
# config written; unset MN_LANG to use config
cfg_lang="$(grep '^lang=' "$MN_CONFIG_FILE" | head -1)"
[[ "$cfg_lang" == "lang=en" ]] || fail "config should be lang=en (got $cfg_lang)"
out="$(MN_LANG= "$MN" show 2>&1 || true)"
printf '%s\n' "$out" | grep -q 'run mn init' || fail "config en should apply to show"
# restore pt-BR for rest of suite
MN_LANG= "$MN" lang pt-BR >/dev/null
export MN_LANG=pt-BR
pass "lang set via config"

# init
"$MN" init >/dev/null
[[ -f "$MN_FILE" ]] || fail "init did not create file"
pass "init"

# show without crash
"$MN" show >/dev/null
pass "show empty-ish"

# check should fail (fio empty)
if "$MN" check >/dev/null 2>&1; then
  fail "check should fail with empty fio"
fi
pass "check fails empty fio"

# write fields
"$MN" fio "webhooks paddle" >/dev/null
"$MN" agora "a escrever testes" >/dev/null
"$MN" validar "npm test -- webhook" >/dev/null
"$MN" validar "retry nao duplica" >/dev/null
"$MN" estado ready >/dev/null
"$MN" humano "nao tocar billing" >/dev/null
"$MN" fechar "descartamos Stripe" >/dev/null

"$MN" check >/dev/null || fail "check should pass after fill"
pass "check after fill"

out="$("$MN" show)"
printf '%s\n' "$out" | grep -q "webhooks paddle" || fail "show missing fio"
printf '%s\n' "$out" | grep -q "npm test" || fail "show missing validar"
printf '%s\n' "$out" | grep -q "ready" || fail "show missing estado"
printf '%s\n' "$out" | grep -q "por validar" || fail "pt-BR badge missing"
pass "show content"

# English aliases
export MN_LANG=en
"$MN" thread "english thread" >/dev/null
grep -A2 '## Fio' "$MN_FILE" | grep -q 'english thread' || fail "en alias thread"
out="$("$MN" show)"
printf '%s\n' "$out" | grep -q "to validate" || fail "en badge missing"
export MN_LANG=pt-BR
pass "en aliases + badge"

# feito first open
"$MN" feito >/dev/null
grep -q '\- \[x\] npm test' "$MN_FILE" || fail "feito did not mark first item"
pass "feito"

# limpar-validar
"$MN" limpar-validar >/dev/null
grep -q '(nada ainda)' "$MN_FILE" || fail "limpar-validar"
pass "limpar-validar"

# path
p="$("$MN" path)"
[[ "$p" == "$MN_FILE" ]] || fail "path mismatch"
pass "path"

# shortcuts
"$MN" f "novo fio" >/dev/null
grep -A2 '## Fio' "$MN_FILE" | grep -q 'novo fio' || fail "shortcut f"
pass "shortcut f"

# version
ver="$("$MN" --version)"
[[ -n "$ver" ]] || fail "version empty"
pass "version $ver"

# replace humano
"$MN" humano --replace "so isto" >/dev/null
body="$(awk '/^## Humano$/{p=1;next} /^## /{p=0} p' "$MN_FILE")"
printf '%s\n' "$body" | grep -q 'so isto' || fail "humano replace"
if printf '%s\n' "$body" | grep -q 'nao tocar'; then
  fail "humano replace kept old"
fi
pass "humano --replace"

# blocked badge pt-BR
"$MN" estado blocked >/dev/null
out="$("$MN" show)"
printf '%s\n' "$out" | grep -q "precisa de você" || fail "blocked badge should be pt-BR 'você' not 'ti'"
printf '%s\n' "$out" | grep -q "precisa de ti" && fail "should not use pt-PT 'ti'"
pass "blocked badge pt-BR"

printf '\nall tests passed\n'
