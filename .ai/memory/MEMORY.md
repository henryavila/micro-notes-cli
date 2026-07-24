# micro-notes-cli — memória do projeto

Índice curto (<200 linhas). Detalhes em ficheiros de tópico.

## Tópicos

| Ficheiro | Conteúdo |
|----------|----------|
| [product-surface.md](./product-surface.md) | Secções, teclas TUI, clear, Finished, packs |

## Regras rápidas

- Secções canónicas: Thread · **Description** · Now · Wait · Todo · Finished
- Human removido; Validate/Need/Closed só migração/aliases
- Teclas: `d` description · `f` finished · `c` clear · backspace del todo · `v` todo
- Install: `pack=` em `~/.config/mn/config` é sticky (reinstall mantém)
- Não commitar: `MICRONOTE.md` local, `cfg-status/`
- blink-tui: npm `@henryavila/blink-tui@^0.2.2` (Footer `maxRows=2`, `align=columns`)
- PLAN.md é STALE — fonte: SCHEMA-v0.1.md + README.md
- App version: `1.0.0` (`package.json` + `bin/mn` `MN_VERSION`)
