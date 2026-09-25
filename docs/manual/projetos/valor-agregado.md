---
titulo: Valor Agregado (VP, VA, CR, IDP e IDC)
descricao: O quadro que mostra se o projeto está adiantado ou atrasado, e gastando mais ou menos do que o previsto, contra a linha de base.
resumo: O Valor Agregado compara o que a linha de base previa pronto (VP), o que foi realmente concluído (VA) e o que foi gasto (CR) na Data de Status. Sai em horas para quem coordena e em R$ para quem vê o financeiro, com os índices IDP (prazo) e IDC (custo).
tags: [valor agregado, evm, vp, va, cr, idp, idc, cota, cotr, crtr, linha de base, data de status, apuração, índice de desempenho]
palavras-chave: [valor agregado, EVM, VP, VA, CR, IDP, IDC, ENT, VNT, COTA, COTR, CRTR, valor planejado, custo real, índice de desempenho de prazo, índice de desempenho de custo, apuração, data de status, estimativa no término]
sinonimos: [earned value, análise de valor agregado, EVM, desempenho do projeto, cota cotr crtr]
---

# Valor Agregado (VP, VA, CR, IDP e IDC)

## Objetivo

Responder, em números, duas perguntas sobre um projeto na **Data de Status**: **estamos adiantados ou
atrasados?** e **estamos gastando mais ou menos do que o orçado?** — medindo tudo contra a **linha de
base** aprovada. É o mesmo raciocínio dos campos de valor agregado do MS Project.

## Quando utilizar

- Toda vez que você **apurar** o cronograma (botão **Apurar**, em
  [Planejamento](planejamento.md)) — o quadro só faz sentido com uma Data de Status atual.
- Para acompanhar a **tendência** ao longo das apurações.

## Como acessar

- Em **Planejamento** → projeto, o quadro **Valor Agregado** aparece abaixo do cronograma.
- Ele precisa de duas coisas; sem elas o próprio quadro diz o que falta:
  1. **Cronograma aprovado** (a linha de base é a régua);
  2. **Data de Status** definida.

## Os números

| Nome | No MS Project | O que é |
| --- | --- | --- |
| **Orçamento (ONT)** | Orçamento no término | Tudo o que a linha de base previa, somando as atividades |
| **Planejado até a data (VP)** | COTA | Quanto da linha de base deveria estar **pronto** até a Data de Status |
| **Agregado (VA)** | COTR | Quanto do orçamento foi **de fato concluído**: o orçamento de cada atividade × o % concluído informado |
| **Real (CR)** | CRTR | O que foi **gasto** até a Data de Status |
| **IDP** — prazo | IDP | **VA ÷ VP**. Abaixo de 1, o que foi feito está **atrás** do que a linha de base previa |
| **IDC** — custo | IDC | **VA ÷ CR**. Abaixo de 1, o avanço está **custando mais** do que o orçado |
| **Estimativa no término (ENT)** | Estimativa no término | **Orçamento ÷ IDC**: quanto o projeto custará se o ritmo de custo se mantiver |
| **Variação no término (VNT)** | Variação no término | **Orçamento − ENT**. Negativo = vai estourar |

Os índices ficam **verdes** a partir de 1,00, **amarelos** de 0,90 a 0,99 e **vermelhos** abaixo de
0,90. Passe o mouse sobre o nome de cada linha para ver a explicação.

**Exemplo.** Orçamento de 100 h. Na Data de Status, a linha de base previa 50 h prontas (VP = 50) e o
projeto tem 40 h concluídas (VA = 40), tendo gasto 50 h (CR = 50). IDP = 40 ÷ 50 = **0,80** (20% atrás
do combinado) e IDC = 40 ÷ 50 = **0,80** (cada hora gasta rendeu 80% do previsto). ENT = 100 ÷ 0,80 =
**125 h**: no ritmo atual, faltam 25 h além do orçado.

## Duas colunas: Horas e R$

- **Horas** — para quem acompanha o cronograma. Orçamento = **horas previstas** congeladas na linha
  de base; real = **horas apontadas** no ponto.
- **R$** — **só para quem vê o financeiro**, porque usa o custo por hora de cada pessoa. Orçamento =
  **custo previsto** congelado na linha de base; real = horas apontadas × custo por hora de cada
  pessoa que apontou, a mesma base do orçamento.

O cálculo é o mesmo nas duas; só muda a régua.

