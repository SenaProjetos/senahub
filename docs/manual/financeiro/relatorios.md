---
titulo: Relatórios gerenciais do financeiro
descricao: DRE, DFC, fluxo de caixa, balanço gerencial, rentabilidade por projeto e orçamento anual.
resumo: Conjunto de relatórios gerenciais — DRE e indicadores, DFC por atividade, fluxo de caixa, balanço (base caixa), rentabilidade por projeto e orçamento planejado × realizado.
tags: [relatórios, dre, dfc, fluxo de caixa, balanço, rentabilidade, orçamento]
palavras-chave: [relatório, dre, dfc, fluxo de caixa, balanço gerencial, rentabilidade, margem, orçamento, planejado, realizado]
sinonimos: [demonstrativos, indicadores financeiros, gerenciais]
---

# Relatórios gerenciais do financeiro

## Objetivo

Apoiar a gestão com demonstrativos e indicadores construídos a partir dos lançamentos.

## Relatórios disponíveis

| Relatório | Rota | O que mostra |
| --- | --- | --- |
| **Relatórios / DRE** | `/financeiro/relatorios` | DRE e indicadores do período |
| **Rentabilidade** | `/financeiro/rentabilidade` | DRE e **margem por projeto** |
| **DFC** | `/financeiro/dfc` | Fluxo de caixa por **atividade** |
| **Fluxo de caixa** | `/financeiro/fluxo-caixa` | Saldos e movimentos |
| **Balanço gerencial** | `/financeiro/balanco` | Ativo, passivo e PL (**base caixa**) |
| **Orçamento anual** | `/financeiro/orcamento` | Planejado × realizado por categoria |

## Como acessar

- Pelos cartões de atalho do painel **Financeiro**. Exigem `financeiro:ver`.

## Conceitos

- **DRE** (Demonstração do Resultado): receitas − despesas = resultado, por período, com
  base nos lançamentos **confirmados**.
- **DFC** (Demonstração do Fluxo de Caixa): movimentos de caixa por atividade.
- **Base caixa:** considera o que efetivamente entrou/saiu (confirmado), não o
  provisionado.
- **Rentabilidade por projeto:** receita − custos atribuídos ao projeto → margem.

## Permissões

- Leitura dos relatórios: `financeiro:ver`.

## Funcionalidades relacionadas

- [Visão geral](visao-geral.md) · [Lançamentos](lancamentos.md) · [Contas e Aging](contas-e-aging.md)

## FAQ

**DRE e DFC usam previsto ou confirmado?** O resultado/DRE usa **confirmado** (realizado);
o aging/projeção usam **previsto**.

**O balanço é contábil?** É **gerencial**, em **base caixa** — não substitui a
contabilidade oficial.
