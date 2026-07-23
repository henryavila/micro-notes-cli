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

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'ok  %s\n' "$*"; }

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
pass "show content"

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

printf '\nall tests passed\n'
