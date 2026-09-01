# Planejamentos concluídos

Arquivo morto dos planos/specs cuja implementação foi **verificada no código** em 2026-08-30.
Nada aqui deve ser retomado sem antes conferir o relatório
[docs/PLANEJAMENTO-STATUS-2026-08-30.md](../PLANEJAMENTO-STATUS-2026-08-30.md).

Critério de entrada (os três oráculos usados na triagem):
1. **CHANGELOG/commits** — existe entrega com o escopo do plano;
2. **scripts/smokes** — existe `smoke:*` ou script de validação do escopo;
3. **artefato nomeado** — o model Prisma / rota / arquivo que o plano promete existe hoje.

> Marcação `⚠️ browser` = código completo e verificado por `tsc`/`test`/`lint`, mas a
> validação manual no navegador nunca foi confirmada pelo usuário.

## plans/

| Arquivo | Evidência que fechou |
|---|---|
| `2026-06-18-licitacoes-estrutural.md` | 12 subsistemas viraram pastas em `src/modules/licitacoes/` (eventos, viabilidade, pncp, sancoes, habilitacao, contrato, composicao, tecnico, dashboard, extras, config, modalidades); models `ViabilidadeLicitacao`, `IntegracaoPNCPLog`, `SancaoPropria`, `ContratoLicitacao`, `MedicaoLicitacao`; 46 commits de escopo `licitacoes`. Registrado em `HANDOFF.md` §Licitações F0–F11 |
| `2026-06-19-melhorias-m0-bugs.md` | correções presentes no código (ex.: `rejeitado` no mapa de cores e no filtro de `auditoria-tabela.tsx`) |
| `2026-06-19-melhorias-m1-0-primitivos.md` | `empty-state.tsx`, `confirm-dialog.tsx` (+`useConfirm`), `status-badge.tsx`, `Button loading` em `src/components/ui/` |
| `2026-06-19-melhorias-m1-1-moeda.md` | rollout completo: sobrou **1** `Intl.NumberFormat` no repo, dentro de `src/lib/moeda.ts` |
| `2026-06-23-ferramentas-f0.md` | módulo `ferramentas` com `registry.ts`, `calc/`, `savefile.ts`, `auto-store.ts` ⚠️ browser |
| `2026-06-23-ferramentas-f1.md` | `memoria/render-docx\|html\|xlsx`, `export-util.ts` ⚠️ browser (4 downloads) |
| `2026-06-23-termo-aceite.md` | `modules/legal/termos.ts`, `AceiteTermo`, rota `/termo`. Pendência remanescente é **jurídica** (revisão dos textos), não de engenharia |
| `2026-07-02-gerenciador-servidor-gui.md` | `deploy/gui/SenaHubManager` (+ `SenaHubManager.Tests` com 6 suítes) |
| `2026-07-05-documentos-fase5a-geral.md` | status do próprio plano: ✅ IMPLEMENTADA |
| `2026-07-27-art-crea-responsavel-tecnico.md` | models `Art`/`ArtVersao`, `modules/projetos/art/` |
| `2026-07-27-custos-c0-fundacao.md` | `modules/custos/` + models `CustoOrcamento*`, commit `9c0c2d5` |
| `2026-07-28-custos-c1-bancos.md` | `CustoImportacao`, `composicoes/importador-sinapi.ts`, validado com arquivo SINAPI real |
| `2026-07-28-custos-c2-orcamento.md` | `modules/custos/orcamento/`, `orcamento-arvore.ts`, commit `0223f85` |
| `2026-07-30-custos-c4-suprimentos.md` | models `CustoRfq`/`CustoRfqConvite`/`CustoProposta`, rota `/custos/cotacoes` ⚠️ browser |
| `2026-07-30-custos-orcamento-busca-banco-insumo.md` | entregue junto de C2/C4 ⚠️ browser |
| `2026-07-27-recalque-fundacao.md` | `calc/recalque-fundacao.ts` + teste + chave `recalque-fundacao` no `registry.ts` |
| `2026-07-31-banco-horas-saldo-incorreto.md` | Etapa 2 executada: `recalcularBancoHistorico` em `rh/banco/actions.ts` e `controlaJornada` em `ponto/queries.ts` |

## specs/

| Arquivo | Evidência |
|---|---|
| `2026-06-20-estudio-documentos-v2-design.md` | o próprio doc fecha com "Estúdio v2 concluído"; confirmado por `modules/documentos/**` |
| `2026-07-02-gerenciador-servidor-gui-design.md` | design do GUI já construído |
| `2026-07-24-crm-comercial-roadmap.md` | **SUPERSEDED** por `docs/crm/` (ADR do próprio doc) |
| `auditoria-modulo-licitacoes.md` | auditoria consumida pelo plano estrutural, já executado |
| `licitacoes-design-estrutural.md` | proposta que virou o plano `2026-06-18-licitacoes-estrutural.md`, executado |

## financeiro/

Cluster de 7 documentos do módulo financeiro. Fecha com
`relatorio-implementacao-financeiro.md`: *"spec + comparação totalmente cobertos, 12 seções
entregues, nenhuma pendência aberta"*. `auditoria-modulo-financeiro.md` afirmava
"Planejamento de Pagamentos ❌ INEXISTENTE" — **desatualizado**: hoje existem o model
`PlanejamentoPagamento` e a rota `/financeiro/planejamento`.

## projectfiles/

Sequência de prompts que **produziu** `docs/auditoria/01..06`. Os prompts foram consumidos;
o produto deles (a refatoração de Documentos) continua em `docs/auditoria/` e **ainda não terminou**.

## contas/

`acessos-credenciais-plan.md` — Fases 1–8 concluídas (2026-08-28 → 2026-08-30), `smoke:acessos`
no `package.json`. A **spec** (`docs/contas/specs/`) e o README ficaram no lugar: são referência viva do módulo.
