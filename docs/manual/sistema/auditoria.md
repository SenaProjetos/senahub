---
titulo: Auditoria
descricao: Registro imutável de toda atividade do sistema, com filtros, e o uso por seção.
resumo: Consulta ao log de auditoria (quem fez o quê, quando e com qual resultado), com filtros por módulo, resultado, texto e data; inclui o relatório de uso por seção.
tags: [auditoria, log, registro, atividade, rastreabilidade, uso]
palavras-chave: [auditoria, log, registro, atividade, quem fez, evento, resultado, módulo, uso por seção]
sinonimos: [logs, trilha de auditoria, histórico de ações]
---

# Auditoria

## Objetivo

Oferecer um **registro imutável** de toda atividade do sistema — a trilha de quem fez o
quê, quando e com qual resultado.

## Como acessar

- Menu → **Auditoria** (`/auditoria`). **Restrito ao admin.**
- **Uso por seção** (`/auditoria/uso`) — relatório de uso das áreas, também só admin.

## O que a tela mostra

- Tabela de **eventos** com o total registrado.
- **Filtros:** módulo, **resultado** (sucesso/erro), busca por texto e intervalo de
  **datas** (de/até), com paginação.

## Como a auditoria é gerada

- **Toda mutação** no sistema é registrada automaticamente (criar, editar, excluir,
  aprovar etc.), incluindo, quando aplicável, o **antes e depois** do dado.
- O registro é **automático e inescapável** — não há ação de gestão que não fique
  auditada.

## Regras de negócio

- O log é **imutável** (não se edita nem apaga).
- Cada evento guarda autor, módulo, ação, resultado e data.

## Funcionalidades relacionadas

- Todas as ações de gestão do sistema alimentam a auditoria.

## FAQ

**Quem pode ver a auditoria?** Apenas o **administrador**.

**Posso apagar um registro?** Não — o log é imutável por design.
