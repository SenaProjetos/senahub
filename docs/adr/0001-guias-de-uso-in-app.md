---
status: accepted
date: 2026-09-09
---

# ADR-0001 — A página React é a fonte da verdade do guia de uso

Os **guias de uso** (camada de formação: vocabulário, porquê e encadeamento das telas de um setor)
vivem como **páginas React** em `/guias/[setor]`, e não como markdown em `docs/manual/`. Cada setor
com guia mantém em `docs/manual/<secao>/guia-iniciante.md` apenas um **stub** de poucas linhas que
aponta para a rota, com entrada no `search-index.json` para continuar achável na busca do `/ajuda`.

Isto **revoga a decisão D1** do plano `docs/superpowers/plans/2026-07-20-guias-iniciante-setores.md`
("fonte da verdade = markdown; o artifact é uma saída gerada dele, nunca editado sozinho"), e altera
o alcance do [ADR-001](../manual/decisions/ADR-001-estrutura-documentacao.md) — que segue valendo
integralmente para o **manual de referência**, mas não mais para os guias de formação.

## Contexto

D1 foi travada em 2026-07-20 e não sobreviveu ao primeiro guia. Em 2026-09-09 o guia do Comercial
existia em três cópias divergentes: `guia-comercial-view.tsx` com 531 linhas (a que as pessoas
usam), `clientes-comercial/guia-iniciante.md` com 72 (conteúdo diferente), e um artifact congelado
fora do repositório. O `.md` **não** gerou o React — o React foi escrito depois, à mão, direto.
Nenhum dos outros 8 setores chegou a ter `.md`.

Ou seja: a fonte declarada era a que ninguém editava. Escalar isso para 9 setores produziria 27
documentos em drift.

## Alternativas consideradas

1. **Manter D1 e gerar a página a partir do markdown**, com overrides de componente no
   `react-markdown` (ou MDX) para preservar o tratamento visual (`<Acao>`, `<Dica>`, `<Etapa>`).
   Tecnicamente resolve o drift e preserva a visibilidade no `/ajuda`. Rejeitada porque exige
   inventar uma sintaxe de marcação paralela (`:::acao` etc.) e mantê-la para nove documentos, e
   porque a página precisa de coisas que markdown não dá bem: `<Link>` para rotas reais (que quebra
   no type-check quando a rota some), botões de ação, timeline de marcos, índice sticky.
2. **Manter as duas superfícies com conteúdos distintos**, cruzadas por link. Rejeitada: é o estado
   de 2026-09-09, e ele já falhou — sem mecanismo de sincronia, "duas fontes com propósitos
   distintos" degrada em duas fontes divergentes.
3. **Página React canônica, `.md` reduzido a stub** (escolhida).

## Consequências

- **O guia deixa de ser visível para `cliente`.** `/guias` é gated em colaborador interno (eixo
  `tipo`, não `role`) — deliberado: a linguagem é de operação interna, e para o cliente existe o
  Portal. O manual de referência continua aberto a todos os perfis.
- **A busca do `/ajuda` só encontra o guia pelo stub.** Se o stub ou a entrada no
  `search-index.json` for esquecida, o guia fica inalcançável por palavra-chave. É item de DoD.
- **Rotas removidas viram erro de tipo**, não texto silenciosamente errado — ganho real sobre
  markdown.
- **A fronteira editorial passa a ser a única defesa contra duplicação.** Guia = significado,
  porquê, encadeamento; manual = permissões, regras, campo a campo, tabela de erros. O guia linka,
  nunca repete.
- `docs/manual/` **não** deixa de ser a fonte de nada além dos guias de formação. Todo o manual de
  referência continua markdown-first, como o ADR-001 estabeleceu.

Plano de execução: [`docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`](../superpowers/plans/2026-09-09-guias-de-uso-in-app.md).
