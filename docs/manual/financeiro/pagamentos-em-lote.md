---
titulo: Financeiro — Pagamentos em lote
descricao: Escolher quais contas a pagar cabem no saldo de agora, aprovar o lote e pagá-las de uma vez.
resumo: Um lote reúne contas a pagar em aberto, na ordem de pagamento, contra um saldo disponível; passa por rascunho, análise e aprovação e, executado, paga as contas marcadas pelo valor planejado.
tags: [financeiro, pagamentos em lote, lote, contas a pagar, executar pagamento, saldo disponível]
palavras-chave: [pagamentos em lote, lote, novo lote, saldo disponível, total planejado, saldo remanescente, cobertura, enviar para análise, aprovar, executar, cancelar lote, adicionar contas]
sinonimos: [planejamento de pagamentos, mesa de pagamentos, borderô]
---

# Financeiro — Pagamentos em lote

## Objetivo

**Executar** pagamentos: escolher, entre as contas a pagar em aberto, quais cabem no dinheiro disponível
agora, aprovar a escolha e pagar tudo de uma vez.

> Até setembro de 2026 esta tela se chamava **Planejamento de pagamentos**, e cada lote, "cenário".
> Para **decidir** (o que acontece se eu mudar datas e prioridades), use o
> [Planejador de caixa](planejador.md). Pagamentos em lote é o passo seguinte.

## Como acessar

**Financeiro → Mais → Pagamentos em lote** (`/financeiro/planejamento`), ou o botão **Pagamentos em lote**
no Planejador. Exige `financeiro:gerir`.

## Passo a passo

1. **Novo lote:** dê um nome, o saldo disponível e o filtro (vencimento de/até, conta bancária, centro de custo, projeto). As contas em
   aberto que caem no filtro entram como linhas.
2. **Mesa do lote:** arraste para mudar a ordem, marque o que entra, ajuste o valor de cada linha. Os
   indicadores mostram **saldo inicial**, **total planejado**, **saldo remanescente** e **cobertura**.
   Contas que ficaram de fora entram por **⋯ → Adicionar contas…**.
3. **Salvar**, depois **Enviar p/ análise**.
4. Quem aprova vê **Aprovar**. No **⋯** ficam **Voltar a rascunho** e, depois de aprovado, **Reabrir
   para análise**.
5. **Executar:** as linhas marcadas são pagas pelo valor planejado; se o valor for menor que a conta, o
   resto fica em aberto como nova conta (com a mesma prioridade, confiança e caixinha).
6. **⋯ → Cancelar o lote** (pede confirmação) libera as contas para outro lote.

## Situações do lote

Rascunho → Em análise → Aprovado → Executado. Cancelado em qualquer ponto antes de executar.

## Erros possíveis e soluções

| Mensagem | Causa | Solução |
| --- | --- | --- |
| "Só lotes aprovados podem ser executados." | O lote ainda está em rascunho ou análise | Envie para análise e aprove |
| "Lote executado não pode ser alterado." | Já foi pago | Crie outro lote |
| "Nenhuma conta em aberto fora deste lote." (Adicionar desabilitado) | Todas as contas já estão no lote | — |

## Funcionalidades relacionadas

- [Planejador de caixa](planejador.md) · [Contas e Aging](contas-e-aging.md) · [Aprovações](aprovacoes.md)
