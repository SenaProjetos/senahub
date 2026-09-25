---
titulo: Contas a pagar e receber (e Aging)
descricao: Pendências financeiras por tipo, com filtros, e a análise de atraso (aging) por faixas.
resumo: Veja contas a pagar e a receber pendentes em abas, filtre e exporte; o aging agrupa os valores previstos por faixa de atraso e destaca os mais vencidos.
tags: [contas a pagar, contas a receber, aging, atraso, vencido, a vencer, pendências, previsão de recebimento]
palavras-chave: [conta a pagar, conta a receber, aging, atraso, vencido, a vencer, faixa, inadimplência, pendência, previsão do cronograma, parcela faturada]
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
- **Só cobranças.** A **previsão de recebimento** de um
  [contrato cobrado por entrega](contrato-por-entrega.md) **não aparece aqui** (nem no aging): ela só
  vira conta a receber quando a parcela é **faturada** no contrato.

## Aging (faixas de atraso)

O aging considera os lançamentos **previstos** de cada tipo, usando o **vencimento** (ou
a data, se não houver vencimento):

- **A vencer** — ainda dentro do prazo.
- **Vencido** — agrupado por faixas de dias de atraso (ex.: 1–30, 31–60, 61–90, 91–120,
  120+).
- **Top vencidos** — os 5 itens com maior atraso.

O painel financeiro exibe o aging consolidado e um **alerta** quando há valor vencido.

## Menu de ações e seleção em lote

Em cada conta, o botão direito (ou o botão **⋯**) oferece quitar (**Receber** ou **Pagar**),
**editar**, abrir os **anexos** e **copiar a descrição**. Marque várias contas para **quitar todas de
uma vez** pela barra da parte de baixo da tela; se alguma falhar, o resultado diz qual e por quê.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver contas e aging | `financeiro:ver` |
| Confirmar/editar contas | `financeiro:gerir` |

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Visão geral](visao-geral.md) · [Relatórios](relatorios.md)

## FAQ

**Cadê a parcela do contrato por entrega?** Enquanto não é faturada, ela é só **previsão** — aparece
no **Fluxo de caixa**, não aqui. Fature a parcela no diálogo **Pagamento** do contrato e ela entra em
Contas a receber. Ver [Contrato por entrega](contrato-por-entrega.md).

**O aging conta o que já foi pago?** Não — só os **previstos** (em aberto). Ao confirmar,
a conta sai do aging.

**Qual data o aging usa?** O **vencimento**; se não houver, usa a data do lançamento.
