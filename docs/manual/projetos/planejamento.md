---
titulo: Planejamento (EAP e Cronograma)
descricao: EAP e cronograma (gantt) por projeto, com linha de base e caminho crítico, além do cronograma geral.
resumo: Selecione um projeto para montar a EAP e o gantt com linha de base; veja progresso, datas e o cronograma geral do escritório.
tags: [planejamento, eap, cronograma, gantt, linha de base, caminho crítico, cpm]
palavras-chave: [planejamento, eap, cronograma, gantt, baseline, linha de base, caminho crítico, cpm, tarefa de projeto]
sinonimos: [cronograma de projeto, gantt, wbs]
---

# Planejamento (EAP e Cronograma)

## Objetivo

Planejar cada projeto em **EAP** (estrutura analítica) e **cronograma (gantt)**, com
**linha de base** para comparar o previsto com o realizado.

## Quando utilizar

- Para montar/atualizar o cronograma de um projeto e acompanhar progresso e desvios.

## Como acessar

- Menu → **Planejamento** (`/planejamento`). Exige `planejamento:ver`.
- Disponível a: admin, supervisor, administrativo, clt, estagiário, projetista_pj.

## Fluxo

1. A tela lista os **projetos** aos quais você tem acesso, em cartões com:
   - nº de tarefas da EAP, intervalo de datas (início–fim) e **progresso %**;
   - projetos **sem EAP** trazem o atalho **"Iniciar planejamento"**.
2. Clique em um projeto para abrir sua **EAP/gantt** (`/planejamento/{projeto}`).
3. O botão **Cronograma geral** abre a visão consolidada de todos os projetos
   (`/planejamento/cronograma`).

## Conceitos

- **EAP (WBS):** tarefas de projeto organizadas em hierarquia (códigos 1.2.3).
- **Linha de base:** "foto" do plano para medir desvio depois.
- **Caminho crítico (CPM):** sequência de tarefas que determina o prazo final.
- A EAP do projeto pode ser **exportada para Excel**.

## Escopo

- A lista respeita seu acesso a projetos (global vê todos; demais veem os seus).

## Funcionalidades relacionadas

- [Projetos](projetos.md) · [Recursos](recursos.md) (carga da equipe) · [Tarefas](tarefas.md)

## FAQ

**Qual a diferença entre Tarefas e Planejamento?** "Tarefas" é o quadro kanban do dia a
dia; "Planejamento" é o cronograma estruturado (EAP/gantt) do projeto.
