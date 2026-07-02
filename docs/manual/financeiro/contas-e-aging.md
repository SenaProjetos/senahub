---
titulo: Contas a pagar e receber (e Aging)
descricao: Pendências financeiras por tipo, com filtros, e a análise de atraso (aging) por faixas.
resumo: Veja contas a pagar e a receber pendentes em abas, filtre e exporte; o aging agrupa os valores previstos por faixa de atraso e destaca os mais vencidos.
tags: [contas a pagar, contas a receber, aging, atraso, vencido, a vencer, pendências]
palavras-chave: [conta a pagar, conta a receber, aging, atraso, vencido, a vencer, faixa, inadimplência, pendência]
sinonimos: [pendências financeiras, AR, AP, cobranças]
---

# Contas a pagar e receber (e Aging)

## Objetivo

Acompanhar o que há **a pagar** e **a receber** (lançamentos previstos) e medir o
**atraso** por faixas.

## Como acessar

- Menu → **Financeiro** → **Contas a pagar e receber** (`/financeiro/contas`). Exige
  `financeiro:ver`.
- A tela abre em abas **Despesa** (a pagar) e **Receita** (a receber); o link aceita
  `?tab=receita`/`?tab=despesa`.

## O que a tela mostra

- Listas de pendências por tipo, com **filtros** e **exportação**.
- Ações de gestão (confirmar/baixar, editar) para quem tem `financeiro:gerir`.

## Aging (faixas de atraso)

O aging considera os lançamentos **previstos** de cada tipo, usando o **vencimento** (ou
a data, se não houver vencimento):

- **A vencer** — ainda dentro do prazo.
- **Vencido** — agrupado por faixas de dias de atraso (ex.: 1–30, 31–60, 61–90, 91–120,
  120+).
- **Top vencidos** — os 5 itens com maior atraso.

O painel financeiro exibe o aging consolidado e um **alerta** quando há valor vencido.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver contas e aging | `financeiro:ver` |
| Confirmar/editar contas | `financeiro:gerir` |

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Visão geral](visao-geral.md) · [Relatórios](relatorios.md)

## FAQ

**O aging conta o que já foi pago?** Não — só os **previstos** (em aberto). Ao confirmar,
a conta sai do aging.

**Qual data o aging usa?** O **vencimento**; se não houver, usa a data do lançamento.