## De onde vem cada número

- **Planejado (VP):** a barra de cada atividade **na linha de base** é espalhada **igualmente pelos
  dias úteis** dela (perfil uniforme, como no MS Project). Antes do início da barra, o planejado é
  zero; do término em diante, é o orçamento inteiro.
- **Agregado (VA):** o **% informado** na EAP **hoje**. O sistema não guarda o histórico do
  percentual — por isso é importante **apurar na data certa**: um % atualizado depois faz o VA daquela
  Data de Status parecer maior do que era.
- **Real (CR):** **todas as horas apontadas no projeto** até o fim da Data de Status, com ou sem
  tarefa escolhida (a tarefa no ponto é opcional).
- **Só as atividades contam.** As linhas de agrupamento da linha de base ficam fora da soma, senão o
  mesmo trabalho entraria duas vezes.

## O que o quadro avisa (e por quê)

- **"—" com motivo, nunca zero.** Se uma atividade da linha de base **não tem horas** (ou **não tem
  custo**: vaga sem pessoa, pessoa sem custo por hora, ou linha de base aprovada antes do custo
  previsto existir), a régua inteira fica **sem número** e diz o que completar — e **replanejar**
  gera uma nova linha de base. Um índice calculado sobre orçamento incompleto é pior que nenhum.
- **Alguém apontou horas sem custo por hora cadastrado:** o CR **em R$** fica desconhecido (as horas
  seguem somando). Cadastre o custo em [Recursos](recursos.md).
- **Atividade criada depois da linha de base:** o **avanço** dela não entra no VA, mas as **horas
  apontadas** nela entram no CR — o IDC fica menor do que é. **Replaneje** para incluí-la.
- **Atividade excluída depois da linha de base:** conta como **não feita**.

## O histórico de apurações

Cada vez que você clica em **Apurar**, o sistema **grava a apuração** daquela Data de Status; refazer
na **mesma** data atualiza o registro. A foto semanal automática só cria a apuração se a Data de
Status ainda não tiver uma — ela **nunca reescreve** uma data já fotografada. O quadro lista as
**Apurações anteriores** com IDP e IDC de cada uma (em R$ só para quem vê o financeiro), para você
ver a **tendência**.

## O que o Valor Agregado ainda não faz

- **A linha de base não se move** com as datas reais: é o combinado. As datas reais e a Data de Status
  movem a **previsão** do cronograma, mas o Valor Agregado mede contra a linha de base. A estimativa no
  término é só de **custo** (ENT/VNT) — ainda não há estimativa de **prazo** pelo ritmo observado.
- **Não conta o pagamento de PJ por entrega** no real. Quem não aponta horas (freelancer ou PJ pago
  por entrega) não aparece no CR; o que a empresa paga a ele está no financeiro
  ([Produção](../financeiro/producao.md)). Em projeto tocado principalmente por PJ, o IDC tende a
  parecer melhor do que é.
- **Mede contra a linha de base mais recente.** Depois de **replanejar**, a régua passa a ser a
  nova versão (BL-01, BL-02…).

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver o quadro (coluna de **horas**) | `planejamento:ver` |
| Ver a coluna de **R$** e os índices em R$ do histórico | acesso ao financeiro (`financeiro:ver` ou sócio) |
| **Apurar** (definir a Data de Status e gravar a apuração) | `cronograma:executado` |

## Funcionalidades relacionadas

- [Planejamento (EAP e cronograma)](planejamento.md) ·
  [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md) · [Recursos](recursos.md) ·
  [Ponto](../rh-ponto/ponto.md)

## FAQ

**O quadro diz "Aprove o cronograma".** O Valor Agregado mede contra a linha de base, que só existe
depois de **Aprovar cronograma**.

**O quadro diz "Defina a Data de Status".** Escolha a data e clique em **Apurar**, no quadro de saúde
do cronograma.

**A coluna de R$ não aparece.** Ela é só para quem vê o financeiro (é feita com o custo por hora das
pessoas).

**Por que o IDC está "—"?** Ainda não há horas apontadas até a Data de Status (não dá para dividir
por zero), ou o custo real em R$ está desconhecido por falta de custo por hora de alguém.

**Apurei e o resultado mudou depois.** O VA usa o % **de hoje**. Se a coordenação atualizou os
percentuais depois, reapure na mesma data para substituir a apuração, ou apure na data certa da
próxima vez.
