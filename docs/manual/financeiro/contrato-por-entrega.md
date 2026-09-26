---
titulo: Contrato por entrega e previsão de recebimento
descricao: Contrato de cliente cobrado por entrega — parcelas em percentual ligadas a marcos do cronograma —, a previsão de recebimento no fluxo de caixa e como faturar cada parcela.
resumo: No Jurídico, o contrato de cliente pode cobrar por data ou por entrega. Por entrega, cada parcela é um percentual ligado a um marco do cronograma (ou à assinatura); enquanto não é faturada, aparece só na projeção de caixa como previsão, com a data do marco. O financeiro fatura a parcela quando a entrega acontece.
tags: [contrato, contrato por entrega, parcela, marco, previsão de recebimento, fluxo de caixa, projeção de caixa, faturar, contas a receber, cronograma]
palavras-chave: [contrato por entrega, contrato por data, condição de pagamento, parcela por marco, previsão do cronograma, projeção de caixa, faturar parcela, conta a receber, na assinatura, trazer da proposta, parcelas a faturar, marco concluído]
sinonimos: [medição por entrega, cobrança por marco, recebimento previsto, faturamento por etapa]
---

# Contrato por entrega e previsão de recebimento

## Objetivo

Cobrar o cliente **quando a entrega acontece**, e não numa data fixa: cada parcela do contrato é uma
**fatia do valor** ligada a um **marco do cronograma** do projeto ("40% na entrega do projeto
básico"). Enquanto a entrega não acontece, o dinheiro aparece no **fluxo de caixa** como **previsão**,
na data do marco — e some da previsão no dia em que o financeiro **fatura**.

## Quando utilizar

- Contrato de cliente com pagamento **por marcos de entrega** (assinatura, básico, executivo…).
- Para o financeiro **enxergar quando o dinheiro deve entrar**, mesmo antes de cobrar.

Para pagamento em parcelas mensais fixas, continue usando **Por data** (o jeito de sempre).

## Como acessar

- Menu → **Jurídico** → contrato de cliente → botão **Pagamento** (`juridico:gerir`). O diálogo
  **Condição de pagamento** tem dois jeitos, e **um só por contrato**:
  - **Por data** — número de parcelas e 1º vencimento; as parcelas mensais nascem como contas a
    receber quando o contrato é **assinado**.
  - **Por entrega (marcos)** — o que esta página descreve.
- A previsão aparece em **Financeiro → Fluxo de caixa** (projeção de 8 semanas) e no painel gerencial.

## Montar o plano por entrega

No diálogo, escolha **Por entrega (marcos)** e adicione as parcelas:

| Campo | O que é |
| --- | --- |
| **Parcela** | A descrição ("Entrega do projeto básico") |
| **%** | A fatia do valor do contrato, maior que 0 e até 100 |
| **Quando** | **Na assinatura** ou um **marco** do cronograma do projeto do contrato |
| **Valor** | Calculado: valor do contrato × %. A **última parcela absorve o centavo**, então a soma é exata |
| **Situação** | O que aconteceu com a parcela no financeiro (veja abaixo) |

- **Trazer da proposta** copia as parcelas do plano de pagamento da proposta que originou o contrato
  (aparece quando o plano está vazio). Depois, ligue cada uma a um marco.
- A **soma precisa fechar 100%**; a tela mostra **Soma 100%** ou o quanto falta/sobra. Dá para **salvar
  rascunho** que ainda não fecha — mas sem 100% **nenhuma previsão nasce**.
- Os **marcos** vêm do cronograma do projeto do contrato. Contrato **sem projeto** só aceita **Na
  assinatura**.
- Passar para **Por entrega** limpa as parcelas por data; definir parcelas **Por data** tira o
  contrato do por entrega. **Nunca os dois** no mesmo contrato.
- O contrato precisa ter **valor**.

## A previsão de recebimento

Com o contrato **assinado**, cada parcela **ainda não faturada** ganha uma **previsão**:

- **Na assinatura** — na **data da assinatura**;
- **Marco** — na **data do marco no cronograma**, e **só com o cronograma aprovado**. Se o marco
  andar (a coordenação replaneja, a duração muda), a previsão **anda junto**. Cronograma em
  rascunho: as parcelas de marco ficam esperando.

Casos em que a parcela fica **sem previsão**, sempre com o motivo na tela:

- o **plano não fecha 100%** (e as previsões que já existiam **saem**, para nenhuma data velha ficar no
  caixa);
- o **marco foi apagado** do cronograma — a parcela fica **sem data** ("Marco apagado — escolha") e
  não vira cobrança na hora; escolha outro marco ou **Na assinatura**;
- o marco **não está no cronograma**.

**Situação da parcela**, na tabela: *sem previsão* · *previsão 10/11* · *faturada · vence 20/11* ·
*recebida* · *cobrança cancelada*.

### A previsão não é conta a receber

Esta é a regra que protege o financeiro de cobrar quem nunca foi faturado. A previsão do cronograma:

- **entra** na **projeção de caixa** (com o subtotal "Inclui R$ X de previsão do cronograma"), no
  **resultado previsto do projeto** (a aba Financeiro do projeto mostra "+ R$ X previsto", destacando a
  parte "de previsão do cronograma") e no indicador **Receita prevista** do painel inicial;
- **não entra** em **Contas a receber**, no **aging**, no **alerta de inadimplência**, no **resumo do
  cliente**, no **Livro caixa** (Lançamentos) nem na **conciliação**;
- **não pode ser recebida, editada, cancelada nem excluída** pelo financeiro — a tentativa diz: "É uma
  previsão do cronograma… ela anda com o marco e vira cobrança quando a parcela é faturada no
  contrato".

**Previsão atrasada.** Se a data da previsão já passou e a parcela não foi faturada (marco atrasado, ou
assinatura antiga), ela **continua na projeção, na primeira semana**, e a tela avisa quanto "já
passou da data sem ser faturado". Sem isso ela sumiria de todas as telas — a previsão não aparece no
aging.

## Faturar a parcela

Quando a entrega acontece, o financeiro **fatura** a parcela (quem tem `financeiro:gerir`), por dois
caminhos que fazem a mesma coisa:

- **Financeiro → Contas a pagar e receber → aba A receber → cartão Parcelas a faturar.** A lista traz
  todas as parcelas de contrato por entrega ainda não faturadas — cliente, contrato, parcela, marco,
  previsão e valor —, com o **marco concluído** no topo, seguido das parcelas **na assinatura**, das
  **sem marco** (marco apagado: escolha outro no contrato) e das que **aguardam o marco**. O cartão só
  aparece quando há o que faturar.
- **Jurídico → Pagamento** do contrato assinado, botão **Faturar** na linha.

Em qualquer dos dois:

1. escolha o **vencimento** da cobrança e clique em **Confirmar faturamento**;
2. a **previsão vira conta a receber** — a **mesma linha**, agora com o vencimento escolhido —, e passa
   a valer para Contas a receber, aging, inadimplência e conciliação;
3. sem previsão (cronograma em rascunho, marco sem data), a conta a receber é **criada** direto.

- **Faturar de novo** a mesma parcela é recusado ("já foi faturada").
- Depois de faturar **qualquer** parcela, o **plano trava**: ajustes vão pelos lançamentos.
- O valor é sempre o **calculado** pelo plano — não se digita.

**Aviso automático.** Quando o **marco** de uma parcela é **concluído** no cronograma (**Atualizar
tarefa**), quem gere o financeiro recebe a notificação **"Marco concluído — parcela a faturar"**, que
leva à lista **Parcelas a faturar**. O marco **nunca fatura sozinho**. Dá para desligar em
**Preferências → Parcelas a faturar**.

## Cobrança lançada à mão

Quando a nota sai por outro caminho e a receita é lançada direto no financeiro, o sistema procura a
previsão daquela parcela e **casa** as duas: a parcela passa a apontar para a cobrança lançada, e a linha
de previsão sai do caixa — nada conta duas vezes. Depois disso, **Faturar** naquela parcela é recusado
("já existe cobrança").

O casamento é conservador de propósito, porque errar apaga a previsão de uma parcela que ninguém faturou:

| Exige | Por quê |
| --- | --- |
| **Mesmo valor, ao centavo** | Dinheiro não se casa por aproximação |
| **Vencimento a até 45 dias** | Mais longe que isso é outra parcela, ou outro acerto |
| **Uma única candidata** | Duas parcelas do mesmo valor e mesma distância: o sistema avisa e não escolhe |

Fora do casamento: **despesa**, receita **sem projeto**, lançamento **recorrente** (não é parcela de
entrega) e lançamento que entra **aguardando aprovação**. Quando não casa, a tela mostra o motivo na hora.

## Permissões

| Ação | Permissão |
| --- | --- |
| Definir o plano (por data ou por entrega) | `juridico:gerir` |
| **Faturar** a parcela | `financeiro:gerir` |
| Ver a previsão no fluxo de caixa | `financeiro:ver` |
| Concluir o marco que dispara o aviso | `cronograma:executado` |

## Regras de negócio

- **Um jeito por contrato**: por data **ou** por entrega.
- **O contrato manda na cobrança do projeto**: enquanto houver contrato por entrega em vigor, o botão
  **Gerar parcelas** do card **Receita / Contrato** do projeto fica desabilitado (a cobrança sairia
  duas vezes). Veja [Projetos](../projetos/projetos.md).
- **Plano precisa fechar 100%** para gerar previsão; o valor de cada parcela sai da **mesma regra** da
  proposta composta (a última absorve o centavo).
- **Previsão ≠ conta a receber**: ela conta como receita **prevista** (projeção de caixa, resultado do
  projeto e indicador do painel), mas não é cobrança.
- **Faturar converte a mesma linha**; previsão e cobrança nunca somam juntas.
- **Marco apagado** = parcela sem data, nunca cobrança imediata.
- **Contrato rescindido ou ainda não assinado** não gera previsão.

## Funcionalidades relacionadas

- [Jurídico](../gestao/juridico.md) · [Contas a pagar e receber](contas-e-aging.md) ·
  [Visão geral](visao-geral.md) · [Planejamento](../projetos/planejamento.md) ·
  [Preferências](../sistema/preferencias.md)

## FAQ

**A previsão não aparece no fluxo de caixa.** Confira se o contrato está **assinado**, se o plano
**fecha 100%**, se a parcela tem **marco** (ou é "Na assinatura") e, para parcela de marco, se o
**cronograma está aprovado**. O diálogo mostra o motivo quando falta algo.

**Por que a previsão não aparece em Contas a receber?** Porque ainda não é uma cobrança. Ela vira conta
a receber quando você **fatura** a parcela.

**Emiti a cobrança por outro caminho (lancei a receita à mão).** O sistema **casa sozinho**: ao criar uma
receita **do projeto** com o **mesmo valor** (ao centavo) e vencimento próximo, ela assume a parcela e a
previsão sai do caixa — a tela avisa com qual parcela casou. Se não casar (valor diferente, duas parcelas
iguais, vencimento muito distante), a tela diz por quê e você resolve pela tela do contrato: **faturar** a
parcela é o que converte a previsão.

**O marco andou e a previsão não mudou.** O cronograma precisa estar **aprovado**; a previsão
acompanha a data que o cronograma calcula a cada mudança. Se foi um feriado novo que moveu o marco,
clique em **Reagendar** no cronograma.

**Não consigo Gerar parcelas na aba Financeiro do projeto.** O projeto tem contrato **por entrega** em
vigor: a cobrança vem do contrato. Rescinda o contrato, ou use o diálogo **Pagamento** dele.

**O botão Faturar não aparece.** O contrato precisa estar assinado, a parcela não pode ter sido
faturada (nem estar recebida), o diálogo precisa estar em **Por entrega**, e você precisa de
`financeiro:gerir`.

**Não vejo o cartão Parcelas a faturar em Contas a receber.** Ele só aparece para quem tem
`financeiro:gerir` e quando há parcela de contrato por entrega **assinado** ainda não faturada. Parcela
com valor "—" está com o plano sem fechar 100% ou o contrato sem valor: ajuste no Jurídico.
