---
titulo: Manual do SenaHub — Início
descricao: Portal da documentação oficial do SenaHub para usuários do sistema.
resumo: Página inicial da base de conhecimento. Índice por seção, busca e como começar.
tags: [manual, documentação, índice, início, ajuda]
palavras-chave: [manual, ajuda, documentação, guia, suporte, como usar, índice]
sinonimos: [help, docs, central de ajuda, base de conhecimento, wiki]
---

# Manual do SenaHub

Bem-vindo à documentação oficial do **SenaHub**, a plataforma de gestão integrada
(ERP) do escritório de engenharia BIM. Esta base de conhecimento é mantida pelo
**Conselho Permanente de Documentação** e descreve o comportamento **real** do
sistema — não suposições.

> **Para quem é este manual:** usuários do sistema (colaboradores, gestão,
> clientes). Para documentação técnica de desenvolvimento, veja os arquivos em
> `docs/` (HANDOFF, specs, plans) — público diferente.

---

## Comece por aqui

- **[Guia de Início Rápido](quick-start.md)** — o essencial para usar o sistema em
  poucos minutos: acessar, navegar, cadastrar, editar, excluir, pesquisar e filtrar.
- **[Perguntas Frequentes (FAQ)](faq.md)** — dúvidas e erros comuns com solução.
- **[Glossário](glossary.md)** — termos do sistema explicados.

---

## Índice por seção

> O índice reflete os módulos reais do sistema (`src/lib/nav-config.ts`). ✅ = núcleo
> documentado; algumas sub-telas seguem marcadas 🚧 dentro de cada seção.

| Seção | Conteúdo | Estado |
| --- | --- | --- |
| [Início e Portal](inicio/) | Dashboard, KPIs, portal do cliente | ✅ |
| [Projetos](projetos/) | Projetos, Meu trabalho, Tarefas, Agenda, Planejamento, Recursos | ✅ |
| [Clientes e Comercial](clientes-comercial/) | Clientes, Comercial (propostas, funil) | ✅ |
| [Financeiro](financeiro/) | Lançamentos, contas, conciliação OFX, Documentos/Estúdio | ✅ |
| [RH e Ponto](rh-ponto/) | Ponto, RH, Folha CLT, Funcionários, Produtividade, PJs | ✅ |
| [Engenharia](engenharia/) | Ferramentas de cálculo (NBR), desenhos e memórias | ✅ |
| [Gestão](gestao/) | Jurídico, Licitações, Qualidade, Patrimônio, TI | ✅ |
| [Comunicação](comunicacao/) | Chat, Suporte, Notificações | ✅ |
| [Sistema](sistema/) | Preferências, Configurações, Auditoria | ✅ |

---

## Como pesquisar

- Dentro do **sistema**: tecle **Ctrl + K** (ou **⌘ + K** no Mac), ou clique em
  **Buscar** no topo. A busca encontra projetos, clientes, tarefas, documentos,
  lançamentos, licitações e propostas (mín. 2 caracteres).
- Dentro deste **manual**: cada página tem `tags`, `palavras-chave` e `sinonimos`
  nos metadados, e há o índice de busca em [`search-index.json`](search-index.json),
  pronto para integração com MkDocs / Docusaurus / VitePress.

---

## Como o Conselho trabalha

Cada funcionalidade é inspecionada no código (componentes, ações, banco, testes)
antes de ser documentada. Para cada uma, o Conselho registra:

- a **documentação** final (em `<seção>/`),
- o **histórico das deliberações** (em [`deliberacoes/`](deliberacoes/)),
- e, quando há decisão relevante, um **ADR** (em [`decisions/`](decisions/)).

Veja [ADR-001 — Estrutura da documentação](decisions/ADR-001-estrutura-documentacao.md).
