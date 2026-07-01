---
titulo: Deliberação — Clientes e Comercial
descricao: Ata do Conselho sobre o cadastro de clientes e o módulo comercial.
resumo: Descobertas no código (CRUD de clientes, funil, propostas, tabelas, meta) e decisão da documentação.
tags: [deliberação, conselho, clientes, comercial, funil, propostas]
palavras-chave: [deliberação, ata, cliente, lead, proposta, tabela de preço, meta]
sinonimos: [ata técnica]
---

# Deliberação — Clientes e Comercial

- **Data:** 2026-06-30
- **Funcionalidades:** `/clientes`, `/comercial` (+ propostas, oportunidades, tabelas).

## Participantes
Presidente, Iniciante, Experiente, UX, Backend, Frontend, QA, Negócios, Diretor,
Treinamento, Revisor Técnico, Product Owner, Suporte.

## Descobertas (inspeção de código)
- **Clientes** (`modules/clientes/actions.ts`, `app/.../clientes/page.tsx`): `clientes:ver`
  para lista; `clientes:gerir` para criar/editar/contato/desativar/reativar. Filtros: q,
  tipo PF/PJ, UF, cidade, categoria, situação; ordena por nome/cidade/createdAt (padrão
  nome asc). **Desativar** seta `ativo=false` (não apaga); existe **reativar**.
- **Comercial** (`app/.../comercial/page.tsx`, `schemas.ts`): `comercial:ver`/`gerir`.
  Resumo: leads ativos, enviadas, aceitas no mês, meta×realizado. Funil por etapas
  (configuráveis, cor hex). Lead: nome/contato/email/telefone/origem/valorEstimado/etapa/
  observações; mover lead exige **motivoPerda** quando destino é "Perdido"; notas;
  converter. Meta mensal (ano/mes/valor).
- **Propostas**: número, título, cliente, status (rascunho/enviada/aceita/recusada),
  total por itens, **visualizações** (link público). Montagem com areaM2, validade,
  itens (disciplina/descrição/valor) e condições (percentual|valor).
- **Tabelas de preço**: itens disciplina × valorM2.

## Questionamentos
- Onde se configuram as **etapas do funil**? → em Configurações (`/configuracoes/funil-etapas`,
  conforme `docs/revisao-telas-por-perfil.md`); citado, a detalhar na seção Sistema.
- Supervisor cria propostas? → pelo seed, supervisor tem só `comercial:ver` (não `gerir`).
  A doc afirma o gate por permissão, sem fixar quais perfis a possuem (é dado/seed).

## Opiniões dos Especialistas
- **Backend:** confirmar que desativar é reversível e não remove — documentado.
- **QA:** "motivo da perda obrigatório" é regra fácil de esquecer — virou erro/solução.
- **Negócios:** distinguir lead × proposta para o usuário — virou FAQ.
- **Suporte:** "não consigo criar" = permissão — item de erro.

## Discussão
Consenso de documentar Comercial em uma página única cobrindo funil/oportunidades/
propostas/tabelas/meta, com profundidade suficiente sem inspecionar cada subcomponente
de UI (descrição por comportamento confirmado nos schemas/queries).

## Divergências
Nenhuma.

## Decisão Final
- Publicadas [clientes.md](../clientes-comercial/clientes.md) e
  [comercial.md](../clientes-comercial/comercial.md).

## Melhorias Sugeridas
- **Documentação:** página dedicada a "Etapas do funil" e ao envio/link público da
  proposta.
- **Sistema (não altera comportamento):** padronizar confirmação ao **desativar cliente**
  (apontado em `docs/revisao-telas-por-perfil.md`).

## Pendências
- Confirmar quais perfis recebem `comercial:gerir` por padrão (decisão de seed em aberto
  em `docs/revisao-telas-por-perfil.md`, item 0.A.4).
- Detalhar o fluxo de **conversão de lead** (o que exatamente ele cria).
