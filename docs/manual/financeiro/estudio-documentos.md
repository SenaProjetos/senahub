---
titulo: Estúdio de Documentos
descricao: Modelos de documento com campos dinâmicos (tokens) que puxam dados do sistema e geram PDF.
resumo: Crie modelos reutilizáveis com tokens que se preenchem com dados de uma fonte (projeto, cliente, financeiro…), pré-visualize e gere o documento final; controle visibilidade por perfil e versões.
tags: [documentos, estúdio, modelo, template, token, campo dinâmico, pdf, carimbo, dataset, versão]
palavras-chave: [documento, estúdio, modelo, template, token, campo, fonte de dados, pdf, gerar documento, carimbo, dataset, visibilidade]
sinonimos: [gerador de documentos, modelos de documento, templates, mala direta]
---

# Estúdio de Documentos

## Objetivo

Padronizar documentos (contratos, propostas, declarações, relatórios) por meio de
**modelos** com **campos dinâmicos** que se preenchem automaticamente com dados do
sistema, gerando o documento final em **PDF**.

## Quando utilizar

- Para emitir documentos repetitivos com dados que mudam por projeto/cliente.

## Como acessar

- Menu → **Documentos** (`/documentos`). Exige `documentos:ver`. **Criar/editar modelos
  exige `documentos:gerir`**.
- Disponível a admin, supervisor e administrativo.

## Conceitos

- **Modelo (template):** o documento-base, com texto fixo e **tokens**.
- **Fonte de dados:** de onde os tokens puxam valores (ex.: projeto, cliente,
  financeiro). Cada modelo tem uma fonte.
- **Token:** marcador que é substituído pelo dado real ao gerar. Sintaxe do Estúdio:
  - `[Campo]` e `[Fonte.Campo]` — um valor;
  - `[Sum/Avg/Count/Min/Max(X)]` — agregações;
  - `[= expr]` — expressão calculada; `[Pagina]`, `[Grupo]`;
  - **formatação** por sufixo: `:c2` (moeda), `:d` (data), `:p1` (percentual), `:n0`
    (inteiro).
- **Versões:** cada modelo guarda histórico de versões.
- **Visibilidade / perfis:** o dono define quem enxerga/usa o modelo (por perfil).

## Fluxo de uso

1. **Criar um modelo** (`documentos:gerir`): nome, tipo, **fonte de dados**, e o conteúdo
   com tokens.
2. **Pré-visualizar** o modelo com dados de exemplo (`/documentos/{id}/preview`).
3. **Gerar** o documento final para um registro real → fica em **Gerados**
   (`/documentos/gerados`), com PDF.

## Recursos relacionados (sub-telas)

- **Carimbos** (`/documentos/carimbos`): carimbos/assinaturas reutilizáveis.
- **Datasets** (`/documentos/datasets`): conjuntos de dados auxiliares para fontes.
- **Gerados** (`/documentos/gerados`): histórico dos documentos já emitidos.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver modelos e gerar | `documentos:ver` |
| Criar/editar modelos, carimbos, datasets | `documentos:gerir` |

## Limitações

- A geração de PDF depende do navegador Chrome configurado no servidor (`CHROME_PATH`).
- Cada modelo usa **uma** fonte de dados.

## Funcionalidades relacionadas

- [Comercial — Propostas](../clientes-comercial/comercial.md) · [Projetos](../projetos/projetos.md)

## FAQ

**Os tokens se preenchem sozinhos?** Sim — ao gerar, cada token é substituído pelo dado
real da fonte escolhida.

**Posso restringir quem usa um modelo?** Sim, pela visibilidade/perfis do modelo.
