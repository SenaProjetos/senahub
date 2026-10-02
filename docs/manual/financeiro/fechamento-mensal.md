---
titulo: Fechamento mensal
descricao: Consolidar o mês, fechar e travar os lançamentos dele, e conferir o saldo de cada conta com o extrato.
resumo: O fechamento consolida receita, despesa e produção do mês; fechar congela os números e o saldo das contas no último dia e trava os lançamentos do mês até alguém reabrir.
tags: [financeiro, fechamento, mês fechado, trava, saldo das contas, contador]
palavras-chave: [fechamento mensal, fechar mês, reabrir mês, mês fechado, trava, saldo no fim do mês, conferir extrato, retenções]
sinonimos: [fechar o mês, encerramento mensal, competência fechada]
---

# Fechamento mensal

## Objetivo

Consolidar os números do mês, entregá-los (ao contador, aos sócios) e garantir que não mudem depois sem
alguém reabrir o mês de propósito.

## Como acessar

- Menu → **Financeiro** → **Mais** → **Fechamento mensal** (`/financeiro/fechamento`). Exige
  `financeiro:fechar`.

## Como funciona

1. **Gerar** o mês: o sistema soma a receita e a despesa pagas no mês (fora transferências e
   distribuição de lucros) e a produção de projetistas, com as retenções pelas alíquotas atuais. É uma
   prévia: pode gerar de novo quantas vezes quiser.
2. **Fechar mês:** os números são recalculados na hora (o que valer é o mês como está agora) e ficam
   congelados, junto com o **saldo de cada conta no último dia** — confira com o extrato do banco.
3. **Reabrir:** destrava o mês. O saldo congelado sai e é tirado de novo no próximo fechamento.

## O que o mês fechado trava

Enquanto o mês está fechado, os lançamentos dele **não podem** ser:

- criados (inclusive uma recorrência que passe por ele);
- alterados no **valor, categoria, datas, conta, centro de custo ou projeto** (descrição, vencimento,
  observação, contato e prioridade continuam editáveis);
- pagos ou conciliados **com data no mês fechado**, estornados, cancelados, reabertos ou excluídos;
- importados por planilha, ou removidos desfazendo uma importação;
- alterados pelo fechamento da folha CLT daquela competência.

Uma conta **vencida** de um mês fechado continua podendo ser **paga num mês aberto** — o pagamento cai no
mês aberto e não muda o mês fechado. O extrato OFX importa as transações do mês fechado, mas não as concilia
sozinho.

## Permissões

| Ação | Permissão |
| --- | --- |
| Gerar, fechar, reabrir e excluir o fechamento | `financeiro:fechar` |

## Erros possíveis e soluções

| Mensagem | Causa | Solução |
| --- | --- | --- |
| "Março/2026 está fechado: reabra o mês em Fechamento mensal antes de mexer nos lançamentos dele." | A ação mexe em lançamento ou data de mês fechado | Quem tem `financeiro:fechar` reabre o mês, faz a correção e fecha de novo |
| "Mês já fechado. Reabra antes de regerar." | Gerar de novo um mês fechado | Reabrir antes |

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Conciliação](conciliacao-ofx.md) · [Relatórios](relatorios.md)
