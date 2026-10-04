---
titulo: Financeiro — Sócios, pró-labore e compromissos recorrentes
descricao: Cadastrar saídas que se repetem (pró-labore, aluguel, folha), distribuir e adiantar lucros aos sócios e entender como o fechamento da folha CLT define o valor da conta do mês.
resumo: Compromisso recorrente é o cadastro de uma saída mensal; o planejador projeta os meses futuros e o sistema gera a conta a pagar perto do vencimento. Distribuição e adiantamento de lucros viram contas a pagar por sócio, fora da DRE. Fechar a folha define o valor real da conta da competência, que vence no mês seguinte; pagar é outro passo.
tags: [financeiro, sócios, pró-labore, compromissos recorrentes, recorrência, distribuição de lucros, adiantamento de lucros, folha clt, retiradas]
palavras-chave: [compromisso recorrente, pró-labore, programado, gerar o que já venceu, vincular à recorrência, em dobro, distribuir lucros, adiantar lucros, percentual do sócio, fora do resultado, fechar folha, valor real da folha, quinto dia útil, dia útil, sábado dia útil, prazo do salário, mês seguinte, adiantamento de salário, reabrir folha, retiradas antigas]
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

O **cadastro** de uma saída mensal: descrição, valor por mês, quando vence, primeira e, se houver, última
competência, categoria, prioridade, caixinha que paga e, para pró-labore, o **sócio**.

### Quando vence

- **Conta o dia como**: **Dia do mês** (ex.: dia 10; mês mais curto cai no último dia) ou **Dia útil do
  mês** (ex.: 5º dia útil). Dia útil é de segunda a sexta, sem os feriados cadastrados no RH. **Na categoria Folha
  CLT o sábado também conta**, como manda o prazo do salário: com Finados numa segunda-feira, o 5º dia útil de
  novembro/2026 é o sábado 07/11 (para uma conta comum seria a segunda 09/11). O banco não processa no sábado: pague
  até a sexta.
- **Vence**: **No mês da competência** ou **No mês seguinte**. A folha de setembro, por exemplo, é da
  competência de setembro e vence no 5º dia útil de outubro.
- **É adiantamento de salário**: marque no compromisso do adiantamento (ex.: dia 20, no próprio mês). É
  outra conta da mesma competência da folha, e fechar a folha nunca mexe nela.

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

## Folha CLT: fechar define o valor, pagar é outro passo

Configure a folha como compromisso recorrente: **Dia útil do mês**, dia **5**, **Vence no mês seguinte**.
Se houver adiantamento, cadastre outro compromisso marcado como **adiantamento de salário**.

**Fechar a folha** em **RH → Folha** grava o **valor real** (o líquido dos holerites) na conta a pagar da
competência. A conta **continua em aberto** até ser paga no Financeiro (baixa ou conciliação):

- Se a recorrência já gerou a conta do mês, o fechamento usa essa mesma conta, com o valor real, em vez
  de criar uma segunda despesa. A mensagem diz de quanto para quanto o valor mudou.
- Se ainda não há conta, o fechamento cria uma, ligada à recorrência (o sistema não gera o mês de novo),
  vencendo no dia da recorrência ou, sem recorrência, no 5º dia útil do mês seguinte.
- Se a conta do mês **já foi paga**, nada novo nasce: a mensagem mostra a diferença a acertar, se houver.
- O **adiantamento de salário** nunca é usado: o holerite já o desconta do líquido.
- Só a folha **mensal** usa a conta da competência. A do **13º** é outra despesa, com folha própria no
  mesmo mês.
- Conta **aguardando aprovação** não recebe o valor (passaria por cima da aprovação): fica em aberto e
  entra no aviso.
- Se houver **duas** contas sem vínculo no mês, o sistema **não escolhe**: cria a conta da folha e avisa
  quais ficaram em aberto, para alguém conferir se não é a mesma folha duas vezes.
- **Reabrir a folha** não apaga nem muda a conta (o fechamento seguinte grava o valor certo). Com a
  conta **já paga**, reabrir é recusado: estorne o pagamento no Financeiro antes.

## Erros possíveis e soluções

| Mensagem | Causa | Solução |
| --- | --- | --- |
| "Os percentuais dos sócios ativos somam X%…" | A soma não é 100% | Ajuste os percentuais em Cadastros → Sócios |
| "Esta lista virou só histórico…" | Tentativa de criar retirada no registro antigo | Use Distribuir/Adiantar lucros ou o compromisso recorrente |
| Aviso "possível … em dobro" no planejador | Lançamento manual do mesmo mês sem vínculo | **Vincular à recorrência** |
| "Dia útil vai do 1º ao 23º." | Dia útil maior que os que um mês tem | Use um dia útil de 1 a 23 |
| "A folha já foi paga no Financeiro: estorne o pagamento antes de reabrir." | Reabrir folha com a conta paga | Estorne o pagamento da conta no Financeiro e reabra |

## Funcionalidades relacionadas

- [Planejador de caixa](planejador.md) · [Caixinhas](caixinhas.md) · [Relatórios](relatorios.md) · [Folha CLT](../rh-ponto/folha-clt.md)

## FAQ

**Por que o pró-labore de daqui a 3 meses não aparece em Contas a pagar?** Porque ainda é só
programado. Ele aparece na projeção do planejador e vira conta perto do vencimento.

**A distribuição de lucros diminui o lucro da DRE?** Não. Ela sai do caixa, mas não é despesa.
