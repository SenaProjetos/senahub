---
titulo: ADR-001 — Estrutura da documentação do usuário
descricao: Decisão sobre onde e como organizar o manual do usuário do SenaHub.
resumo: Manual sob docs/manual/, separado do docs dev, com metadados padronizados e índice de busca.
tags: [adr, decisão, estrutura, documentação]
palavras-chave: [adr, decisão arquitetural, estrutura de pastas, manual, metadados]
sinonimos: [registro de decisão, decision record]
---

# ADR-001 — Estrutura da documentação do usuário

- **Data da revisão:** 2026-06-30
- **Responsáveis:** Conselho Permanente de Documentação (Presidente + membros)
- **Estado:** Aceito

## Contexto

O escritório precisa de uma base de conhecimento oficial para **usuários** do SenaHub
(colaboradores, gestão, clientes). O diretório `docs/` já existe, porém contém
documentação **de desenvolvimento** (HANDOFF, specs, plans, DEPLOY, legal) — público e
finalidade diferentes. É preciso decidir **onde** e **como** organizar o manual de
usuário sem misturar os dois públicos e mantendo compatibilidade com geradores de site
estático (MkDocs, Docusaurus, VitePress).

## Problema

1. Onde colocar o manual sem colidir com a documentação técnica existente?
2. Que estrutura interna usar para escala (27 módulos)?
3. Como viabilizar busca e referências cruzadas desde o início?

## Alternativas consideradas

1. **Raiz `docs/` (como no spec literal).** Simples, mas mistura manual de usuário com
   specs de dev no mesmo nível — confuso para ambos os públicos e arriscado (risco de
   sobrescrever/relacionar arquivos de finalidade distinta).
2. **Repositório/site separado.** Limpo, mas adiciona infraestrutura e desacopla a doc
   do código — contraria o princípio de manter a doc sincronizada com o código no mesmo
   repo.
3. **Subárvore `docs/manual/` (escolhida).** Mantém tudo no mesmo repositório (sincronia
   com o código), isola o público de usuário, e serve de **docs root** independente para
   um gerador estático.

## Decisão

- O manual de usuário fica em **`docs/manual/`**, com a estrutura interna prevista no
  spec do Conselho:
  - `README.md` (portal/índice), `quick-start.md`, `faq.md`, `glossary.md`,
    `search-index.json`;
  - uma pasta por **seção** alinhada aos grupos reais de `src/lib/nav-config.ts`
    (`inicio/`, `projetos/`, `clientes-comercial/`, `financeiro/`, `rh-ponto/`,
    `engenharia/`, `gestao/`, `comunicacao/`, `sistema/`);
  - `decisions/` (ADRs) e `deliberacoes/` (histórico do Conselho).
- **Toda página** carrega metadados no frontmatter: `titulo`, `descricao`, `resumo`,
  `tags`, `palavras-chave`, `sinonimos`.
- O `search-index.json` espelha esses metadados para busca/integração.
- **Fonte da verdade = código.** Onde o código diverge de docs anteriores (ex.: 9
  perfis incluindo `ti`, não 8; itens de menu além dos listados no CLAUDE.md), vale o
  código.

## Consequências

- ✅ Públicos separados; sem risco para a documentação técnica existente.
- ✅ Pronto para MkDocs/Docusaurus/VitePress apontando para `docs/manual/`.
- ✅ Busca e referências cruzadas viáveis desde o primeiro dia.
- ⚠️ Diverge da raiz literal sugerida no spec — justificado pela coexistência com o
  `docs/` de desenvolvimento.
- ⚠️ Exige manter `search-index.json` em dia a cada nova página (responsabilidade do
  Revisor Técnico na aprovação).

## Relacionados

- [Deliberação — Fundação do manual e Guia de Início Rápido](../deliberacoes/2026-06-30-fundacao-quick-start.md)
