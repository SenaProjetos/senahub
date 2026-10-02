---
titulo: Extrato por conta
descricao: Saldo corrido de uma conta bancária no mês, com o que já foi conciliado e a conferência com o saldo do banco.
resumo: Escolha uma conta e um mês e veja saldo inicial, entradas, saídas e saldo final, linha a linha com saldo corrido e a conciliação à vista; o saldo informado no OFX é conferido com o do sistema.
tags: [financeiro, extrato, conta bancária, saldo, conciliação, ofx]
palavras-chave: [extrato por conta, saldo corrido, saldo inicial, saldo final, conciliado, falta conciliar, saldo do banco, lançamento sem conta]
sinonimos: [extrato bancário, razão da conta, movimento da conta]
---

# Extrato por conta

## Objetivo

Ver tudo o que entrou e saiu de **uma conta** num mês, com o saldo depois de cada movimento, e saber o que
já foi conferido com o extrato do banco.

## Como acessar

- Menu → **Financeiro** → **Movimentações** → **Extrato por conta** (`/financeiro/extrato`). Exige
  `financeiro:ver`. Também pelo item **Ver no extrato da conta** do menu de uma conta paga.

## O que a tela mostra

- **Conta** e **mês** (◀ ▶). O filtro **Mostrar** limita a Tudo, Conciliado ou Falta conciliar.
- **Saldo inicial do mês, Entradas, Saídas e Saldo no fim do mês** — e a conta fecha:
  saldo inicial + entradas − saídas = saldo final.
- A lista, pela **data do pagamento**, com **Entrada**, **Saída** e **Saldo** corrido, e se cada linha está
  **Conciliada** com o extrato do banco ou **Falta conciliar**. O valor é o **pago** (parcial, com desconto ou a mais),
  não o previsto.
- **Transferências entre contas próprias** aparecem (movem o saldo da conta) e são marcadas; não entram no resultado.
  O botão **Transferir entre contas** do cabeçalho cria uma; o menu da linha edita, estorna ou exclui a transferência inteira. Se a conta tem **data de saldo inicial**, o saldo parte dela (veja [Transferência, saldo inicial e corrigir pagamento](transferencias-e-correcoes.md)).
- **Conferência com o banco:** quando o último OFX importado do mês trouxe o saldo do banco, a tela compara com
  o saldo do sistema na mesma data — "confere" ou a diferença, que indica movimento a lançar ou conciliar.

## Lançamento sem conta

Lançamento realizado **sem conta** não é de nenhuma conta: fica fora de todos os extratos, e a tela avisa quantos
há no mês, com um botão para vê-los em Lançamentos. (No livro caixa, escolher uma conta também deixou de incluir os
lançamentos sem conta: eles têm a própria caixa "Sem conta".)

## Menu de ações

Botão direito (ou **⋯**) numa linha: **Ver o lançamento**, **Conciliar com o extrato…** (abre a Conciliação;
desabilitado se já está conciliado), **Copiar descrição** e **Estornar pagamento** (para quem gere o financeiro;
desabilitado, com o motivo, se conciliado ou de produção).

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver o extrato | `financeiro:ver` |
| Estornar | `financeiro:gerir` |
| Ir conciliar | `financeiro:conciliar` |

## Funcionalidades relacionadas

- [Contas e Aging](contas-e-aging.md) · [Conciliação](conciliacao-ofx.md) · [Lançamentos](lancamentos.md)
