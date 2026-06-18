# Análise verificada — sugestões do `comparação.md` × código atual

> Verificação item a item das melhorias propostas em `SENAHub_Modulo_Financeiro_comparação.md` (benchmark "Meu Dinheiro Web") contra a implementação real do SENAHub.
> Gerado em 2026-06-18. Complementa `auditoria-modulo-financeiro.md`.

**Conclusão geral:** o documento de comparação **superestima as lacunas** — boa parte das "melhorias sugeridas" já está implementada. As legendas abaixo:
- ✅ **Já feito** (doc sugere, mas existe)
- ⚠️ **Parcial** (existe base, falta parte)
- ❌ **Falta** (vale implementar)

## Já feito (não recriar)

| Sugestão do doc | Onde já existe |
|---|---|
| Botão Pagar/Receber inline na linha | `contas-pagar-receber-view.tsx` (`LinhaConta` → `confirmarRapido`) |
| Coluna de fornecedor/contato | idem |
| Filtro por valor mín/máx | idem |
| Agrupamento (categoria/contato/centro/mês) | idem (`agruparPor`) |
| Seleção múltipla + baixa em lote | idem (`LoteDialog` + `baixarEmLote`) |
| Toggle coluna Saldo / saldo acumulado | idem (`mostrarSaldo`, `renderComSaldo`) |
| Painel lateral: resultado do período + contas por tipo | idem |
| Badge de parcela (ex.: "4/60") | `parcela()` em ambas as views (deriva do texto da descrição) |
| Status com cor (pendente/agendado/aguardando/confirmado) | views de lançamentos e contas |
| Busca textual (descrição/contato/nº doc) | idem |
| Exportação XLSX/CSV/PDF(impressão) | `contas/export` + `imprimir()` |
| Tags em lançamentos | **backend pronto**: `Lancamento.tags` + action `salvarTagsLancamento` |
| Multi-conta com saldo individual/total | `fluxoCaixa()` |
| DFC 3 atividades, Balanço PL, Orçamento %realizado | `relatorios/queries.ts` + páginas |
| Conciliação OFX | módulo `conciliacao` |
| Alçada (aguardando aprovação) | módulo `aprovacao` |

## Genuinamente falta — alto valor, baixo risco (UI sobre dados existentes)

> Sem chart lib no projeto: gráficos são CSS/SVG à mão (padrão `resultado-mensal-chart.tsx`). Implementar assim, sem nova dependência.

| # | Item | Estado | Esforço |
|---|---|---|---|
| 1 | **Dashboard com KPIs**: cards DRE resumido, gráfico resultado do mês (barras), despesas por categoria (rosca), saldos por conta (confirmado/projetado), banner de vencimento | ❌ (hoje só aging + atalhos) | Médio |
| 2 | **DRE com AH% (horizontal) + AV% (vertical) + EBITDA** | ❌ (DRE plano) | Médio |
| 3 | **Gráfico de linha/área no Fluxo de Caixa** (saldo projetado) | ❌ (só tabela; dados já em `projecaoCaixa`) | Baixo |
| 4 | Relatórios: Comparação entre períodos, Totais por categoria (rosca), Evolução por categoria, Lançamentos por projeto | ❌ (tela = só DRE) | Médio |
| 5 | Tags na UI do livro-caixa (expor input/badge) | ⚠️ backend pronto | Baixo |
| 6 | Página de Configurações financeiro (data de competência, obrigatoriedade de campos, senha p/ exclusão) | ❌ | Médio |
| 7 | Badge de parcela derivado da recorrência (não só do texto) | ⚠️ | Baixo |
| 8 | Notificações de vencimento push/e-mail completas; múltiplos níveis de alçada | ⚠️ (há D+1 + resumo semanal) | Médio |

## Falta e é maior/estratégico (ver `auditoria-modulo-financeiro.md`)

Planejamento de Pagamentos, Fechamento Mensal, DRE por projeto + rankings/ROI/alertas, soft delete real, auditoria valor-anterior×novo. Exigem migração e/ou decisão de arquitetura.

## Plano aprovado

Implementar **pacotes 1–3** (dashboard KPIs + DRE AH/AV/EBITDA + gráfico de fluxo) — maior impacto diário, sem mexer no schema. Itens 4–8 ficam para frentes seguintes.

### Nota de modelagem (EBITDA)
O plano de contas não classifica linhas como resultado financeiro / D&A / tributos. O EBITDA é calculado como **resultado operacional gerencial** = receitas − despesas das categorias com `grupoDfc = "operacional"` (mesma classificação já usada no DFC; `null` conta como operacional). Rotulado como "EBITDA (gerencial)" na UI para deixar a aproximação explícita.
