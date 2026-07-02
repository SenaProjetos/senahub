---
titulo: Tarefas
descricao: Quadro de tarefas (kanban) em colunas por status, com checklist, dependências e comentários.
resumo: Organize tarefas em colunas, atribua responsáveis, defina prazo e prioridade, vincule a projetos, use checklists, dependências e comentários com anexo.
tags: [tarefas, kanban, quadro, checklist, dependências, comentários, prioridade, prazo]
palavras-chave: [tarefa, kanban, quadro, coluna, status, checklist, dependência, bloqueada, comentário, anexo, prioridade]
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

## Recursos do cartão

- **Responsáveis:** uma ou mais pessoas.
- **Prazo e prioridade.**
- **Vínculo a projeto** (opcional) — mostra o código do projeto.
- **Checklist:** subitens marcáveis como concluídos.
- **Dependências:** uma tarefa que depende de outra fica **bloqueada** até a dependência
  ser concluída.
- **Comentários:** texto e **anexo** (arquivo), com autor e data.

## Regras de negócio

- **Tarefa bloqueada:** enquanto houver dependência não concluída, a tarefa é sinalizada
  como bloqueada.
- Tarefas **arquivadas** ou concluídas não entram nos alertas/prazos da Agenda.

## Funcionalidades relacionadas

- [Agenda](agenda.md) (mostra prazos de tarefas) · [Projetos](projetos.md)

## FAQ

**Por que uma tarefa aparece bloqueada?** Ela depende de outra(s) ainda não concluída(s).

**Posso anexar arquivo em uma tarefa?** Sim, nos comentários do cartão.
