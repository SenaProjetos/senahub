# Engenharia de Custos — Onda C0: Fundação

**Data:** 2026-07-27 · **Status:** implementado — `tsc`/`test`/`lint`/`build` limpos, `db:seed` rodado, commit `9c0c2d5` (schema/migration em `804bc37`) · **Branch:** `dev` · **Modelo:** Opus

Fonte de verdade arquitetural: [design de conformidade](../specs/2026-07-27-engenharia-custos-design.md).
Instrução de trabalho: [prompt de implementação](../prompts/2026-07-27-engenharia-custos-implementacao.md).

---

## 1. Goal

Fundação do módulo `custos`: schema base do orçamento, permissões, navegação, aba do projeto, cabeçalho
do orçamento (contratante, data-base, BDI, encargos, regime tributário) e os três **módulos puros**
(`bdi.ts`, `encargos-obra.ts`, `orcamento-arvore.ts`) com testes.

Ao fim da onda o usuário cria um orçamento (vinculado a projeto **ou** avulso), edita o cabeçalho e vê
BDI e encargos sociais calculados e demonstrados na tela. Nenhum item, nenhuma composição, nenhuma base de
preço — isso é C1/C2.

## 2. Decisões bloqueantes — respondidas pelo dono (2026-07-27)

| # | Decisão | Consequência neste plano |
|---|---|---|
| **D1** | Orçamento **pode** existir sem `Projeto` (estudo avulso / terceiros) | `projetoId String?` + `nomeAvulso String?`, com regra "um ou outro" no Zod **e** no service; escopo de leitura ganha o caminho do avulso (§6, Passo 6) |
| **D4** | A ponte com o Financeiro existe **só** pelo caminho licitação/proposta. `CustoMedicao` fica isolada | C0 grava apenas a **FK reservada** `licitacaoId` no cabeçalho. Nenhum `Lancamento` é criado por custos nesta onda nem na C6 — reavaliar em onda futura |
| **D6** | "Múltiplas empresas" = **só múltiplas bases de preço** | **Nenhuma coluna `empresaId`** em tabela alguma. Multi-tenant sai de escopo do módulo |

Pendentes, **não** bloqueiam C0: D2 (formato SINAPI → C1), D3 (aprovação por alçada → C6), D5 (cronograma
× `EapTarefa` → C5).

## 3. Architecture

```
src/modules/custos/
  types.ts                     # tipos compartilhados client/server (sem server-only)
  registry.ts                  # rótulos client-safe: status, regimes, tipo de item
  queries.ts                   # server-only: listar/obter orçamento (+ escopo de acesso)
  actions.ts                   # defineAction: criar, atualizar cabeçalho/BDI/encargos, cancelar
  schemas.ts                   # Zod
  service.ts                   # regra compartilhada actions ↔ (futuros) jobs
  bdi.ts + bdi.test.ts                     # PURO — Acórdão TCU 2622/2013
  encargos-obra.ts + .test.ts              # PURO — Grupos A/B/C/D, horista/mensalista, (des)oneração
  orcamento-arvore.ts + .test.ts           # PURO — WBS, herança de BDI, roll-up incremental

src/app/(dashboard)/custos/page.tsx              # lista global de orçamentos
src/app/(dashboard)/custos/[id]/page.tsx         # cabeçalho + demonstrativos
src/app/(dashboard)/projetos/[id]/custos/page.tsx # aba do projeto
src/components/custos/                            # *-view / *-dialog / *-form
```

Sem rota REST nesta onda (não há multipart nem export em C0).

### 3.1 Schema (prisma/schema.prisma)

Enums novos — minúsculo snake, conforme convenção:

```prisma
enum StatusCustoOrcamento { rascunho  em_elaboracao  concluido  aprovado  cancelado }
enum CustoRegimeTributario { lucro_presumido  lucro_real  simples_nacional }
enum CustoRegimeEncargos { desonerado  nao_desonerado }
enum CustoTipoItem { grupo  servico }
```

**`CustoOrcamento`** — cabeçalho, é o que é versionado (BDI e data-base mudam entre revisões; por isso
não moram no `Projeto`):

