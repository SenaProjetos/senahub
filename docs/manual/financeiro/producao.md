---
titulo: Produção (pagamento de projetistas)
descricao: Pagamento de projetistas PJ e freelancers pelas entregas validadas (da disciplina ou por fase), com comprovantes, recibos assinados, correção/estorno de pago, lotes mensais e alerta de parado.
resumo: Veja e pague os pagamentos de produção liberados por entrega, agrupados por projetista ou em tabela, com filtros, comprovante, recibo, rastreabilidade completa e exportação.
tags: [produção, folha de projetistas, pagamento, projetista, freelancer, lote, pj, pagamento por fase]
palavras-chave: [produção, folha de projetistas, pagamento de projetista, pagamento por fase, disciplina sigla, projetista pj, freelancer, lote mensal, pagar selecionados, conta obrigatória, comprovante, recibo, corrigir pagamento, estornar pagamento, conciliado, alerta parado, timbrado]
sinonimos: [folha de projetistas, pagamento de produção, folha pj]
---

# Produção (pagamento de projetistas)

## Objetivo

Pagar projetistas **PJ** e **freelancers** pelas entregas de disciplina já validadas —
cada entrega liberada (a disciplina inteira, ou **cada fase**, quando a disciplina tem etapas)
gera um pagamento pendente, que esta tela mostra, deixa corrigir quando necessário e efetiva no
caixa. Depois de pago, ainda dá para anexar o comprovante,
gerar um recibo assinável, corrigir um valor lançado errado ou estornar por engano.

CLT e estagiário não aparecem aqui: eles são remunerados pela folha de ponto, não por
entrega — ver [Folha de pagamento CLT](../rh-ponto/folha-clt.md).

## Como acessar

Menu → **Financeiro** → **Produção** (`/financeiro/folha-projetistas`). Exige a
permissão `financeiro:folha_pj`.

A tela tem duas abas:

- **Pagamentos** — os pagamentos individuais, liberados por entrega.
- **Lotes** — os mesmos pagamentos agrupados em lotes mensais, para pagar de uma vez.

## Aba Pagamentos

### Dois modos de leitura

Um alternador no topo da lista troca entre:

- **Por projetista** (padrão) — uma linha por pessoa, com o total pendente e um botão
  **Pagar tudo**; clique na linha para expandir e ver cada entrega dela.
- **Por pagamento** — tabela plana, uma linha por entrega, com ordenação por coluna e
  seleção múltipla para **Pagar selecionados**.

Os filtros e os 3 cartões de totais (A pagar / Pago / Cancelado) são os mesmos nos dois
modos — só a lista embaixo muda de formato.

### Filtros

Status (esconde cancelados por padrão — mude para "Todos" para vê-los), projetista,
projeto, **lote**, período de liberação, busca livre por projetista/disciplina/projeto, e
**Só pagos sem comprovante** (força o status para "Pago" — pendente/cancelado não têm
comprovante para conferir). Os 3 cartões de totais somam **todo o recorte filtrado**,
mesmo o que a lista não está mostrando — por isso não zeram ao filtrar por um status, e
também se ajustam quando algum outro filtro (lote, sem comprovante etc.) está ativo.

### Rastreabilidade

Cada linha mostra e linka (conforme sua permissão em cada destino):

- o **projetista** → ficha da pessoa;
- o **projeto/disciplina** → a disciplina no projeto;
- um pagamento **pago** → a **conta** e a **forma** usadas, se tem **comprovante**
  anexado (e quantos), com link para o **lançamento** no livro caixa;
- se o pagamento faz parte de um **lote**, um link "lote mês/ano" que abre a aba Lotes já
  naquele lote, expandido;
- um pagamento **pendente** → se já existe um lançamento previsto ou não, e se está
  **parado** há muito tempo sem pagar (rótulo "parado há N dias").

### Ações por linha

Pendente:

- **Pagar** — abre o dialog de efetivação (conta obrigatória, forma e data opcionais, com
  upload opcional do comprovante); gera ou confirma o lançamento de despesa no caixa.
- **Corrigir valor / Editar** — corrige o valor (e a observação) de um pendente. Não
  permite zerar — para isso, cancele.
- **Cancelar** — cancela um pendente; a linha sai do "a pagar" sem virar dívida.

Pago:

- **Comprovantes** (ícone de clipe) — anexa, baixa ou remove comprovantes deste pagamento
  a qualquer momento, mesmo muito depois de pago.
