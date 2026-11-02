# Lote 5b — Bombas (recalque e piscina)

Desenho: [../specs/2026-11-02-lote5b-bombas-design.md](../specs/2026-11-02-lote5b-bombas-design.md).
O dono pulou as perguntas em 02/11/2026; decisões marcadas no desenho.

## Tarefas

- [x] `calc/hidraulica.ts` + teste (Hazen-Williams, Forchheimer, PVC NBR 5648, potência, margem, motor comercial).
- [x] `calc/pump-recalque.ts` + teste (chave `bomba-recalque`).
- [x] `calc/pool-pump.ts` + teste (chave `bomba-piscina`).
- [x] Registry (`exigeValidacao: true`), `savefile`, `calcular()` e `montarMemoria()` no service, formulários
  (`pump-recalque-form.tsx`, `pool-pump-form.tsx`, comuns em `hidraulica-campos.tsx`), case em `ferramenta-view.tsx`.
- [x] Fichas em `docs/engenharia/validacao/bomba-recalque.md` e `bomba-piscina.md`.
- [ ] Guia ilustrado e manual (depois da validação).

## Decisões de execução (do agente)

- Chaves publicadas: `bomba-recalque`, `bomba-piscina` (nunca renomear). Campos do esquema em português, persistidos
  em `entradasJson`: não renomear.
- `calc/hidraulica.ts` é compartilhado: mudou fórmula ou tabela, incrementa `versaoCalc` das duas e valida de novo
  (dito nas duas fichas).
- Sem NPSH, sem curva de bomba, sem tabela de conexões: ficam como não-objetivos do 5b.

## Depende do engenheiro (não vai ao ar sem isso)

Tudo. Fichas: 6 h/dia, C = 140, η, limites de velocidade, margem de potência, lista de motores, diâmetros internos
do PVC, tempos de recirculação por uso, ausência de desnível no circuito da piscina.
