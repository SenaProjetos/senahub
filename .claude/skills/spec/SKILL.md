---
name: spec
description: Escreve plano de implementação datado em docs/superpowers/plans seguindo o padrão da casa. Use antes de trabalho não-trivial, para registrar decisões e fases.
disable-model-invocation: true
---

# Novo plano / spec

Arquivo: `docs/superpowers/plans/AAAA-MM-DD-<slug-kebab>.md`, com a **data real de hoje**.

## Ler antes de escrever

- `docs/HANDOFF.md` — estado do projeto e log de decisões (snapshot até Onda 5 + Estúdio v1).
- O plano mais recente do mesmo domínio em `docs/superpowers/plans/` — para não
  contradizer decisão já tomada.
- `CLAUDE.md` — arquitetura e gotchas.

## Estrutura

1. **Contexto** — o que existe hoje, com referências `arquivo.ts:linha`.
2. **Problema** — a dor concreta. Não escrever abstração; escrever o que dá errado hoje.
3. **Decisões** — cada escolha com a **alternativa descartada e o porquê**.
   É a parte que tem valor daqui a seis meses.
4. **Modelo de dados** — delta do Prisma. Marcar explicitamente se exige
   **migração** e/ou **`db:seed`** (inclusive no deploy).
5. **Fases** — F0..Fn. Cada fase entregável e verificável sozinha.
   Se alguma fase pede modelo de IA diferente, dizer qual e **parar** ao chegar nela.
6. **Permissões** — `recurso:ação` novos + quais papéis enxergam + impacto no
   `nav-config.ts`.
7. **Testes** — o que vira `*.test.ts` puro vs. o que exige smoke (`scripts/smoke-*.ts`)
   vs. o que só dá para conferir no browser.
8. **Fora de escopo** — explícito. Evita expansão silenciosa depois.

## Ao concluir

Marcar o plano como implementado no próprio arquivo. O repo usa commit
`docs(<escopo>): marca plano de X como implementado`.
