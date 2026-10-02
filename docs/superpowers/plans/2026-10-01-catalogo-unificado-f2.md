# Catálogo de nomenclatura — Fase 2 (lente vN: rota, seletor, abas, lápis, menu) — Plano

> **Para quem executa:** superpowers:executing-plans (inline). **Modelo: Sonnet** (spec §0, F2). Passos com `- [ ]`.
> Este plano é enxuto de propósito: fixa arquivos, contratos (assinaturas), regras e casos de teste.
> O código segue o padrão dos vizinhos e do mockup aprovado.

**Goal:** A tela "Catálogo da vN" vira a tela única de nomenclatura na lente de uma versão: rota `/configuracoes/nomenclatura/[lente]`, seletor de versão em lista, abas Disciplinas/Fases/Tipos, agrupamento por categoria, busca, menu de contexto + ⋯, e o lápis (cadastro sem nada de versão).

**Spec:** [2026-09-30-catalogo-nomenclatura-unificado.md](../specs/2026-09-30-catalogo-nomenclatura-unificado.md) — E1, E2, E6, E8, E9, E10, E12, §4.1, §4.2, §4.6. **Mockup (contrato):** artifact `2YtpNHYrCbRPNLDJ8mQRMR` (boards "Lente v2", "Editar cadastro", "Celular").

**Fora desta fase:** lente "Todas as versões" e aba "Formatos de folha" (F3); retirada das telas antigas (F4). Até a F3, o item "Todas as versões" do seletor leva a `/configuracoes/disciplinas`.

## Global Constraints
- Commits Conventional em pt-BR, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage arquivo a arquivo; `git show --stat` depois.
- Toda mutação por `defineAction` (+ `capturarAntes`); erro de negócio = `ActionError`; arquivo `"use server"` só exporta async.
- Sem `Promise.all` em transação. Regras puras ficam em arquivo sem Prisma/Next/React (testadas).
- shadcn sobre base-ui (`render=`, nunca `asChild`); componente de linha no nível do arquivo (ADR-0002); `await confirm()` antes de `startTransition`.
- `CabecalhoPagina` é o 1º elemento da página; descrição curta sem link; tela pronta só com `scrollWidth` 390 em 390×844 e cabeçalho sem sobrepor a barra em 1366×768 com o menu aberto.
- UI em pt-BR. Banco/.env: rodar com `DOTENV_CONFIG_PATH=../SENAHub-remake-vscode/.env`; build com `NODE_ENV=production`.

## Review Focus
1. `/configuracoes/nomenclatura` redireciona sem laço e `/versoes` continua dando acesso a criar/publicar versão.
2. Código da pasta (`codigo`) muda só com `uso = 0`; com uso > 0 o servidor recusa com a mesma frase que a tela mostra.
3. Renomear disciplina pelo lápis cascateia `disciplinaTextoLegado` como o formulário antigo (projeto que já tem o nome de destino fica de fora).
4. Lápis nunca mexe em linhas de sigla, sinônimos nem faixa de versão.
5. Menu de contexto e ⋯ têm as mesmas ações; sem item que o perfil não pode.

## Mapa de arquivos
| Arquivo | Papel | Task |
|---|---|---|
| `src/modules/projetos/nomenclatura/catalogo/acoes.ts` (+test) | `itensDaLinhaCatalogo` (puro) | 1 |
| `src/modules/projetos/nomenclatura/catalogo/apresentacao.ts` (+test) | `agruparCards`, `filtrarCatalogo`, `opcoesDeVersao` (puros) | 1 |
| `src/modules/projetos/cadastro-disciplina.ts` (+test) | `motivoCodigoTravado` (puro) | 1 |
| `src/modules/projetos/actions.ts` | `editarCadastroDisciplina`; cascata do nome extraída | 2 |
| `src/modules/projetos/subdisciplinas/actions.ts`, `pranchas/catalogo-actions.ts` | `editarNomeSubdisciplina`, `editarNomeItemListaMestre` | 2 |
| `src/app/(dashboard)/configuracoes/nomenclatura/{page,versoes/page,[lente]/page}.tsx` | rotas | 3 |
| `src/components/configuracoes/catalogo/*` + `catalogo-versao-view.tsx` | tela | 4 |
| `docs/manual/…` | manual | 5 |

