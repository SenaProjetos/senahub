---
titulo: Tarefas
descricao: Quadro de tarefas (kanban) em colunas por status, com checklist, dependências e comentários.
resumo: Organize tarefas em colunas, atribua responsáveis, defina prazo e prioridade, vincule a projetos, use checklists, dependências e comentários com anexo.
tags: [tarefas, kanban, quadro, checklist, dependências, comentários, prioridade, prazo, botão direito, menu de contexto, cronograma, cards do cronograma]
palavras-chave: [tarefa, kanban, quadro, coluna, status, checklist, dependência, bloqueada, comentário, anexo, prioridade, botão direito, clique direito, toque longo, menu de contexto, atalho, mover, arquivar, card do cronograma, prazo travado, tarefa do planejamento]
sinonimos: [to-do, board, atividades, cartões]
---

# Tarefas

## Objetivo

Organizar o trabalho do time em um **quadro (kanban)**: cartões de tarefa distribuídos
em colunas de status, com responsáveis, prazo, prioridade, checklists e dependências.

## Quando utilizar

- Para acompanhar atividades internas (ligadas ou não a um projeto).

## Quando não utilizar

- Para entregas técnicas de projeto (disciplinas), use [Projetos](projetos.md).

## Como acessar

- Menu → **Tarefas** (`/tarefas`). Disponível a **todos os perfis internos** (não
  clientes).

## O que a tela mostra

- **Colunas** representam os status (configuráveis; cada uma tem cor e marca se é coluna
  de "concluído"). As tarefas ficam organizadas pela coluna do seu status.
- Cada **cartão** mostra: título, descrição, prazo, prioridade, projeto vinculado
  (código), responsáveis, **checklist** de itens, **dependências** e **comentários**.
- Use os filtros para encontrar tarefas por texto, projeto, disciplina, responsável,
  prazo ou prioridade. O quadro mostra os resultados por página.

## Recursos do cartão

- **Responsáveis:** uma ou mais pessoas. Os responsáveis podem mover o cartão entre
  colunas e marcar o checklist; somente quem criou a tarefa (ou quem gere as tarefas de
  todos) altera os demais dados.
- **Prazo e prioridade.**
- **Vínculo a projeto** (opcional) — mostra o código do projeto.
- **Checklist:** subitens marcáveis como concluídos, com contador e barra de progresso.
- **Dependências:** uma tarefa que depende de outra fica **bloqueada** até a dependência
  ser concluída.
- **Comentários:** texto e **anexo** (arquivo), com autor e data.

## Cards que vêm do cronograma

Quando o [cronograma](planejamento.md) de um projeto é **aprovado**, cada **atividade da equipe** com
pessoa escalada vira um **card** aqui, para cada uma dessas pessoas.

- O card **acompanha o cronograma**: se a data ou a equipe da atividade muda na EAP, o card muda junto.
- **Título, prazo, projeto, disciplina e responsáveis ficam travados** no card — o aviso diz "Este card
  vem do cronograma… mudam na EAP do projeto" e leva até lá. **Coluna, prioridade, descrição, checklist
  e comentários** continuam livres: você trabalha no dia a dia sem mexer no combinado.
- O **checklist** do card alimenta a **sugestão de percentual** que a coordenação vê na EAP.
- Marco, agrupamento, etapa de terceiro e atividade só com perfil (sem pessoa) **não** geram card.

Detalhes em [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md).

## Menu de ações (botão direito)

Clique com o **botão direito** em um cartão do quadro (ou em uma linha da visão em lista)
para abrir o menu de ações da tarefa. No celular, **toque e segure** por meio segundo.

- **Abrir** — abre a tarefa, como um clique normal.
- **Mover para** — lista as outras colunas; escolha uma para mudar o status sem arrastar.
- **Copiar título** — copia o título da tarefa.
- **Arquivar** — tira a tarefa do quadro e das listas. Pede confirmação; o histórico é
  mantido.

Clicar com o botão direito na **área vazia de uma coluna** oferece **Nova tarefa em
[coluna]** (a tarefa já nasce com aquele status) e, quando há filtro ativo, **Limpar
filtros**. Fora dos cartões e das linhas — títulos, filtros, textos — o botão direito
continua abrindo o menu normal do navegador.

**Sem botão direito ou pelo teclado:** todo cartão e toda linha da lista têm um botão **⋯**
com as mesmas ações. Ele aparece ao passar o mouse e quando você chega nele com a tecla Tab.

**Quando um item some ou aparece esmaecido:**

- **Mover para** só aparece para quem criou a tarefa, para os responsáveis e para quem gere
  as tarefas de todos.
- Se a tarefa está **bloqueada**, a coluna de concluído aparece esmaecida, com o motivo
  ("Tarefa bloqueada: conclua as dependências primeiro.").
- **Arquivar** aparece esmaecido, com o motivo, para quem não criou a tarefa e não gere as
  tarefas de todos.

## Regras de negócio

- **Tarefa bloqueada:** enquanto houver dependência não concluída, a tarefa é sinalizada
  como bloqueada.
- Tarefas **arquivadas** ou concluídas não entram nos alertas/prazos da Agenda.

## Funcionalidades relacionadas

- [Agenda](agenda.md) (mostra prazos de tarefas) · [Projetos](projetos.md) ·
  [Planejamento](planejamento.md) (o cronograma aprovado gera os cards)

## FAQ

**Por que uma tarefa aparece bloqueada?** Ela depende de outra(s) ainda não concluída(s).

**Posso anexar arquivo em uma tarefa?** Sim, nos comentários do cartão.

**Como movo uma tarefa sem arrastar?** Clique com o botão direito no cartão (ou use o botão
⋯) e escolha **Mover para**.

**O botão direito não abriu o menu da tarefa.** Ele só abre sobre o cartão ou a linha da
tarefa; em títulos, filtros e textos vale o menu normal do navegador. Sem mouse, use o
botão ⋯ do cartão.