- identidade: `titulo`, `descricao?`, `status`
- obra: `projetoId String?` + `nomeAvulso String?` (D1) · `contratanteId String?` → `Cliente` +
  `contratanteNome String?` (contratante que não é cliente cadastrado)
- `dataBase DateTime @db.Date` — data-base dos preços de todo o orçamento
- **BDI** (10 percentuais `Decimal(5,2)`): `bdiAdmCentral`, `bdiSeguro`, `bdiRisco`, `bdiGarantia`,
  `bdiDespesasFinanceiras`, `bdiLucro`, `bdiPis`, `bdiCofins`, `bdiIss`, `bdiCprb`
  \+ `bdiPercentual Decimal(5,2)?` **materializado** (resultado gravado no momento do cálculo)
- **Encargos**: `regimeEncargos`, `encargosPreset String @default("sinapi")`,
  `encargosOverridesJson Json?` (override por rubrica), e os dois resultados materializados
  `encargosHoristaPct` / `encargosMensalistaPct` (`Decimal(5,2)?`)
- `regimeTributario CustoRegimeTributario`
- `licitacaoId String?` → `Licitacao` — **FK reservada (D4)**, sem uso funcional em C0
- `criadoPorId`, `createdAt`, `updatedAt`
- `@@index([projetoId])`, `@@index([status])`, `@@index([licitacaoId])`, `@@map("custo_orcamento")`

> **Por que `encargosOverridesJson` e não 40 colunas:** a planilha de encargos tem ~25 rubricas em 4 grupos,
> e cada orçamento normalmente aceita o preset inteiro. Coluna por rubrica seria 50 colunas (horista +
> mensalista) mortas em 95% dos casos. O que precisa ser reproduzível anos depois — o **percentual final** —
> está materializado em coluna tipada. O detalhe de como se chegou nele fica no snapshot da revisão.

**`CustoOrcamentoRevisao`** — snapshot imutável (`numero Int`, `@@unique([orcamentoId, numero])`,
`snapshotJson`, `valorTotal`, `valorTotalComBdi`, `dataBase`, `criadoPorId`, `createdAt`).
Model declarado agora; **quem escreve nela é a C6**. Nunca sofre `UPDATE` nem `DELETE`.

**`CustoOrcamentoItem`** — nó da árvore: `orcamentoId`, `parentId?` (auto-relação), `tipo`,
`codigo` (WBS materializado, `@@unique([orcamentoId, codigo])`), `ordem`, `descricao`, `unidade?`,
`quantidade Decimal(12,2)`, `custoUnitario Decimal(14,2)` **materializado**, `bdiPercentual Decimal(5,2)?`
(nulo = herda), `bloqueado Boolean`, `totalSemBdi`/`totalComBdi` `Decimal(14,2)` materializados pelo
roll-up. Model declarado agora; **CRUD e roll-up persistido são C2** — em C0 só existe o motor puro.

Fora de C0 de propósito: `composicaoId` no item (C2), `CustoQuantitativo`/`origem`/`confianca` (C3),
`CustoBasePreco`/`CustoInsumo`/`CustoComposicao` (C1).

### 3.2 Módulos puros — contratos

`bdi.ts` — Acórdão TCU 2622/2013:
`BDI = [((1+AC+S+R+G)·(1+DF)·(1+L)) / (1−I)] − 1`, com `I = PIS + COFINS + ISS + CPRB`.
Entrada e saída em **percentual** (`number`), arredondamento a 2 casas com `round2` — mesmo padrão de
[reajuste.ts](../../../src/modules/licitacoes/contrato/reajuste.ts). Erro de negócio quando `I ≥ 100%`.
Exporta também o demonstrativo linha a linha (parcelas do numerador/denominador) que a tela imprime.