---

### Task 1: Regras puras
**Files:** criar os 3 módulos acima e seus `.test.ts`.

**Contratos**
- `itensDaLinhaCatalogo(linha: { alvo: AlvoCatalogo }, ctx: { podeGerir: boolean; podeEditarCard: boolean; versao: number }): AcaoItem[]`
  - ids exportados: `ACAO_SIGLAS="siglas"`, `ACAO_ADICIONAR_SUB="adicionar-sub"`, `ACAO_EDITAR="editar"`, `ACAO_TIRAR="tirar"`.
  - card: Siglas nesta versão · Adicionar sub-disciplina · Editar cadastro · separador · Tirar da vN (destrutivo, **sem** `confirmar`: a tela confirma).
  - sub/fase/tipo: sem "Adicionar sub".
  - `!podeGerir` omite Siglas, Adicionar sub e Tirar; "Editar" de card exige `podeEditarCard`; sem nenhum item → `[]`.
- `agruparCards(cards: CardNaVersao[]): { categoria: string; cards: CardNaVersao[] }[]` — por `categoria`, ordem alfabética (`localeCompare pt-BR`), sem categoria vira `"Outras"` por último; ordem interna preservada.
- `filtrarCatalogo(cards, busca)`: casa nome, sigla, sinônimos (sem acento/caixa); card aparece se ele ou uma sub casar; subs mostradas = as que casam (todas se o card casa); busca vazia = tudo.
- `opcoesDeVersao(versoes: { numero; nome; publicadaEm: Date | null }[]): { numero; nome; rascunho: boolean; vigente: boolean }[]` — mais nova primeiro; `vigente` = a publicada de maior número.
- `motivoCodigoTravado(uso: number): string | null` — `uso > 0` → `Em uso em ${uso} ${uso === 1 ? "projeto" : "projetos"}: mudar agora separaria os arquivos em duas pastas.`

**Passos:** escrever os testes (um por regra acima, incluindo vazio/"Outras"/singular) → rodar e ver falhar → implementar → rodar → commit `feat(nomenclatura): regras puras da lente vN (menu, agrupamento, busca, seletor)`.

### Task 2: Actions do lápis (E9)
**Files:** `projetos/actions.ts`, `projetos/subdisciplinas/actions.ts`, `projetos/pranchas/catalogo-actions.ts`.

- `editarCadastroDisciplina({ id, nome, categoria?, icone?, iconeSvg?, codigo?, numeracao?, numeracaoFim? })` — `catalogoBase` (projetos:gerir), `capturarAntes`. Usa `normalizarCatalogo` (sem sinônimos), `canonizarCategoria`, `garantirUnicosCatalogo(nome, codigo, [], id)`, `garantirFaixaLivre`. `codigo` diferente do atual só passa se `motivoCodigoTravado(uso) === null` — `uso` = projetos distintos com `disciplinaTextoLegado` normalizado igual ao nome ATUAL; senão `ActionError(motivo)`. Atualiza **só** nome, categoria, icone, iconeSvg, codigo, numeracao, numeracaoFim. Renomeou → cascata `disciplinaTextoLegado` (extrair o bloco de `editarDisciplinaCatalogo` para `cascatearNomeDisciplina(tx, de, para)` e usar nos dois).
- `editarNomeSubdisciplina({ id, nome })` (configuracoes:gerir): nome único no card.
- `editarNomeItemListaMestre({ id, nome })` (configuracoes:gerir): só item global (`projetoId = null`) de categoria fase/tipo.
- `revCatalogo()`/`rev()` passam a revalidar também `/configuracoes/nomenclatura` (layout).

