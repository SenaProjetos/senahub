---
titulo: Financeiro — Sócios, pró-labore e compromissos recorrentes
descricao: Cadastrar saídas que se repetem (pró-labore, aluguel, folha), distribuir e adiantar lucros aos sócios e entender como a folha CLT quita o previsto do mês.
resumo: Compromisso recorrente é o cadastro de uma saída mensal; o planejador projeta os meses futuros e o sistema gera a conta a pagar perto do vencimento. Distribuição e adiantamento de lucros viram contas a pagar por sócio, fora da DRE. Fechar a folha quita a conta prevista da competência.
tags: [financeiro, sócios, pró-labore, compromissos recorrentes, recorrência, distribuição de lucros, adiantamento de lucros, folha clt, retiradas]
palavras-chave: [compromisso recorrente, pró-labore, programado, gerar o que já venceu, vincular à recorrência, em dobro, distribuir lucros, adiantar lucros, percentual do sócio, fora do resultado, fechar folha, quitar previsto, reabrir folha, retiradas antigas]
sinonimos: [despesas fixas, contas recorrentes, retiradas dos sócios, lucros]
---

# Financeiro — Sócios, pró-labore e compromissos recorrentes

## Objetivo

Fazer as saídas que se repetem e as retiradas dos sócios aparecerem **no caixa e na projeção**, sem
lançar nada duas vezes.

## Compromissos recorrentes

### Onde

**Financeiro → Cadastros → Compromissos recorrentes** (`financeiro:gerir`).

### O que é

O **cadastro** de uma saída mensal: descrição, valor por mês, dia do vencimento (mês mais curto cai no
último dia), primeira e, se houver, última competência, categoria, prioridade, caixinha que paga e, para
pró-labore, o **sócio**.

### Como funciona

1. Enquanto um mês não tem conta a pagar, ele aparece no [Planejador](planejador.md) como **Programado**:
   conta na projeção, mas **não** aparece em Contas a pagar.
2. Perto do vencimento (o campo **Gerar quantos dias antes**), o sistema cria a conta a pagar de
   verdade, uma por mês, todos os dias às 6h. No menu do compromisso, **Gerar o que já venceu** faz isso na
   hora.
3. A partir daí a conta segue o fluxo normal: pagar, conciliar.

Mudar o valor do compromisso vale **só para os meses ainda não gerados**.

### Lançamento feito à mão

Se alguém lançou o mês à mão (ex.: pró-labore na categoria 2.08 com o sócio), o planejador avisa
**"possível … em dobro"** e oferece **Vincular à recorrência**. Vinculado, vale o **valor do lançamento**;
a diferença para o cadastro vira aviso, nunca correção automática.

## Pró-labore × distribuição de lucros

| | Pró-labore | Distribuição / adiantamento de lucros |
| --- | --- | --- |
| O que é | Remuneração mensal do sócio pelo trabalho | Parte do lucro entregue ao sócio |
| Entra na DRE? | **Sim**, é despesa | **Não**, fica fora do resultado |
| Sai do caixa? | Sim | Sim (no DFC, como financiamento) |
| Onde se faz | Compromissos recorrentes | Cadastros → Sócios |

### Distribuir e adiantar lucros

Em **Cadastros → Sócios**:

- **Distribuir lucros** — informe o total e a data. O sistema divide pelo **percentual de cada sócio
  ativo** e cria **uma conta a pagar por sócio**. A prévia mostra a divisão, centavo a centavo (o centavo
  que sobra fica com o último sócio).
- **Adiantar lucros** — uma conta a pagar para um sócio só.
- Os percentuais dos sócios ativos precisam somar **100%**: o sistema recusa e diz a soma, em vez de
  ajustar sozinho (um cadastro errado ficaria escondido).

### Retiradas antigas

A lista de retiradas dentro de cada sócio virou **histórico**: aqueles registros nunca viraram conta a
pagar, então não entram no caixa nem na DRE. Retirada nova sai pelos botões acima ou pelo compromisso
recorrente. Ainda dá para remover um registro antigo errado.

## Folha CLT quita o previsto do mês

Quando o compromisso recorrente da folha já gerou a conta a pagar do mês, **fechar a folha** em
**RH → Folha** **quita essa conta** com o valor real, em vez de criar uma segunda despesa:

- A mensagem do fechamento diz que quitou e, se o valor real for diferente do previsto, a diferença.
- Só a folha **mensal** quita. A do **13º** é outra despesa, com folha própria no mesmo mês.
- Conta **aguardando aprovação** não é quitada (seria pagar por cima da aprovação) — ela fica em aberto e
  entra no aviso.
- Se houver **duas** contas previstas sem vínculo no mês, o sistema **não escolhe** uma: cria a despesa
  da folha e avisa quais ficaram em aberto, para alguém conferir se não é a mesma folha duas vezes.
- **Reabrir a folha** devolve a conta ao previsto, com o valor de antes. Só a despesa que o fechamento
  criou é apagada.

## Erros possíveis e soluções

| Mensagem | Causa | Solução |
| --- | --- | --- |
| "Os percentuais dos sócios ativos somam X%…" | A soma não é 100% | Ajuste os percentuais em Cadastros → Sócios |
| "Esta lista virou só histórico…" | Tentativa de criar retirada no registro antigo | Use Distribuir/Adiantar lucros ou o compromisso recorrente |
| Aviso "possível … em dobro" no planejador | Lançamento manual do mesmo mês sem vínculo | **Vincular à recorrência** |

## Funcionalidades relacionadas

- [Planejador de caixa](planejador.md) · [Caixinhas](caixinhas.md) · [Relatórios](relatorios.md) · [Folha CLT](../rh-ponto/folha-clt.md)

## FAQ

**Por que o pró-labore de daqui a 3 meses não aparece em Contas a pagar?** Porque ainda é só
programado. Ele aparece na projeção do planejador e vira conta perto do vencimento.

**A distribuição de lucros diminui o lucro da DRE?** Não. Ela sai do caixa, mas não é despesa.