`encargos-obra.ts` — tabela de rubricas por grupo (A: previdenciários; B: trabalhistas sem incidência de A;
C: sujeitos a A; D: reincidências de A sobre B), com taxa **horista** e **mensalista** por rubrica.
`PRESET_ENCARGOS_SINAPI` é referencial e **editável por orçamento** via overrides. Regime `desonerado`
zera as rubricas marcadas `desoneravel` (cota patronal INSS 20%). Grupo D calculado, não digitado.
**Sem relação nenhuma com `lib/encargos.ts`** (INSS/IRRF progressivo da folha CLT) — nome diferente de
propósito.

`orcamento-arvore.ts` — puro, sem Prisma: `montarArvore`, `calcularCodigosWbs` (1.2.3),
`bdiEfetivo(no, herança)`, `rollUp` (totais de baixo para cima), `caminhoAteRaiz` e
`recalcularIncremental` (recalcula **só** o caminho do nó alterado até a raiz — §7 do design).
Detecta `parentId` órfão e ciclo, devolvendo erro em vez de estourar a pilha.

## 4. Tech Stack

Nada novo. Next 15 · React 19 · Prisma 7 (`@/generated/prisma/client`) · Zod · shadcn **sobre base-ui**
(`render={<Comp/>}`, `onValueChange: string | null`) · vitest (node) · `defineAction` · `parseListParams`.
**Zero dependência adicionada.**

## 5. Global Constraints

1. Toda mutação por `defineAction` com `modulo: "custos"`, `recurso: "custos"`, `entidade` + `entidadeId`;
   `capturarAntes` **dentro** do objeto de config.
2. Toda leitura em `queries.ts` com `import "server-only"` e DTO tipado — Prisma não vaza para componente.
3. Toda fórmula em módulo puro com `*.test.ts`. Nenhum cálculo em action, query ou componente.
4. Sem REST CRUD. Dinheiro `Decimal(14,2)`, quantidade `Decimal(12,2)`, percentual `Decimal(5,2)`.
5. UI 100% pt-BR; identificadores em inglês; commit semântico pt-BR, escopo `custos`.
6. `npm run build` **nunca** com `next dev` ativo na :3000.

## 6. Passos

### Passo 1 — Permissões: catálogo + seed
- [ ] `PERMISSOES_CATALOGO`: recurso `custos` com `ver` / `gerir` / `bancos` / `cotacao` (§5.3 do design).
- [ ] `prisma/seed.ts` — matriz proposta (**confirmar**): `supervisor` → `ver`,`gerir`;
      `administrativo` → `ver`,`gerir`,`bancos`,`cotacao`; `clt`/`estagiario`/`projetista_pj`/`freelancer`
      → `ver`; `ti` e `cliente` → nada; `admin` por bypass.
- [ ] Comentário no seed explicando por que `bancos` é separado (base corrompida contamina todo orçamento).

**Aceite:** `npm run db:seed` roda idempotente; Configurações → Permissões mostra o bloco "Engenharia de
Custos" com as 4 ações; usuário `clt` vê a matriz só com `ver` marcado.

### Passo 2 — Módulo puro `bdi.ts` + testes
- [ ] `calcularBdi(entrada)` → `{ percentual, multiplicador, tributosTotal, demonstrativo[] }`.
- [ ] `ActionError`-free (puro): entrada inválida (`I ≥ 100`) devolve resultado de erro tipado.
- [ ] `bdi.test.ts`: caso do próprio acórdão, BDI de material/equipamento (reduzido), tributos zerados,
      `I → 100%`, arredondamento a 2 casas, ordem das parcelas do demonstrativo.

**Aceite:** `npx vitest run src/modules/custos/bdi.test.ts` verde; nenhum import de Prisma/Next no arquivo.

### Passo 3 — Módulo puro `encargos-obra.ts` + testes
- [ ] Preset de rubricas com grupo, descrição, taxa horista, taxa mensalista, flags `desoneravel`/`reincidencia`.
- [ ] `calcularEncargos({ regime, overrides })` → totais por grupo + total horista + total mensalista +
      linhas do demonstrativo.
- [ ] Grupo D derivado (A sobre B), nunca digitado.
- [ ] `encargos-obra.test.ts`: soma dos grupos = total; desonerado < não desonerado; override de rubrica
      muda só ela e o D correspondente; horista ≠ mensalista; rubrica desconhecida no override é rejeitada.

