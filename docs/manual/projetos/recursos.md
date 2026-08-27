---
titulo: Recursos (alocação da equipe)
descricao: Matriz de alocação de pessoas em projetos, com carga semanal e habilidades.
resumo: Veja quem está alocado em quais projetos, a carga de trabalho por semana e as habilidades de cada pessoa.
tags: [recursos, alocação, carga, equipe, habilidades, capacidade]
palavras-chave: [recursos, alocação, carga semanal, capacidade, equipe, habilidade, competência]
sinonimos: [alocação de equipe, capacity, planejamento de recursos]
---

# Recursos (alocação da equipe)

## Objetivo

Visualizar e gerenciar a **alocação das pessoas nos projetos**, a **carga semanal** de
trabalho e as **habilidades** de cada um.

## Quando utilizar

- Para equilibrar a carga do time e decidir alocações.

## Como acessar

- Menu → **Recursos** (`/recursos`). Exige `recursos:ver`.
- Disponível a admin, supervisor e administrativo.

## O que a tela mostra

- **Matriz** de recursos: linhas = pessoas, colunas = projetos, com a alocação.
- **Carga semanal** por recurso, nas últimas 12 semanas. Cada célula mostra
  `horas registradas / horas disponíveis` e usa a escala, o fator de capacidade,
  feriados, férias e abonos aprovados.
- **Faixas de alocação** por projeto: uma pessoa pode encerrar uma participação e
  voltar ao mesmo projeto em outro período, preservando o histórico. Faixas que se
  sobrepõem para a mesma pessoa e projeto são bloqueadas.
- **Habilidades** de cada pessoa (catálogo de competências).
- **Usuários sem recurso** (ainda não mapeados) são destacados.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver a matriz | `recursos:ver` |
| Editar alocações/habilidades | `recursos:gerir` |

## Funcionalidades relacionadas

- [Planejamento](planejamento.md) · [Projetos](projetos.md) · [RH — Produtividade](../rh-ponto/README.md)

## FAQ

**O que é a carga semanal?** Ela compara, por pessoa e semana, as horas realmente
registradas com a capacidade que estava disponível. Uma semana sem horas também aparece;
férias, abonos e feriados reduzem a capacidade exibida.

**Posso alocar a mesma pessoa no mesmo projeto mais de uma vez?** Sim, desde que as faixas
de datas não coincidam. Por exemplo, uma faixa pode terminar em junho e outra começar em
setembro, sem apagar a participação anterior.
