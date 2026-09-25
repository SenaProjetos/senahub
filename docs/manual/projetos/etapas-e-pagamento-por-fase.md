---
titulo: Etapas da disciplina e pagamento por fase
descricao: Divida uma disciplina em fases (Básico, Executivo…), com prazo, situação e fatia do valor próprios, e libere o pagamento do projetista fase a fase.
resumo: Cada disciplina pode ter etapas — uma por fase do catálogo — com prazo, situação e percentual do valor. Aprovar uma fase libera o pagamento dela para os projetistas PJ/freelancer; o valor liberado fica fixo e a soma das fases fecha no valor da disciplina.
tags: [etapas, fase, disciplina, pagamento por fase, aprovar fase, básico, executivo, percentual, projetista, liberar pagamento, link por fase]
palavras-chave: [etapa, fase, básico, executivo, as-built, percentual por fase, aprovar fase, liberar pagamento, pagamento por fase, disciplina · sigla, pool de pagamento, valor da fase, prazo por fase, link público por fase, marco da fase]
sinonimos: [divisão da disciplina por fase, entrega por fase, pagamento parcial, medição por fase]
---

# Etapas da disciplina e pagamento por fase

## Objetivo

Uma disciplina (Estrutural, Elétrica…) costuma ser entregue em **fases** — Básico, Executivo,
As-built. As **etapas** dão a cada fase **prazo, situação e uma fatia do valor** próprios, e permitem
**pagar o projetista fase a fase**: entregou o Básico, libera o pagamento do Básico.

## Quando utilizar

- Quando a disciplina tem entregas por fase com prazos diferentes.
- Quando o projetista PJ/freelancer deve receber **por fase entregue**, e não só no fim.

**Disciplina sem etapas funciona exatamente como sempre funcionou**: um prazo, um valor e um
pagamento liberado quando a disciplina é aprovada.

## Etapas de uma disciplina

No card da disciplina (aba **Disciplinas** do [projeto](projetos.md)), o botão de camadas **Etapas da
disciplina** abre o diálogo **Etapas — {disciplina}**. Exige `projetos:gerir`.

- **Adicionar fase** — os botões mostram as fases **ativas** do catálogo que a disciplina ainda não
  usa. A etapa nasce com o percentual que **falta** para fechar 100%.
- **Prazo** — a data da entrega daquela fase. Grava ao sair do campo (ou com Enter). Não pode passar
  do **prazo planejado do projeto**.
- **Situação** — Aguardando, Em andamento, Em revisão ou Entregue. **Aprovado** não se escolhe aqui:
  vem do botão **Aprovar** (que libera o pagamento) ou da aprovação da disciplina inteira.
- **%** — a fatia do **valor da disciplina** que aquela fase representa. A tela mostra a soma
  (**Soma 100%** ou "os percentuais das etapas somam X%; precisam somar 100%"). Dá para salvar um
  rascunho que ainda não fecha, mas **aprovar e pagar exigem 100%**.
- **Valor** — só para quem vê o financeiro: o valor calculado de cada fase (veja abaixo).
- **Remover** a etapa (lixeira, com confirmação).

**O prazo da disciplina passa a ser o maior prazo entre as etapas.** O campo de prazo da disciplina
fica travado no editor. Sem nenhuma etapa com prazo, o prazo atual é mantido; remover a última etapa
devolve a disciplina à edição direta do prazo. Ao **reabrir** uma disciplina com etapas, o novo prazo
vai para a etapa que define o prazo.

**Link público por fase.** No gerenciador de **Link público** (aba Arquivos), o campo **Fases
liberadas** deixa criar um link só com o Básico para a prefeitura e outro só com o Executivo para o
cliente — dois links do mesmo projeto. Documentos **sem fase** só entram se você marcar **Incluir
documentos sem fase**.

## Aprovar a fase e liberar o pagamento

Quando uma fase está **Entregue** (ou **Em revisão**), quem tem `aprovacoes:disciplina` vê o botão
**Aprovar** na linha da etapa. Ao confirmar:

1. a fase passa a **Aprovada · pagamento liberado**;
2. cada **projetista PJ ou freelancer** da disciplina ganha um **pagamento** daquela fase — o valor da
   fase dividido entre eles — e a despesa **prevista** correspondente entra no financeiro, nomeada
   **Disciplina · SIGLA** (ex.: "Elétrica · BS");
3. os projetistas são avisados ("Pagamento liberado") e a gestão recebe "Fase aprovada".

Detalhes que importam:

- **Aprovar e pagar são atos distintos.** Quem aprova a fase **não vê nem digita valor**; o valor sai
  da regra abaixo. Quem quiser mudá-lo ajusta o valor da disciplina **antes** (no editor da
  disciplina) ou o pagamento na [Produção](../financeiro/producao.md) **depois**.
- **CLT e estagiário não recebem por entrega** (o custo deles vem do ponto). Disciplina só com CLT tem a
  fase aprovada **sem pagamento** — e sem exigir que os percentuais fechem.
- Fase de **0%** é aprovada **sem pagamento** (não cria linha de R$ 0,00 na Produção).
- **Aprovar a disciplina inteira** libera de uma vez as fases que ainda faltam, cada uma pelo seu valor.
  O card avisa: "Pagamento liberado em **N de M** fases · aprovar libera as que faltam".