**Passos:** extrair a cascata (testes existentes seguem verdes) → implementar as 3 actions → `tsc` + `eslint` → commit `feat(nomenclatura): actions do lápis (cadastro sem versão)`.
(As regras com I/O ficam cobertas pela conferência em navegador da Task 6; a regra pura já tem teste na Task 1.)

### Task 3: Rotas
- `nomenclatura/page.tsx` → `redirect("/configuracoes/nomenclatura/<maior número>")` (E1; padrão = versão mais nova).
- `nomenclatura/versoes/page.tsx` = a página de versões de hoje (E12), mesmo gate.
- `nomenclatura/[numero]` → renomear pasta para `[lente]`; `lente` só numérico (outro valor → `notFound()`); abre com `can(configuracoes:gerir) || can(configuracoes:disciplinas)` (E10) senão `/sem-permissao`; entrega `podeGerir`, `podeEditarCard` (`projetos:gerir`), `snap`, `catalogoNaVersao`, `versoes` (`listarVersoesAdmin`) e `cadastro` = `catalogoDisciplinasAdmin()` indexado por id (icone, iconeSvg, codigo, numeracao, numeracaoFim, categoria, versaoDesde/Ate, uso).
- Links: tela de versões "Catálogo da vN" segue; `nomenclatura-form.tsx` e os textos "criada em Nomenclatura" → `/configuracoes/nomenclatura/versoes`; cartão de Configurações → título "Disciplinas e nomenclatura", mesma rota.
- Commit `feat(nomenclatura): rota única [lente], versões em /versoes`.

### Task 4: Tela (segue o mockup)
- Cabeçalho: título "Disciplinas e nomenclatura", descrição "Catálogo do padrão de nome de arquivo, versão por versão.", trilha Início › Configurações; ações: **+ Disciplina** (rótulo muda com a aba: + Fase / + Tipo) e **Versões** (link); `⋯` com "Importar planilha".
- Depois do cabeçalho: seletor de versão em lista (`Select` com "Todas as versões" → `/configuracoes/disciplinas` até a F3, depois versões da mais nova para a mais antiga com selos "rascunho"/"vigente"), abas `?aba=disciplinas|fases|tipos`, faixa de aviso (rascunho/publicada), contagem, busca.
- Disciplinas: agrupado por categoria; linha = nome · CARD/SUB · selo da sigla oficial + sinônimos tracejados · situação · `+` (card) e `⋯`; subs aninhadas; `LinhaComMenu` + `BotaoAcoes` com o mesmo `itensDaLinhaCatalogo`; "Saem na vN" e "Voltar" como na F1.
- Fases/Tipos: lista simples com as mesmas ações (sem "+ sub").
- Lápis ("Editar cadastro"): card → nome, categoria (+ chips), **Pasta dos arquivos** (editável com `uso = 0`, travada com `motivoCodigoTravado`), numeração (só se alguma versão em que o card vale numera por faixa), ícone (galeria/SVG); sub/fase/tipo → só nome.
- Reaproveita `AdicionarItemDialog`, `SiglasNaVersaoDialog`, `VoltarVersaoDialog` da F1.
- Commit `feat(nomenclatura): tela única na lente vN (abas, seletor em lista, menu, lápis)`.

### Task 5: Manual
`docs/manual/sistema/configuracoes.md` (novo caminho, abas, lápis, pasta dos arquivos, Versões), `novidades.md`, `search-index.json` (palavras-chave).

### Task 6: Verificação
`npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run smoke:catalogo-nomenclatura`, `npm run build` (NODE_ENV=production). Navegador (:3002): redirect da raiz; `/versoes`; seletor; abas; busca; menu de contexto = ⋯; lápis do card (pasta travada com uso, editável sem uso; renomear); adicionar/siglas/voltar da F1 seguem; 390×844 `scrollWidth` 390. Revisão final por revisor novo (Opus). Fast-forward de `dev-vscode`.
