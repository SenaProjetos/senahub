---
titulo: Licitações
descricao: Acompanhamento de licitações com painel, filtros por status/órgão e gestão dos processos.
resumo: Liste e filtre licitações por status e órgão, veja o painel-resumo e gerencie os processos (quem tem permissão de gestão).
tags: [licitações, edital, órgão, status, processo, pregão]
palavras-chave: [licitação, edital, órgão, status, pregão, habilitação, modalidade, proposta pública]
sinonimos: [editais, certames, processos licitatórios]
---

# Licitações

## Objetivo

Acompanhar e gerir a participação do escritório em **licitações** públicas.

## Como acessar

- Menu → **Licitações** (`/licitacoes`). Exige `licitacoes:ver`.
- Disponível a admin, supervisor e administrativo. **Criar/editar exige
  `licitacoes:gerir`**.

## O que a tela mostra

- **Painel-resumo** (dashboard) com indicadores das licitações.
- **Lista** com **filtros**: status (um ou vários), **órgão** e busca por texto, com
  **paginação**.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver licitações | `licitacoes:ver` |
| Criar/editar/gerir | `licitacoes:gerir` |
| Parâmetros gerais (`/configuracoes/licitacoes`) | restrito a admin |

## Funcionalidades relacionadas

- [Comercial](../clientes-comercial/comercial.md) · [Jurídico](juridico.md) (certidões/habilitação) · [Configurações](../sistema/README.md)

## FAQ

**Posso filtrar por mais de um status?** Sim — o filtro de status aceita múltiplos
valores.

**Por que não abro os parâmetros gerais de licitação?** Essa tela é restrita ao
administrador.