- **Gerar recibo** — cria um recibo desta entrega para o projetista assinar (ver
  [Recibos](#recibos)).
- **Corrigir pagamento** e **Estornar** (quem tem `financeiro:folha_pj_corrigir`) — ver
  [Corrigir e estornar um pagamento já pago](#corrigir-e-estornar-um-pagamento-já-pago).

### Pagamentos sem valor (R$ 0,00)

Uma linha pendente de **R$ 0,00** não pode ser paga — o botão "Pagar" vira **Corrigir
valor**. Quando existe pelo menos uma linha assim, um aviso aparece no topo da página
(nas duas abas), porque pagar R$ 0,00 sujaria o caixa com um lançamento confirmado sem
valor nenhum.

### Pagar em lote pela tela

- **Pagar selecionados** (modo por pagamento) — marque as linhas pagáveis e pague todas
  de uma vez, com uma única conta/forma/data.
- **Pagar tudo** (modo por projetista) — paga de uma vez todas as entregas pendentes de
  uma pessoa.

Nos dois casos, cada projetista recebe **uma** notificação, mesmo com várias entregas
pagas juntas. Depois de confirmar, abre uma lista com um pagamento por linha para anexar
o comprovante de cada um (pular é sempre permitido — dá para voltar depois pelo botão de
clipe da própria linha).

### Exportar

Os botões **XLSX**/**CSV**, na barra de filtros, baixam exatamente o recorte que a tela
está mostrando — mesmo filtro de status/projetista/projeto/lote/período/busca/sem
comprovante e mesma ordenação. O nome do arquivo identifica o filtro aplicado.

## Comprovantes de pagamento

O comprovante (recibo bancário, print do PIX etc.) pode ser anexado em três momentos:

- **na hora de pagar**, no próprio dialog de efetivação;
- **logo após pagar em lote** (Pagar selecionados / Pagar tudo / Pagar lote), na lista
  linha a linha que abre em seguida;
- **a qualquer momento depois**, pelo ícone de clipe da linha paga — anexa, baixa ou
  remove, sem limite de tempo.

Um pagamento pode ter mais de um comprovante. O filtro **Só pagos sem comprovante** (aba
Pagamentos) lista de uma vez todos os que ainda não têm nenhum, para conferência.

## Recibos

Além do comprovante (prova de que o dinheiro saiu), o botão **Gerar recibo** numa linha
paga cria um **recibo** dessa entrega: um documento que o próprio projetista **assina**
dentro do sistema, no seu extrato (`/financeiro`) — o texto exato que ele leu fica
gravado, com um código de verificação. Depois de assinado, dá para baixar em **PDF**; um
PJ ainda pode anexar a **nota fiscal** referente ao recibo, direto da mesma tela.

O PDF do recibo sai com o **timbrado da empresa** (logo, razão social, CNPJ, endereço), vindo
de [Configurações → Empresa](../sistema/configuracoes.md#sistema). O timbrado fica fora do
texto assinado — trocar os dados da empresa não invalida recibo já assinado.

Gerar o recibo não trava nem refaz o pagamento — é só o documento, criado depois que o
dinheiro já saiu.

## Corrigir e estornar um pagamento já pago

Quem tem a permissão extra `financeiro:folha_pj_corrigir` (separada de `folha_pj` — ver
[Permissões](#permissões)) pode desfazer o que já foi pago:

- **Corrigir pagamento** — muda valor, conta, forma, data e observação de um pagamento
  **pago**, com uma justificativa obrigatória (fica na auditoria). Não é permitido se o
  lançamento não estiver confirmado no caixa ou tiver baixa parcial — nesses casos, use a
  tela de Lançamentos.
  - Se o lançamento já está **conciliado** com o extrato bancário, a correção só passa se
    o valor bater com o que o banco registrou — o extrato manda; se o que saiu foi outro
    valor, é caso de estorno, não de correção.
  - O projetista só é avisado quando **valor** ou **data** realmente mudam — trocar só a
    conta, a forma ou a observação não gera notificação.
- **Estornar** — desfaz o pagamento inteiro: volta a `cancelado`, o lançamento no caixa é
  cancelado e a linha sai de qualquer lote. Não é permitido para um lançamento conciliado
  (o dinheiro saiu de verdade — lance a devolução quando ela entrar) nem com baixa
  parcial.

As duas ações também aparecem dentro do lote expandido (aba Lotes), com as mesmas regras.

## Aba Lotes

Agrupa os pagamentos liberados no mês (e ainda sem lote) em um **lote mensal**, para
conferir e pagar de uma vez.

- **Gerar lote** — escolha mês e ano; um mês sem pagamento fora de lote (mês corrente,
  ou já coberto por um lote anterior) não é erro — a tela avisa e não cria nada.
- Cada lote mostra o progresso (**pagos/total**), o valor e o status. Expanda a linha para
  ver cada pagamento dentro, com as mesmas ações de pagar/corrigir/estornar/comprovantes
  da aba Pagamentos, mover um pendente para outro lote, e cancelar um pendente.
- **Pagar lote** — efetiva de uma vez todos os pendentes pagáveis do lote (conta
  obrigatória, forma e data opcionais). Linhas de R$ 0,00 dentro do lote ficam de fora e
  continuam pendentes — o lote não fecha como "pago" enquanto sobrar alguma.
- **Exportar** (XLSX/CSV), dentro do lote expandido — baixa só o conteúdo daquele lote,
  todos os status.
- Quem tem `financeiro:folha_pj_corrigir` também pode **excluir o lote** (os pagamentos
  ficam soltos, ninguém é cancelado) e desfazer uma conciliação pelo dialog de correção
  (quem tem `financeiro:conciliar`).

Um pagamento **cancelado** sai do lote sozinho — não fica preso nem é recolhido de
volta por um lote seguinte. Um link "lote mês/ano" na aba Pagamentos leva direto para o
lote certo aqui, já aberto.

## Alerta de pendente parado

Toda **segunda-feira de manhã**, quem gerencia Produção (`admin`/`supervisor`/
`administrativo`) recebe uma notificação resumindo quantos pagamentos estão **pendentes
há mais de 30 dias** e a soma dos valores — uma única notificação, não uma por pagamento.
Sem nenhum parado, ninguém recebe nada naquela semana. O link da notificação já abre a
lista filtrada em "A pagar", com os mais antigos no topo.

## Pagamento por fase

Quando a disciplina tem [etapas](../projetos/etapas-e-pagamento-por-fase.md), **cada fase aprovada**
gera os **seus** pagamentos — e a mesma disciplina passa a ter **uma linha por fase e por
projetista**. Para distingui-las, o texto traz a sigla da fase: **"Elétrica · BS"**. Isso vale na lista
(por projetista e por pagamento), no lote, nos diálogos de correção e de mover de lote, no extrato do
projetista, no recibo e na despesa que entra no financeiro. A **busca** encontra pela sigla. Sem fase,
o texto é o de sempre.

- O **valor de cada fase** vem do percentual dela sobre o valor da disciplina, e **fica congelado** na
  aprovação — o valor da disciplina que mudar depois só afeta as fases que ainda faltam.
- **Corrigir valor**, **estornar** ou **cancelar** um pagamento de fase muda o valor **daquela fase**;
  o valor da disciplina anda pela **mesma diferença**, e as fases seguintes não mudam.
- Fase de **0%** não gera linha de R$ 0,00 — é aprovada sem pagamento.

## Do lado do projetista

O próprio projetista/freelancer vê seus pagamentos em **Meu extrato**
(`/financeiro`) — ver [Financeiro: Visão geral e Meu extrato](visao-geral.md). Um
pagamento pago mostra a forma usada e os comprovantes/anexos para download, mas **não** a
conta bancária da empresa. Recibos gerados para ele aparecem na mesma tela, para assinar
e baixar o PDF.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver, pagar, editar, cancelar pendente, gerar/pagar lote, comprovantes, recibo, exportar | `financeiro:folha_pj` |
| Corrigir/estornar pagamento já pago, excluir lote | `financeiro:folha_pj_corrigir` |
| Desfazer conciliação (dentro do dialog de correção) | `financeiro:conciliar` |

`financeiro:folha_pj_corrigir` é um poder **separado** de `financeiro:folha_pj` — dá para
alguém pagar e gerenciar comprovantes/recibos sem poder desfazer um pagamento já
efetivado. Os links de cada linha (projeto, pessoa, lançamento) dependem também da
permissão de **cada destino** — quem só tem `folha_pj` vê o texto sem link, em vez de
cair numa tela de "sem permissão".

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Visão geral e Meu extrato](visao-geral.md)
- [Folha de pagamento CLT](../rh-ponto/folha-clt.md) (remuneração de CLT/estagiário)

## FAQ

**Por que não consigo pagar uma linha de R$ 0,00?** É proposital — pagar criaria um
lançamento confirmado sem valor no caixa. Use **Corrigir valor** para lançar o valor
correto antes de pagar.

**A conta é obrigatória para pagar?** Sim, em todos os caminhos de pagamento (individual,
lote, selecionados, pagar tudo) — sem conta o lançamento não concilia no extrato
bancário. A forma de pagamento continua opcional.

**O que muda entre "por projetista" e "por pagamento"?** Nada nos dados — é a mesma
lista, só organizada diferente. Use "por projetista" para ver quanto deve a cada pessoa;
"por pagamento" para ordenar, filtrar linha a linha ou selecionar um conjunto específico.

**A mesma disciplina aparece em duas linhas para o mesmo projetista.** É o pagamento por fase: cada
fase aprovada tem a sua linha ("Elétrica · BS", "Elétrica · EX"). A soma das fases é o valor da
disciplina.

**A exportação respeita o filtro que apliquei?** Sim — o arquivo baixado é exatamente o
que a tela está mostrando no momento, com o mesmo filtro e ordenação.

**Paguei errado — dá para desfazer?** Se ainda não conciliou com o extrato: sim, pelo
botão **Corrigir pagamento** (ajusta valor/conta/forma/data) ou **Estornar** (desfaz tudo
e volta a pendente-cancelado), se você tiver `financeiro:folha_pj_corrigir`. Se já
conciliou, a correção só aceita um valor igual ao que o banco registrou — para um valor
diferente, lance a devolução no caixa.

**Sumiu o comprovante que eu já tinha anexado?** Improvável — comprovantes não são
apagados automaticamente. Confira pelo ícone de clipe da linha; se realmente não estiver
lá, alguém com acesso pode ter removido pela mesma tela.

**Por que recebi uma notificação de "pagamentos de produção parados"?** É o alerta
semanal de segunda-feira, para quem gerencia Produção — resume quantos pendentes passam
de 30 dias sem pagar. Não é individual por pagamento; se não houver nenhum parado, a
notificação não chega naquela semana.
