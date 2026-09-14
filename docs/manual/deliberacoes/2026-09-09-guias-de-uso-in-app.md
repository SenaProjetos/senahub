---
titulo: Deliberação — Guias de uso in-app (F0)
descricao: Ata sobre a criação da área Guias de uso, a revogação de D1 e o gate por colaborador interno.
resumo: Guia de uso passa a ser página React em /guias/[setor]; o markdown vira stub. Novo gate requireInterno.
tags: [deliberação, conselho, guias de uso, formação, gate, interno]
palavras-chave: [deliberação, ata, guia de uso, guias, formação, requireInterno, tipo, vínculo]
sinonimos: [ata técnica]
---

# Deliberação — Guias de uso in-app (F0)

- **Data:** 2026-09-09
- **Funcionalidades:** `/guias`, `/guias/[setor]`, `/comercial/guia` (redirect), `requireInterno()`.
- **Plano:** [`2026-09-09-guias-de-uso-in-app.md`](../../superpowers/plans/2026-09-09-guias-de-uso-in-app.md)
- **ADR:** [`0001-guias-de-uso-in-app.md`](../../adr/0001-guias-de-uso-in-app.md)

## Participantes
Presidente, Iniciante, Treinamento, Backend, Segurança, Revisor Técnico.

## Contexto

O dono pediu replicar o padrão de `/comercial/guia` para os setores mais usados. A inspeção
mostrou que o piloto do Comercial existia em **três cópias divergentes** — a página React de 531
linhas (a usada), o `guia-iniciante.md` de 72 linhas (conteúdo diferente) e um artifact congelado
fora do repositório — e que a decisão D1 do plano de 2026-07-20 ("fonte da verdade = markdown, o
artifact é saída gerada dele") **nunca foi cumprida**: o React foi escrito depois, à mão. A Onda 1
(Projetos) daquele plano nunca saiu; só um `guia-iniciante.md` existia no repositório inteiro.

## Descobertas (inspeção de código)

- **`User.tipo` é nullable e sem default** (`prisma/schema.prisma:89`), escrito apenas por
  `aplicarVinculo()` (`modules/usuarios/vinculo/service.ts`). `null` significa "sem vínculo
  aplicado", **não** "externo".
- O filtro de navegação compara `item.tipo === ctx.tipo` de forma estrita
  (`lib/nav-config.ts:419`). Com `tipo: null`, os **14 itens** que usam esse eixo desapareciam do
  menu — Início, Tarefas, Agenda, Ponto, RH e outros — sem erro e sem rastro.
- Precedente relacionado: `/versoes` gateia a rota em `INTERNAL_ROLES` (`versoes/page.tsx:23`) e usa
  `nav.tipo === "interno"` apenas para exibir o link do rodapé. O eixo `role` foi mantido no gate,
  provavelmente por causa dessa nullability.
- `getSession` (`lib/session.ts`) já fazia um `findUnique` no `User` e é `cache()`d por request:
  acrescentar `tipo` ao `select` não custa round-trip novo.
- Medição no banco de dev (`seed:demo`): 100% dos usuários ativos têm `tipo` preenchido
  (9 internos, 2 externos). Zero nulos — mas o dado é de demonstração e a coluna segue opcional.

## Opiniões dos Especialistas

- **Iniciante:** o guia do Comercial não tinha seção de vocabulário; o glossário existia só no
  `.md`, que ninguém abre. Em Financeiro e RH o travamento é no **termo**, não no clique.
- **Treinamento:** manter duas superfícies com "propósitos distintos" já falhou uma vez. Sem
  mecanismo de sincronia, degrada em duas fontes divergentes.
- **Segurança:** um gate que trata `tipo: null` como externo tranca colaborador de verdade em
  silêncio; e menu e gate divergirem produz o par "vê o link e toma 404". A regra tem de ser uma só.
- **Backend:** `Omit<SessionUser, …>` em `getSession` é armadilha — campo novo fora da lista faz o
  TypeScript acreditar que já existe, e o valor chega `undefined` em runtime com `lint` e `build`
  limpos.
- **Revisor Técnico:** `docs/agents/domain.md` já define `docs/adr/` na raiz como a convenção
  vigente e diz que `docs/manual/` não substitui ADR. O registro vai para lá, com nota cruzada no
  `ADR-001` legado.

## Discussão

Consenso em escolher **uma** superfície canônica em vez de tentar sincronizar duas. A página React
ganha por precisar de coisas que o markdown não dá: `<Link>` para rotas reais (que quebra no
type-check quando a rota desaparece), botões de ação, trilha visual e índice fixo. O `.md` sobrevive
como **stub** porque a busca do `/ajuda` é o único canal por palavra-chave — sem ele, quem procura
"período aquisitivo" nunca chegaria ao guia de RH.

Sobre o eixo de acesso: material de formação não é dado operacional, e ler sobre o Financeiro sem
ter `financeiro:ver` é justamente o caso de uso. Gate por `tipo` (o eixo vigente desde a Onda D) e
não por permissão de módulo. O nulo é resolvido por um helper único, `tipoEfetivo()`, usado tanto
pelo gate quanto pelo contexto do menu.

## Divergências

Nenhuma quanto ao resultado. Registrada uma ressalva de **Backend**: `tipoEfetivo()` no
`(dashboard)/layout.tsx` muda o comportamento de **todos** os itens de menu com eixo `tipo`, não só
dos guias — usuário sem vínculo passa a ver o menu interno em vez de nenhum. Avaliado como correção
da assimetria existente, não como efeito colateral: a alternativa era manter o menu vazio para quem
tem acesso às páginas.

## Decisão Final

- **D1 do plano de 2026-07-20 está revogada.** Fonte da verdade de um guia de uso = página React.
- Área **Guias de uso** em `/guias` (índice dos 9 setores, 4 em preparação nesta fase) e
  `/guias/[setor]`. `/comercial/guia` responde `permanentRedirect`.
- Novo `requireInterno()` (`lib/session.ts`) e `tipoEfetivo()` (`lib/roles.ts`); `tipo` exposto em
  `SessionUser` (e acrescentado ao `Omit<>`).
- Item **Guias de uso** no menu, com `tipo: "interno"`, colado na Ajuda.
- Primitivas dos guias extraídas para `src/components/guias/` (`primitivas.tsx`, `guia-shell.tsx`).
  `vocabulario` e `armadilhas` são **props obrigatórias** do `GuiaShell` — tipo obrigatório é o que
  impede a próxima fase de "esquecer" as duas seções.
- Guia do Comercial migrado, agora com `#vocabulario` (11 termos) e `#armadilhas` (6 itens).
- `clientes-comercial/guia-iniciante.md` reduzido a stub; entrada correspondente do
  `search-index.json` atualizada.

## Melhorias Sugeridas

- Seguir as fases F1–F4 do plano (Projetos → Financeiro → RH/Ponto → Gestão), respeitando o modelo
  de IA por fase.
- Considerar encolher a query duplicada de `(dashboard)/layout.tsx` agora que `tipo` está na sessão.
  Deliberadamente fora do escopo desta fase.

## Pendências

- Gestão não tem página-âncora natural para o botão "Guia" (são seis rotas independentes);
  `/licitacoes` foi adotado provisoriamente e a F4 revisita.