**Aceite:** testes verdes; arquivo sem I/O; `lib/encargos.ts` intocado.

### Passo 4 — Módulo puro `orcamento-arvore.ts` + testes
- [ ] `montarArvore`, `calcularCodigosWbs`, `bdiEfetivo`, `rollUp`, `caminhoAteRaiz`, `recalcularIncremental`.
- [ ] `orcamento-arvore.test.ts`: WBS de 3 níveis com reordenação; herança de BDI (item → grupo →
      orçamento); roll-up de 3 níveis; **incremental === completo** (propriedade); ciclo e órfão detectados;
      item `bloqueado` mantém `custoUnitario` no recálculo.

**Aceite:** testes verdes, incluindo o caso "incremental === completo" sobre árvore de ≥ 200 nós.

### Passo 5 — Schema + migração
- [ ] Enums + `CustoOrcamento` + `CustoOrcamentoRevisao` + `CustoOrcamentoItem` conforme §3.1, com `///`
      em todo campo não óbvio, `@@map` snake_case e `@@index` em toda FK filtrada.
- [ ] Relações inversas em `Projeto`, `Cliente`, `Licitacao`, `User`.
- [ ] `npm run db:migrate` (nome `custos_fundacao`) + `npm run db:generate`.
- [ ] **Se der drift:** parar e avisar; contorno é `db push` + migração escrita à mão + `migrate resolve`,
      nunca `migrate reset` às cegas.

**Aceite:** migração aplicada; `npx prisma validate` ok; `npx tsc --noEmit` limpo com o client regenerado.

### Passo 6 — `queries.ts` + escopo de acesso
- [ ] `listarOrcamentos(sp, user)` com `parseListParams` (whitelist de sort: `titulo`, `dataBase`,
      `status`, `createdAt`), filtros `q`/`status`/`projetoId`, paginação obrigatória.
- [ ] `obterOrcamento(id, user)` → DTO com cabeçalho + BDI calculado + encargos calculados.
- [ ] `orcamentosDoProjeto(projetoId, user)` para a aba.
- [ ] **Escopo (D1):** com projeto → reusa `escopoProjeto`; **avulso** → visível a `podeVerTudo(u)` ou ao
      criador. `cliente` nunca vê custos.

**Aceite:** `clt` sem vínculo no projeto não lista o orçamento daquele projeto; avulso de outro usuário não
aparece para não-global; nenhum `findMany` sem `skip`/`take`.

### Passo 7 — `schemas.ts` + `service.ts` + `actions.ts`
- [ ] Zod: `criarOrcamentoSchema` (regra XOR `projetoId` × `nomeAvulso`), `atualizarCabecalhoSchema`,
      `atualizarBdiSchema` (0–100 por parcela), `atualizarEncargosSchema`, `cancelarOrcamentoSchema`.
- [ ] `service.ts`: monta o cabeçalho, chama `calcularBdi`/`calcularEncargos` e **materializa**
      `bdiPercentual`, `encargosHoristaPct`, `encargosMensalistaPct`.
- [ ] Actions com `base = { modulo:"custos", recurso:"custos", entidade:"CustoOrcamento" } as const`,
      `permissao: "gerir"`, `entidadeId` e `capturarAntes` nas edições.
- [ ] Cancelar = mudança de `status` (**não** há delete nem soft-delete em C0).

**Aceite:** usuário só com `custos:ver` recebe "Sem permissão." e a tentativa fica no `AuditLog` como
`bloqueado`; editar BDI grava `detalhe.antes`/`detalhe.novo` na auditoria; XOR projeto/avulso rejeitado
com mensagem pt-BR.

### Passo 8 — Navegação + aba do projeto
- [ ] `nav-config.ts`: item "Engenharia de Custos" (`/custos`, ícone `Coins`) no grupo **Engenharia**,
      `roles` = internos exceto `ti`, sem `mobile`.
- [ ] `abas.ts`: `"/custos"` em `ABAS_CONFIGURAVEIS` + `ABA_LABEL["/custos"] = "Custos"`.
- [ ] Liberação da aba na página do projeto segue o mesmo gate das demais (`custos:ver`).

