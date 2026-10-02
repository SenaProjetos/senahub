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

- Menu → **Financeiro** → **Contas** (`/financeiro/contas`). Exige `financeiro:ver`.
- A tela tem duas abas: **Em aberto** (o que vence) e **Pagas e recebidas** (o que já saiu ou entrou).
  Dentro de "Em aberto", as abas **Despesa** (a pagar) e **Receita** (a receber); o link aceita
  `?tab=receita`/`?tab=despesa`.

## Aba "Pagas e recebidas"

- Mostra os lançamentos já realizados do mês, pela **data do pagamento**, com o valor previsto e o valor
  pago (parcial, com desconto ou a mais), a conta e se está **conciliado** com o extrato do banco.
- Filtros: **Pagas / Recebidas / Todas**, mês (◀ ▶), busca por descrição ou projeto e **Conciliadas / Sem
  conciliar**. Os totais acompanham o filtro: pago no mês, recebido no mês, quantas faltam conciliar e
  quanto foi pago a mais ou a menos que o previsto.
- Botão direito (ou **⋯**) em cada linha: **Detalhes**, **Ver no extrato da conta**, **Copiar descrição** e,
  para quem gere o financeiro, **Estornar pagamento** (desabilitado, com o motivo, quando já está conciliado
  ou quando é pagamento de produção — esse se estorna na tela de Produção).
- Transferência entre contas próprias não aparece aqui (não é conta paga nem recebida); ela está no
  [Extrato por conta](extrato-por-conta.md).

## O que a tela mostra

- Listas de pendências por tipo, com **filtros** e **exportação**.
- Ações de gestão (confirmar/baixar, editar) para quem tem `financeiro:gerir`.
- **Parcelas a faturar** (aba **A receber**, para quem tem `financeiro:gerir`): as parcelas de
  [contrato cobrado por entrega](contrato-por-entrega.md) que ainda são só previsão, com o botão
  **Faturar**. Ao faturar, a parcela vira uma conta a receber comum, nesta mesma lista.
- **Só cobranças.** A **previsão de recebimento** de um
  [contrato cobrado por entrega](contrato-por-entrega.md) **não aparece aqui** (nem no aging): ela só
  vira conta a receber quando a parcela é **faturada** no contrato.

## Prioridade, confiança e caixinha

Três informações a mais em cada conta em aberto, usadas pelo [Planejador de caixa](planejador.md):

- **Prioridade** (só contas a pagar): P1 não pode atrasar · P2 importante · P3 negociável · P4
  adiável. Sem prioridade escolhida, vale a da categoria (ex.: Folha CLT e Impostos são P1).
- **Confiança** (só contas a receber): Confirmada pelo cliente · Provável · Estimada · Incerta. Conta a
  receber faturada nasce **Provável**; quando o cliente confirma, use **Marcar como confirmada pelo
  cliente** no menu da conta — ou selecione várias e marque todas pela barra de baixo.
- **Caixinha** (só contas a pagar em aberto): **Pagar pela caixinha** liga a conta a uma
  [caixinha](caixinhas.md); ao pagar, o reservado cai junto com o caixa.

Confiança não é situação: uma conta "confirmada pelo cliente" continua **em aberto** até ser recebida.

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
**editar**, mudar a **prioridade** ou a **confiança**, **pagar pela caixinha**, abrir os **anexos** e
**copiar a descrição**. Marque várias contas para **quitar todas de
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
