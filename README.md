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
cd /Volumes/External/code/micro-notes-cli   # ou o path do repo
./install.sh
```

No install, o idioma da UI é escolhido interativamente (**pt-BR** ou **en**).  
Não-interativo:

```bash
./install.sh --lang pt-BR
./install.sh --lang en
# ou: MN_LANG=en ./install.sh
```

O que o installer faz:

1. Pergunta (ou recebe) o idioma e grava em `~/.config/mn/config`
2. Copia `locales/` → `~/.local/share/mn/locales/`
3. Copia `bin/mn` → `~/.local/bin/mn` (ou symlink com `--link`)
4. Se `~/.local/bin` **não** estiver no PATH, acrescenta um bloco marcado no shell rc (`.zshrc` / `.bashrc` / fish)
5. Verifica `mn --version`

```bash
# opções
./install.sh                 # copy + PATH se preciso + prompt de idioma
./install.sh --lang pt-BR    # sem prompt
./install.sh --link          # symlink → repo (dev: git pull atualiza)
./install.sh --alias-only    # só alias no rc → path do repo (sem ~/.local/bin)
./install.sh --prefix DIR    # outro destino
./install.sh --force-rc      # reescreve o bloco no shell rc
./install.sh --dry-run
./install.sh --uninstall     # ou: ./uninstall.sh
```

Depois de instalar (se o PATH foi alterado):

```bash
source ~/.zshrc    # ou abre um terminal novo
mn --version
mn ajuda           # ou: mn help
mn lang            # idioma ativo
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
- **Não** usamos `STATUS.md` (colide com outras ferramentas)

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
| `mn path` | path do arquivo |
| `mn +` | menu (fzf ou select) |
| `mn ajuda` / `mn help` | ajuda |
| `mn lang [pt-BR\|en]` | ver / definir idioma da UI |

Atalhos: `f` fio · `a` agora · `v` validar · `e` estado · `h` humano · `x` fechar

Aliases EN: `thread` `now` `validate` `status` `human` `close` `done` `clear-validate`

## Idioma (UI)

| Prioridade | Fonte |
|------------|--------|
| 1 | `MN_LANG=pt-BR` ou `MN_LANG=en` |
| 2 | `~/.config/mn/config` (`lang=…`, definido no install) |
| 3 | `LANG` / `LC_ALL` do sistema |
| 4 | **pt-BR** (padrão) |

O formato do arquivo `MICRONOTE.md` (headings `## Fio`, etc.) é estável — só a UI muda de idioma.

```bash
mn lang en      # grava no config
mn lang pt-BR
MN_LANG=en mn   # override pontual
```

## Env

| Var | Efeito |
|-----|--------|
| `MN_FILE` | path do card |
| `MN_LANG` | `pt-BR` \| `en` (override do config) |
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