**Aceite:** item aparece no menu para interno e some para `ti`/`cliente`; aba "Custos" aparece no projeto e
pode ser ocultada/reordenada pelo editor de abas existente.

### Passo 9 — Telas
- [ ] `custos-view.tsx`: lista com filtros, `sortable-head`, `pagination`, `empty-state` acionável,
      skeleton de carregamento, badge de status via `status-badge`.
- [ ] `novo-orcamento-dialog.tsx`: projeto (Select **opcional**) ou nome avulso, título, data-base,
      contratante, regime tributário.
- [ ] `orcamento-cabecalho-form.tsx`: edição do cabeçalho + parcelas do BDI + regime/overrides de encargos,
      com `toast` pt-BR.
- [ ] `bdi-demonstrativo.tsx` e `encargos-demonstrativo.tsx`: tabelas de demonstrativo na tela (impressão é C7).
- [ ] `projeto-custos-view.tsx`: orçamentos da obra + botão criar já com o projeto preenchido.
- [ ] Zero hex/rgb hardcoded (tokens de `globals.css`); `brl`/`formatarData` de `lib/utils.ts`.

**Aceite:** DoD da onda (§7) reproduzido no navegador.

### Passo 10 — Verificação e commit
- [ ] `npx tsc --noEmit` · `npm test` · `npm run lint` · `npm run build` (sem `next dev` na :3000).
- [ ] Roteiro manual (§8) executado.
- [ ] Commit `feat(custos): fundação do módulo de engenharia de custos`.

**Aceite:** os quatro comandos limpos, com a saída real reportada.

## 7. Definition of Done

- Criar orçamento **vinculado a projeto** e criar orçamento **avulso**.
- Editar cabeçalho: contratante, data-base, regime tributário.
- Editar as 10 parcelas do BDI e ver o percentual recalculado + demonstrativo na tela.
- Trocar regime de encargos (desonerado × não desonerado) e ver os totais horista/mensalista mudarem, com
  demonstrativo por grupo A/B/C/D.
- Aba **Custos** funcionando dentro do projeto.
- Permissão negada para quem não tem `custos:gerir`, com registro em Auditoria.
- `tsc` + `test` + `lint` + `build` limpos.

## 8. Verificação manual (roteiro de clique)

`npm run dev` basta — C0 não tem job nem realtime.

1. Configurações → Permissões: bloco "Engenharia de Custos" com 4 ações.
2. Menu Engenharia → Engenharia de Custos → lista vazia com `EmptyState` e botão "Novo orçamento".
3. Criar orçamento vinculado a um projeto existente → abre a ficha.
4. Editar BDI (ex.: AC 4, S 0,8, R 0,97, G 0,4, DF 1,02, L 7,4, PIS 0,65, COFINS 3, ISS 3, CPRB 0) →
   conferir o percentual e o demonstrativo.
5. Trocar para regime **desonerado** → totais de encargos caem; grupo D acompanha.
6. Voltar em Projetos → `[projeto]` → aba **Custos** → o orçamento aparece.
7. Criar um orçamento **avulso** (sem projeto, com `nomeAvulso`) → aparece na lista global e **não** em
   nenhum projeto.
8. Logar como `clt` sem `custos:gerir` → botões de edição ausentes; ação forçada retorna "Sem permissão."
9. Auditoria: as mutações acima aparecem com módulo `custos` e diff antes/depois.

## 9. Deploy

**`npm run db:seed` é obrigatório no deploy desta onda** — sem ele o recurso `custos` não existe na matriz
e ninguém (exceto `admin`, por bypass) acessa a tela. Além do `db:migrate` normal.

## 10. Fora de escopo (não invadir)

Itens de orçamento na tela e roll-up persistido, composições, insumos, bases de preço, importador SINAPI,
quantitativos/BIM, RFQ/cotações, cronograma, curvas, medições, revisões (só o model existe), relatórios
PDF/XLSX, aprovação por alçada, notificações da categoria `custos`. Cada um tem sua onda (C1–C7).
