---
titulo: Financeiro — Visão geral e Meu extrato
descricao: Torre de controle do caixa (posição de hoje, saldo projetado, o que precisa de atenção) e o extrato pessoal de pagamentos.
resumo: O /financeiro mostra, para quem tem visão financeira, quanto há no caixa hoje, quanto está reservado e para onde o saldo vai no horizonte; para prestadores e clientes, mostra o "Meu extrato".
tags: [financeiro, painel, dashboard, torre de controle, saldo projetado, caixinhas, reserva mínima, dre, aging, extrato, previsão de recebimento]
palavras-chave: [financeiro, visão geral, painel, caixa atual, reservado, dinheiro livre, saldo projetado, provável, conservador, menor saldo, dias de caixa, déficit, precisa de atenção, meu extrato, pagamentos]
sinonimos: [dashboard financeiro, painel financeiro, torre de controle, extrato]
---

# Financeiro — Visão geral e Meu extrato

## Objetivo

Responder, numa tela só, **quanto dinheiro há hoje, quanto dele já tem destino e se o caixa aguenta
os próximos dias** — ou mostrar o **extrato pessoal** de pagamentos, para prestadores e clientes.

## Como acessar

- Menu → **Financeiro** (`/financeiro`).
- O conteúdo muda pelo seu acesso (ver [modelo de acesso](README.md#modelo-de-acesso-importante)).

## A) Torre de controle (visão completa)

Para quem tem `financeiro:ver` ou é sócio. Tudo aqui sai do **mesmo cálculo do
[Planejador de caixa](planejador.md)** — a Visão geral, o Fluxo de caixa e o Planejador nunca mostram
dois números diferentes para o mesmo caixa.

### Posição de hoje

- **Caixa atual = Reservado nas caixinhas + Dinheiro livre.** O caixa é o saldo das contas ativas, só
  com o que já foi pago ou recebido. O reservado é o que está nas [caixinhas](caixinhas.md) e ainda não
  foi usado. O livre é o resto.
- A barra mostra a proporção e marca a **reserva mínima** (o piso que o caixa não deveria cruzar).
- Se as caixinhas somarem mais do que o caixa, aparece **reserva descoberta** em vermelho.
- À direita, o **saldo por conta bancária** e o atalho para **Conciliar extratos**.

### Os cinco indicadores

| Indicador | O que diz |
| --- | --- |
| **Saldo projetado** no fim do horizonte | Caixa de hoje + entradas − compromissos, no cenário Provável |
| **Menor saldo do período** | O pior dia, e quanto ele fica acima (ou abaixo) da reserva mínima |
| **Pode sair sem romper a reserva** | Quanto ainda dá para gastar sem que algum dia caia abaixo da reserva. É a margem do **pior dia**, não do último |
| **Dias de caixa** | Por quantos dias o caixa atual paga as saídas no ritmo dos últimos 90 dias |
| **Déficit projetado** | Se e quando o saldo fica negativo; "Nenhum" quando não fica |

### Saldo projetado (gráfico)

Duas linhas, do dia de hoje até o fim do horizonte:

- **Provável** (linha cheia): conta as entradas **confirmadas pelo cliente** e as **prováveis**.
- **Conservador** (linha tracejada): conta só as entradas **confirmadas pelo cliente**.
- As duas contam **todas** as saídas. A faixa hachurada fica abaixo da reserva mínima.
- Passe o cursor sobre um dia, ou dê Tab no gráfico e use as setas, para ver os valores. **Ver dia a
  dia** abre o [Fluxo de caixa](fluxo-de-caixa.md) com a tabela.
- A **previsão do cronograma** (parcela de [contrato por entrega](contrato-por-entrega.md) ainda não
  faturada) **não entra** nas duas linhas: é dinheiro que ninguém faturou. Ela aparece em "Precisa de
  atenção", com o atalho **Incluir na simulação**.

### Precisa de atenção

Só o que pede uma decisão, do mais grave ao informativo: recebimentos e contas a pagar **vencidos**,
despesas **aguardando aprovação**, **caixinha** abaixo do que está comprometido, **recebimentos a
distribuir**, previsão do cronograma fora da linha, compromisso recorrente **lançado em dobro** e contas
a receber **sem confiança marcada** (contam como Provável até alguém marcar). Cada aviso tem o atalho
para resolver.

### Caixinhas e próximos 7 dias

- **Caixinhas:** reservado de cada uma contra o que ela precisa cobrir.
- **Próximos 7 dias:** o que o cenário Provável vai pagar e receber, com a prioridade (P1 a P4) ou a
  confiança de cada item. Vencidos aparecem primeiro.

### Abaixo da torre

O **resultado do período** (receita, despesa e resultado, com o seletor de mês, trimestre ou ano), os
gráficos de resultado mensal e despesas por subcategoria, a DRE do período, o **aging** e os cartões de
atalho para as demais telas. Quem tem `financeiro:gerir` vê ainda **Pagamentos em lote**, **Fechamento
mensal**, **Importar** e **Configurações**.

## B) Meu extrato (prestadores e clientes)

Para quem tem **só** `financeiro:extrato`:

- **Resumo:** Total, Recebido, Em aberto.
- **Lista de pagamentos** por **entregas validadas** (disciplina + projeto), com valor e status (pago /
  pendente). Disciplina paga [por fase](../projetos/etapas-e-pagamento-por-fase.md) aparece com a sigla da
  fase ("Elétrica · BS"), uma linha por fase.
- Um pagamento **pago** mostra também a **data** e a **forma** de pagamento (pix, TED etc.) e os
  **anexos** do lançamento. A **conta bancária da empresa** não aparece.

## Regras de negócio

- Caixa e resultado usam só o que já foi **pago ou recebido**. A projeção usa só o que está **em aberto**.
- Transferência entre contas da empresa não é entrada nem saída: muda só em que conta o dinheiro está.
- Distribuição e adiantamento de lucros saem do caixa, mas **não** são despesa na DRE.

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| Caio em "sem permissão" | Sem `ver`, `gerir` nem `extrato` | Solicitar acesso ao admin |
| Vejo só "Meu extrato" | Você tem apenas `financeiro:extrato` | Comportamento esperado para prestador/cliente |
| Reserva mínima aparece como R$ 0 | Ninguém definiu o piso ainda | Defina no [Planejador](planejador.md) (exige `financeiro:gerir`) |
| "Dias de caixa" sem número | Menos de 30 dias de histórico, ou nenhuma saída nos últimos 90 dias | O número aparece sozinho quando houver histórico |

## Funcionalidades relacionadas

- [Planejador de caixa](planejador.md) · [Caixinhas](caixinhas.md) · [Fluxo de caixa](fluxo-de-caixa.md) · [Contas e Aging](contas-e-aging.md) · [Relatórios](relatorios.md)

## FAQ

**Por que o saldo projetado não bate com o que eu somei de cabeça?** Confira se a conta que você somou
está em aberto (as pagas já estão no caixa de hoje) e qual a confiança das entradas: o Provável ignora
as estimadas e incertas.

**Por que uma parcela do cronograma não entra no gráfico?** Porque ainda não foi faturada. Use "Incluir
na simulação" no Planejador para ver o efeito dela.
