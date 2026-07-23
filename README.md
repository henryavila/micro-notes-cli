# micro-notes-cli

CLI de **microNote** no terminal — card de reentrada humana ao trabalhar com vários agentes (Herdr, multi-worktree, multi-app).

```text
  ▶ ready · 14:32

  💬 Fio      webhooks Paddle — idempotency
  → Agora     à espera de review
  ☐ Validar   npm test -- webhook
```

## Estado

**Planeamento.** Ver [PLAN.md](./PLAN.md).

## Ideia em 10 segundos

| Artefacto | Serve |
|-----------|--------|
| Handoff de sessão | o **agent** retomar |
| Dashboard / Herdr sidebar | **routing** (quem está blocked) |
| **microNote (`mn`)** | **tu** saberes o fio e o que validar |

Ficheiro por worktree: **`MICRONOTE.md`** (não usamos `STATUS.md`).

## Comandos (alvo)

```bash
mn                 # ver card (cores + símbolos)
mn watch           # pane lateral Herdr
mn +               # menu — sem decorar comandos
mn fio "…"
mn agora "…"
mn validar "…"
mn estado ready    # idle|working|blocked|ready
mn humano "…"
mn check
```

## Install

Ainda não. Após Fase 1:

```bash
# previsto
./install.sh
# ou
cp bin/mn ~/.local/bin/mn
```

## Docs

- [PLAN.md](./PLAN.md) — decisões, UX de cores/símbolos, fases, riscos

## License

MIT (a adicionar na Fase 0).
