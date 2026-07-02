---
titulo: Comercial (funil, propostas, tabelas, metas)
descricao: Funil de vendas com leads/oportunidades, propostas, tabelas de preço e meta mensal.
resumo: Acompanhe leads no funil, registre oportunidades, monte propostas (itens e condições), gerencie tabelas de preço por m² e a meta mensal de vendas.
tags: [comercial, funil, leads, oportunidades, propostas, tabelas de preço, meta, vendas]
palavras-chave: [comercial, funil, lead, oportunidade, proposta, tabela de preço, valor por m2, meta, realizado, etapa, perdido]
sinonimos: [crm, vendas, pipeline, pré-venda]
---

# Comercial (funil, propostas, tabelas, metas)

## Objetivo

Gerir o processo comercial: do **lead** no funil à **proposta** aceita, com **tabelas de
preço** e acompanhamento de **meta** mensal.

## Quando utilizar

- Para registrar e mover leads, montar propostas e acompanhar resultado de vendas.

## Como acessar

- Menu → **Comercial** (`/comercial`). Exige `comercial:ver`.
- Disponível a admin, supervisor e administrativo. **Criar/editar exige
  `comercial:gerir`** (perfis sem essa permissão veem em modo leitura).

## Visão geral (tela inicial)

- **Resumo:** leads ativos, propostas enviadas, **aceitas no mês**.
- **Meta do mês:** meta × realizado (editável por quem tem `comercial:gerir`).
- **Funil (kanban):** leads organizados por **etapa**.
- Botões para **Oportunidades**, **Tabelas de preço** e **Propostas**.

## Funil e leads

- Cada **lead** tem nome, contato, e-mail, telefone, origem, valor estimado, etapa e
  observações.
- **Mover lead** entre etapas. Ao mover para uma etapa de **"Perdido"**, o **motivo da
  perda é obrigatório**.
- É possível adicionar **notas** ao lead e **convertê-lo** (vira cliente/projeto/proposta
  conforme o fluxo).
- **Etapas do funil** são configuráveis (nome e cor) — em Configurações.

## Oportunidades

- Tela `/comercial/oportunidades`: lista de oportunidades com suas opções de
  classificação. Mesma permissão do módulo (`comercial:ver`/`gerir`).

## Propostas

- Tela `/comercial/propostas`: lista com **número**, título, cliente, **status**,
  **total** e nº de **visualizações** (quando enviada por link ao cliente).
- **Status:** rascunho → enviada → aceita / recusada. Filtro por status.
- **Montar proposta:** título, cliente, **área (m²)**, validade, observações, **itens**
  (disciplina + descrição + valor) e **condições** (percentual ou valor).
- O **total** é calculado a partir dos itens.

## Tabelas de preço

- Tela `/comercial/tabelas`: tabelas com itens **disciplina × valor por m²**, usadas como
  base para precificar propostas. Exige `comercial:gerir` para editar.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver funil, propostas, tabelas | `comercial:ver` |
| Criar/editar leads, propostas, tabelas, meta, etapas | `comercial:gerir` |

## Regras de negócio

- **Motivo da perda obrigatório** ao mover lead para "Perdido".
- Proposta tem ciclo de status definido (rascunho/enviada/aceita/recusada).
- **Visualizações** contam aberturas do link público da proposta pelo cliente.

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| Não consigo criar proposta/lead | Falta `comercial:gerir` | Solicitar permissão |
| Não deixa mover lead para "Perdido" | Motivo da perda em branco | Informar o motivo |

## Funcionalidades relacionadas

- [Clientes](clientes.md) · [Projetos](../projetos/projetos.md) · [Configurações](../sistema/README.md) (etapas do funil)

## FAQ

**Qual a diferença entre lead e proposta?** O lead é a oportunidade no funil; a proposta
é o documento comercial formal (com itens e valores) gerado para o cliente.

**O cliente vê quando abro o link da proposta?** O sistema conta as **visualizações** da
proposta enviada.
