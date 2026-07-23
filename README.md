# micro-notes-cli

CLI de **microNote** no terminal — card de reentrada humana ao trabalhar com vários agentes (Herdr, multi-worktree, multi-app).

```text
  ▶ ready · 14:32 · wt-auth/MICRONOTE.md
  2 por validar

  💬 Fio
     webhooks Paddle — idempotency
  → Agora
     à espera de review
  ☐ Validar
     ☐  npm test -- webhook
     ☐  retry não duplica
  ✎ Humano
     não tocar em billing UI
  ✓ Fechado
     • descartámos Stripe
```

## Install

```bash
./install.sh
# → ~/.local/bin/mn
```

Ou:

```bash
cp bin/mn ~/.local/bin/mn && chmod +x ~/.local/bin/mn
```

## Quickstart

```bash
cd /path/to/worktree   # page Herdr
mn init
mn fio "webhooks Paddle — idempotency"
mn agora "a escrever testes"
mn validar "npm test -- webhook"
mn estado ready
mn                       # ver card
```

Pane lateral no Herdr:

```bash
mn watch
```

Sem decorar comandos:

```bash
mn +
```

## Ficheiro

- **`MICRONOTE.md`** na raiz do cwd (worktree)
- Override: `MN_FILE=/path/to/file.md`
- **Não** usamos `STATUS.md` (colide com outras tools)

## Comandos

| Comando | Efeito |
|---------|--------|
| `mn` / `mn show` | card com cores + símbolos |
| `mn watch [n]` | refresh a cada n s (default 1) |
| `mn init` | cria `MICRONOTE.md` |
| `mn fio "…"` | secção Fio |
| `mn agora "…"` | secção Agora |
| `mn validar "…"` | checkbox em Validar |
| `mn estado idle\|working\|blocked\|ready` | estado |
| `mn humano [--replace] "…"` | nota humana |
| `mn fechar "…"` | decisão fechada |
| `mn feito [n\|texto]` | marca validar como feito |
| `mn limpar-validar` | placeholder em Validar |
| `mn check` | estrutura ok? (exit 0/1) |
| `mn path` | path do ficheiro |
| `mn +` | menu (fzf ou select) |
| `mn ajuda` | ajuda |

Atalhos: `f` fio · `a` agora · `v` validar · `e` estado · `h` humano · `x` fechar

## Env

| Var | Efeito |
|-----|--------|
| `MN_FILE` | path do card |
| `MN_COLOR=0` / `NO_COLOR` | sem cor |
| `MN_ASCII=1` | símbolos ASCII |
| `MN_WATCH_INTERVAL` | segundos no watch |

## Estados (header)

| estado | símbolo | significado |
|--------|---------|-------------|
| idle | ○ | nada a fazer |
| working | ◉ | agent a trabalhar |
| blocked | ⛔ | precisa de ti |
| ready | ▶ | validar agora |

## Tests

```bash
bash tests/run.sh
```

## Design

Ver [PLAN.md](./PLAN.md).

## License

MIT