- **Um modo só por disciplina**: pagamento **inteiro** ou **por fase**, fixado na **primeira**
  liberação. Disciplina que já pagou inteira e depois ganhou etapas **não** libera por fase — o botão
  Aprovar some e o diálogo explica.

## Como o valor de cada fase é calculado

O **valor da disciplina** (o que é pago aos PJ/freelancer) se divide pelo **percentual de cada fase**.
Três regras sustentam tudo:

1. **Fase aprovada congela.** O valor da fase e **quem recebe** ficam fixos na aprovação. Quem entra no
   time durante o Executivo **não** recebe parte do Básico; quem sai **não** perde a parte do Básico.
2. **O que falta se reparte pelo % do que falta.** Enquanto uma fase não é aprovada, o valor dela é
   *(valor da disciplina − já liberado) × % dela ÷ soma dos % das fases pendentes*. A última fase
   pendente leva o **resto exato**, então, ao fim, a soma das fases é o valor da disciplina **no
   centavo**, em qualquer ordem de aprovação.
3. **Ajuste manual fica na fase ajustada.** Editar, estornar ou cancelar um pagamento de fase na
   Produção muda o valor **daquela** fase, e o valor da disciplina anda pela **mesma diferença** — as
   fases seguintes não mudam.

**Exemplo.** Disciplina de R$ 10.000, com Básico 40%, Executivo 35% e As-built 25%.

- Aprovar o **Básico** libera R$ 4.000 (dividido entre os PJ).
- Antes de aprovar o Executivo, o valor da disciplina sobe para R$ 12.000. Restam R$ 8.000: o
  **Executivo** vale R$ 4.666,67 (35/60 de 8.000) e o **As-built** R$ 3.333,33 — o Básico não mexe.
- No fim, 4.000 + 4.666,67 + 3.333,33 = **12.000,00**.

**Mudar o valor da disciplina depois de aprovar alguma fase** só afeta as fases que **ainda faltam**, e
é recusado se o novo valor ficar **abaixo do que já foi liberado**. Se **todas** as fases já foram
liberadas, a mudança é recusada com o aviso de que o ajuste é na Produção.

## Onde a fase aparece

- **Card da disciplina:** o aviso "liberado em N de M fases"; ao confirmar a aprovação da disciplina
  com fase já liberada, o diálogo **não** edita valor (a prévia "valor ÷ projetistas" mentiria, pois
  parte já foi paga) — os valores por fase estão em **Etapas**.
- **Produção, extrato do projetista e recibo:** a linha traz **Disciplina · SIGLA**, e a busca da
  Produção encontra pela sigla. Sem fase, o texto é o de sempre.
- **Alerta de "aguardando validação":** a disciplina entregue com fase parcial continua aparecendo
  enquanto faltar fase a liberar.

## Marco que oferece aprovar a fase

No [cronograma](planejamento.md), a linha tem o campo **Fase**. Quando o **marco** de uma fase é
**concluído** (**Atualizar tarefa**) e a fase está **Entregue** e ainda sem pagamento liberado, o
sistema **oferece aprovar a fase** — pela mesma aprovação deste diálogo, com a mesma permissão e a
mesma confirmação — e avisa quem aprova. **Concluir o marco nunca paga nada sozinho**; se a fase ainda
não está Entregue, marque-a em **Etapas** primeiro. O marco também avisa o financeiro quando há
[parcela de contrato](../financeiro/contrato-por-entrega.md) presa a ele.

## Permissões

| Ação | Permissão |
| --- | --- |
| Criar, editar e remover etapas | `projetos:gerir` |
| **Aprovar** a fase (libera o pagamento) | `aprovacoes:disciplina` |
| Ver o **valor** de cada fase e a coluna Valor | acesso ao financeiro (`financeiro:ver` ou sócio) |
| Editar o valor da disciplina | `projetos:gerir` (e a regra de valor acima) |
| Ajustar um pagamento de fase | Produção — ver [Produção](../financeiro/producao.md) |

## Regras de negócio

- Fase **aprovada** não muda de percentual e **não pode ser removida** (o banco também recusa).
- **Percentuais que não fecham 100%** recusam a liberação, com o caminho da correção; nunca são
  "corrigidos" em silêncio.
- **Cada fase libera uma vez** (aprovar de novo não cria outro pagamento).
- Um **modo de pagamento por disciplina**, fixado na primeira liberação.
- O valor liberado **não muda sozinho**: só um ajuste manual na Produção o move.

## Funcionalidades relacionadas

- [Projetos](projetos.md) · [Planejamento](planejamento.md) ·
  [Produção (pagamento de projetistas)](../financeiro/producao.md) ·
  [Contrato por entrega](../financeiro/contrato-por-entrega.md)

## FAQ

**Não vejo o botão Aprovar na etapa.** A fase precisa estar **Entregue** (ou Em revisão), você precisa
de `aprovacoes:disciplina`, e a disciplina não pode ter pago inteira.

**"Os percentuais das etapas somam 90%".** Ajuste em **Etapas** até fechar 100% e aprove de novo.

**Aprovei a fase e o percentual travou.** É de propósito: o valor foi congelado na liberação.

**Preciso corrigir um valor já liberado.** Vá à **Produção** e edite o pagamento daquela fase; o valor
da disciplina acompanha pela diferença.

**A disciplina é só de CLT. Preciso fechar 100%?** Não para aprovar; sem projetista PJ/freelancer não
há o que repartir.
