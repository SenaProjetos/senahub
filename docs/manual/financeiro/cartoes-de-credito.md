---
titulo: Cartões de crédito e cartão pessoal
descricao: Compras no cartão viram despesa no dia da compra, e o caixa só sai quando a fatura é paga. O cartão pessoal do sócio gera o reembolso que a empresa deve.
resumo: Cadastre o cartão com o dia de fechamento e o de vencimento, lance as compras (à vista ou parceladas) e pague a fatura inteira na conta escolhida; no cartão pessoal do sócio a fatura é o reembolso, que pode ser pago de uma vez ou despesa por despesa.
tags: [financeiro, cartão de crédito, fatura, reembolso, sócio, parcelamento]
palavras-chave: [cartão de crédito, fatura, pagar fatura, cartão pessoal, reembolso ao sócio, compra parcelada, fechamento do cartão, vencimento da fatura]
sinonimos: [cartão corporativo, fatura do cartão, reembolso de despesa, cartão da empresa]
---

# Cartões de crédito e cartão pessoal

## Objetivo

Registrar o que foi pago no cartão sem errar nem a DRE nem o caixa: a **despesa é do dia da compra**,
o **dinheiro sai no dia do pagamento da fatura**.

## Como acessar

- Menu → **Financeiro** → **Movimentações** → **Cartões de crédito** (`/financeiro/cartoes`).
- Ver exige `financeiro:ver`. Cadastrar cartão, lançar compra e pagar fatura exigem `financeiro:gerir`.

## As três regras

1. **A compra é despesa no dia da compra**, com a categoria, o centro e o projeto dela. Ela aparece na
   DRE por competência no mês da compra.
2. **O caixa só sai no pagamento da fatura.** Antes disso, nada saiu da conta.
3. **Pagar a fatura não cria despesa nova.** Pagar *realiza* as compras daquele ciclo — se o sistema
   criasse um lançamento "pagamento da fatura", o gasto contaria duas vezes.

## Cadastrar um cartão

**Novo cartão** pede nome, últimos quatro dígitos, **de quem é** (da empresa ou pessoal de um sócio),
**dia de fechamento**, **dia de vencimento** e a conta que costuma pagar. O cartão da empresa também
aceita um **limite**, que serve só para a barra de limite usado.

> Os dias vão de **1 a 28**, para existirem em todo mês — inclusive fevereiro.

O ciclo funciona como no banco: comprou até o dia do fechamento, a compra entra na fatura que fecha
naquele mês; comprou depois, vai para a do mês seguinte. A fatura vence no dia escolhido do **mês
seguinte ao fechamento**.

## Lançar uma compra

**Lançar compra** pede descrição, valor total, data da compra, categoria e, se for o caso, o número de
**parcelas**. Centro de custo, projeto e fornecedor são opcionais.

- **Parcelada:** uma despesa por fatura. A parcela 2/3 é despesa do mês seguinte e entra na fatura
  daquele ciclo, já com a categoria e o projeto preenchidos. O centavo que sobra fica na última parcela.
- O quadro cinza do formulário diz, antes de salvar, em qual fatura a compra entra e quando ela vence.

## Pagar a fatura

Na tela da fatura, **Pagar fatura** pede a conta e a data. Saem da conta, de uma vez, o total das
compras em aberto daquele ciclo.

- A fatura **aberta** não se paga: ela ainda pode receber compras. O botão fica desligado com o motivo.
- Nesta versão **não há pagamento parcial de fatura**.
- A conciliação do extrato (OFX) não casa o pagamento da fatura sozinha, porque no banco ele é uma
  transação só contra várias compras. Depois de pagar pelo sistema, use **Ignorar** naquela transação.

## Cartão pessoal do sócio

Quando a empresa usa o cartão pessoal de um sócio, a tela fala em **reembolso**:

- a despesa entra na DRE no dia da compra, **sem sair do caixa**;
- o valor se acumula na **fatura do sócio** daquele ciclo, com vencimento;
- no vencimento, **Reembolsar** paga tudo de uma vez;
- ou, no menu de cada despesa, **Reembolsar só esta** paga uma por vez — o resto continua na fatura.

No planejador de caixa, cada fatura aparece como **uma** saída no vencimento ("Reembolso a Lúcio —
outubro/2026"), não como várias saídas soltas no mesmo dia.

## Menu de cada linha (botão direito ou `...`)

- **No cartão:** ver fatura, lançar compra, editar, deixar inativo, excluir (só enquanto não houver
  nenhuma compra — depois disso, deixe inativo para guardar o histórico).
- **Na fatura:** ver compras, pagar/reembolsar, ver no planejador.
- **Na compra:** reembolsar só esta (cartão pessoal), editar, criar regra a partir desta compra,
  estornar (se já paga) e excluir. Compra já paga não se edita nem se exclui: estorne antes.

## Perguntas frequentes

**O cartão aparece em Cadastros → Contas?** Não. Cartão não é conta bancária: ele não entra no saldo
de caixa nem no Extrato por conta. O que entra na conta é o pagamento da fatura.

**Mudei a data de uma compra e ela sumiu da fatura.** Ela foi para a fatura do ciclo da nova data — é
assim que o cartão funciona.

**Estornei uma compra de uma fatura paga.** A fatura volta a aparecer como "Fechada · a pagar", porque
voltou a ter compra em aberto.

**A compra passa por aprovação?** Não: a despesa do cartão já aconteceu, e travá-la em aprovação só
atrasaria o pagamento da fatura. A revisão é a fatura.
