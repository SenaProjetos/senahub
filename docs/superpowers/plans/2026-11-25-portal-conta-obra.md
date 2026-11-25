# Portal do cliente — conta de obra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A construtora ou o engenheiro da obra (ou alguém do cliente que cuida só da obra) entra no portal com conta própria e vê, das obras marcadas na conta, só a pasta "Liberado para obra" e os modelos 3D dela, na revisão vigente, com histórico de quem baixou e um resumo diário de liberadas, substituídas e retiradas.

**Architecture:** A conta de obra é `User.tipo = externo` + `User.clienteId = null` + uma linha `ContaObra` (com a lista `ContaObraProjeto`). Como as travas do cliente exigem `clienteId`, todas recusam a obra sozinhas. Só arquivos e 3D ganham caminho de obra, por uma porta nova (`acessoAosArquivosDoPortal`) que devolve um alcance com `situacoes: ["liberado_obra"]`, filtrado no núcleo único do link público. Regras puras e testadas em `src/modules/portal/obra/`, as páginas do portal decidem o papel no topo e renderizam componentes de obra, e o resumo de obra roda dentro da rodada do resumo do portal.

**Tech Stack:** Next.js 15 / React 19, Prisma 7 (`@/generated/prisma/client`), Zod, vitest (node), pg-boss (job `portal-resumo-diario` já existente), base-ui shadcn.

**Spec:** `docs/superpowers/specs/2026-11-25-portal-conta-obra-design.md` (aprovado em 2026-11-25). Ler junto: `docs/superpowers/specs/2026-11-19-portal-resumo-diario-design.md` (resumo) e `2026-11-20-portal-visualizador-3d-design.md` (3D).

## Global Constraints

- Código em inglês. **UI, mensagens de erro e commits em pt-BR**, commits semânticos com o trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `feat/portal-conta-obra` (já existe). Nunca trabalhar em `dev`/`master`.
- Importar o Prisma de `@/generated/prisma/client`.
- Nunca `migrate dev` nem `prisma format`. **Nunca `sed` global no `schema.prisma`**: editar com script Python de âncora única + `assert` (arquivo LF, sem newline final).
- Migração:
  1. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/20261125120000_conta_obra/migration.sql`
  2. Ler o SQL inteiro: só objetos novos e o `ADD VALUE`.
  3. `npx prisma migrate deploy`
  4. `npm run db:generate`
- vitest **só pelo PowerShell**: `npx vitest run <arquivo>` ou `npx vitest run --maxWorkers=6`.
- Nunca `next build` com `dev`/`dev:server` desta pasta no ar. Não ler o `.env`.
- Toda mutação por `defineAction` (`@/lib/with-action`) com `recurso: "usuarios", permissao: "gerir", interno: true` e `capturarAntes` no objeto de config. `ActionError` com frase segura.
- Dentro de `$transaction`: nada de `Promise.all`, nada de `select/include` aninhado de relação. Leituras planas e em sequência.
- **Invariante da conta de obra**: `clienteId` sempre nulo, `perfilId` nulo, nenhum `PermissaoUsuario`, `superUsuario = false`. Quem escreve `User.clienteId` (`lib/auth-admin.ts`, `usuarios/actions.ts`, `clientes/fusao.ts`) e quem escreve perfil/override (`usuarios/actions.ts`, `perfis/overrides-actions.ts`) recusa a conta com `ContaObra`.
- Frase de recusa única para conta de obra fora de lugar: `MOTIVO_CONTA_OBRA = "Conta de obra não recebe cliente, perfil de acesso nem permissões."`.
- Porta do cliente (`acessoDoUsuarioAoProjetoDoPortal`, `modelosDoPortal`, `pranchaParaPortal`, `clienteDoUsuario`, `contaPodeVerConversa`, `contaDoPortalParaCliente`) **não muda**. Só arquivo, .zip, ART e modelo 3D aceitam obra.
- Resposta neutra: o mesmo `{ status: 404, erro: "Arquivo indisponível." }` (`MSG_PORTAL.indisponivel`). Senha e termo dão 403 só depois de saber que a obra é da pessoa.
- Datas: "hoje" = `diaDeSaoPaulo()` (`@/lib/data`). `acessoAte` chega como `YYYY-MM-DD` e é gravado como `new Date(\`${dia}T00:00:00.000Z\`)`. Data no passado é recusada: `"A data de acesso não pode ser anterior a hoje."`.
- Valores do spec:
  - "Empresa": 1–120 caracteres, aparada.
  - Termo de obra: versão `"2026-11-25"`.
  - Template de e-mail: slug `resumo-obra-portal`.
  - Categoria de opt-out: `portal_resumo`.
  - Sino: título `Novidades na obra <projeto>`, `href` `/portal/<id>`.
- Decisão do construtor (fechando o "não conta" do spec): o controle `liberado_obra` com `origem = "migracao"` não gera **Liberada** (a data é a da migração). A **remoção** dele gera Retirada/Substituída normalmente (a obra viu o arquivo sair).
- Decisão do construtor: o termo rico fica em `docs/legal/termo-uso-obra.md`, no padrão dos outros dois (`termo-uso-clientes.md`, `termo-uso-colaboradores.md`). O spec dizia `termo-obra.md`.
- Novo smoke entra no `package.json` e na lista do `CLAUDE.md`. Manual (`docs/manual/inicio/portal-cliente.md`) e `docs/manual/novidades.md` atualizados.
- Telas: `CabecalhoPagina` como primeiro elemento. 390×844 sem rolagem horizontal; 1366×768 com o menu aberto sem sobrepor.
- Stage **por caminho** (nunca `git add -A`/`.`). Conferir `git show --stat` depois de cada commit.

## Review Focus

Entradas que o spec implica mas as tarefas principais não testam sozinhas; cada uma tem o teste no dono do código:

1. **Mesmo documento nas duas pastas** (R02 em Compartilhado, R01 em Liberado): a obra vê só a R01; a URL da R02 dá 404; o .zip só tem `Liberado para obra/…`; `?situacao=compartilhado` no .zip dá 404. (Task 3, smoke na Task 11.)
2. **Conta "do cliente" cujo cliente é desativado**, ou projeto de outro cliente que entrou na lista antes de a conta ganhar cliente: tudo fecha. (Task 2.)
3. **Caminho lateral que daria cliente/perfil à conta de obra**: `editarUsuario` com `clienteId`/`perfilId`/`superUsuario`/extras, `criarOverride`, `reativarUsuario` apagando a data. (Task 6.)
4. **Troca perto da meia-noite**: controle removido às 23:50 de SP (02:50Z do dia seguinte) e o novo aplicado às 00:10. São dias diferentes: Retirada num dia, Liberada no outro, nunca Substituída. (Task 10.)
5. **Conta ou obra nova no meio do dia avaliado**, e **conta de obra com e-mail desligado**: só o sino. (Task 10.)

---

### Task 1: Schema, migração e cliente (fusão e exclusão)

**Files:**
- Modify: `prisma/schema.prisma` (enum `TipoTermo` ~l.535; `model User` ~l.48; `model Cliente` ~l.884; `model Projeto` ~l.1239; models novos no fim)
- Create: `prisma/migrations/20261125120000_conta_obra/migration.sql`
- Modify: `src/modules/clientes/fusao.ts` (ao lado de `repontar("usuariosPortal", …)`, ~l.167)
- Modify: `src/modules/clientes/exclusao.ts` (+ `contasObra` em `VinculosCliente`, `VINCULOS_VAZIOS`, `ROTULOS`)
- Modify: `src/modules/clientes/queries.ts` (~l.183, onde `usuariosPortal` é contado)
- Modify: `scripts/conferir-fusoes-clientes.ts` (rótulo + linha `UNION ALL` de `conta_obra`)
- Test: `src/modules/clientes/exclusao.test.ts` (existente, acrescentar)

**Interfaces:**
- Produces: `prisma.contaObra` e `prisma.contaObraProjeto`. Relações `User.contaObra ContaObra?`, `Cliente.contasObra ContaObra[]`, `Projeto.contasObra ContaObraProjeto[]`, `ContaObra.projetos ContaObraProjeto[]`. `TipoTermo.obra`.

- [ ] **Step 1: Editar o schema por script Python com âncora + assert**

```prisma
enum TipoTermo {
  colaborador
  cliente
  obra
}

/// Conta de obra do portal (spec 2026-11-25): externo SEM clienteId; vê só "Liberado para obra" das obras da lista.
model ContaObra {
  id          String             @id @default(cuid())
  userId      String             @unique
  user        User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Nome da empresa escrito na conta (1–120).
  empresa     String
  /// "É do cliente": só obras desse cliente. Excluir o cliente é recusado enquanto houver conta dele.
  clienteId   String?
  cliente     Cliente?           @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  /// Escalar, sem relação (o User já é enorme).
  criadoPorId String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  projetos    ContaObraProjeto[]

  @@index([clienteId])
  @@map("conta_obra")
}

model ContaObraProjeto {
  id             String    @id @default(cuid())
  contaObraId    String
  contaObra      ContaObra @relation(fields: [contaObraId], references: [id], onDelete: Cascade)
  projetoId      String
  projeto        Projeto   @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  concedidoPorId String?
  criadoEm       DateTime  @default(now())

  @@unique([contaObraId, projetoId])
  @@index([projetoId])
  @@map("conta_obra_projeto")
}
```

Add the back-relations to `User` (`contaObra ContaObra?`), `Cliente` (`contasObra ContaObra[]`) and `Projeto` (`contasObra ContaObraProjeto[]`), each with its own anchor + assert.

- [ ] **Step 2: Gerar, ler e aplicar a migração**

Run the four commands from Global Constraints. Expected SQL: `ALTER TYPE "TipoTermo" ADD VALUE 'obra'`, two `CREATE TABLE`, unique + indexes, three FKs (`ON DELETE CASCADE` ×3, `ON DELETE RESTRICT` ×1). **Nothing else.** If anything else shows up, stop.

- [ ] **Step 3: Teste da exclusão de cliente (falha)**

In `exclusao.test.ts`: `motivoParaNaoExcluir({ ...VINCULOS_VAZIOS, contasObra: 1 })` contains `"1 conta de obra"`; with `contasObra: 2`, `"2 contas de obra"`.

- [ ] **Step 4: Implementar**

1. `ROTULOS` gets `["contasObra", "conta de obra", "contas de obra"]` after `usuariosPortal`.
2. `queries.ts` counts `_count.contasObra`.
3. `fusao.ts`:
   ```ts
   await repontar("contasObra", () => tx.contaObra.updateMany({ where: { clienteId: absorvidoId }, data: { clienteId: sobreviventeId } }))
   ```
   Check whether `repontar` takes a typed key list and extend it.
4. `conferir-fusoes-clientes.ts`:
   ```sql
   UNION ALL SELECT "clienteId", 'conta_obra (conta de obra)', count(*) FROM conta_obra WHERE "clienteId" IN (SELECT id FROM abs) GROUP BY 1
   ```

- [ ] **Step 5: Rodar** `npx vitest run src/modules/clientes` (PowerShell). Expected: PASS.

- [ ] **Step 6: Commit** `feat(portal): tabelas da conta de obra e termo de obra no enum`. Stage the schema, the migration, fusao.ts, exclusao.ts (+test), queries.ts and the script.

---

### Task 2: Regras puras da conta de obra

**Files:**
- Create: `src/modules/portal/obra/regras.ts`
- Test: `src/modules/portal/obra/regras.test.ts`

**Interfaces:**
- Consumes: `DecisaoAcessoPortal`, `MSG_PORTAL` from `src/modules/portal/acesso-regras.ts`.
- Produces:
  ```ts
  export const MOTIVO_CONTA_OBRA = "Conta de obra não recebe cliente, perfil de acesso nem permissões.";
  export const MOTIVO_OBRA_DE_OUTRO_CLIENTE = "Conta do cliente só recebe obras desse cliente.";
  export const MOTIVO_OBRA_NAO_ENCONTRADA = "Obra não encontrada.";
  export const MOTIVO_EMPRESA = "Informe a empresa (até 120 caracteres).";
  export const MOTIVO_ACESSO_ATE_PASSADO = "A data de acesso não pode ser anterior a hoje.";
  export const MOTIVO_CONTA_OBRA_MUDOU = "A conta mudou enquanto você editava. Atualize a página.";
  export type EntradaAcessoObra = {
    temSessao: boolean; tipo: "interno" | "externo" | null;
    clienteIdDaConta: string | null;          // User.clienteId
    temContaObra: boolean;
    contaClienteId: string | null; contaClienteAtivo: boolean;   // ContaObra.clienteId / ativo
    naLista: boolean;
    projetoClienteId: string | null;          // null = projeto não existe
    projetoClienteAtivo: boolean;
    mustChangePassword: boolean; termoPendente: boolean;
  };
  export function obraLiberadaParaConta(e: Omit<EntradaAcessoObra, "temSessao"|"tipo"|"clienteIdDaConta"|"temContaObra"|"mustChangePassword"|"termoPendente">): boolean;
  export function decidirAcessoObra(e: EntradaAcessoObra): DecisaoAcessoPortal;
  export type ObraDaLista = { projetoId: string; clienteId: string; clienteAtivo: boolean };
  export function obrasValidas<T extends ObraDaLista>(conta: { clienteId: string | null; clienteAtivo: boolean }, itens: readonly T[]): T[];
  export function motivoListaDeObras(contaClienteId: string | null, projetos: readonly { id: string; clienteId: string }[], pedidos: readonly string[]): string | null;
  export function normalizarEmpresa(s: string): string | null;     // aparada, 1–120; senão null
  export function deveReativarPorAcessoAte(o: { ativo: boolean; acessoAteAntes: string | null; acessoAteNovo: string | null; hoje: string }): boolean;
  ```

- [ ] **Step 1: Escrever os testes (falham)**

- `decidirAcessoObra`:
  - No session → 401.
  - Interno, `clienteIdDaConta` set, `temContaObra` false, project missing, not in the list, project client inactive → 404 `MSG_PORTAL.indisponivel`.
  - Conta "do cliente" with `contaClienteAtivo` false → 404.
  - Conta "do cliente" with `contaClienteId !== projetoClienteId` → 404.
  - `mustChangePassword` → 403 `MSG_PORTAL.senha`. `termoPendente` → 403 `MSG_PORTAL.termo`.
  - Project not in the list AND `mustChangePassword` → 404, never 403.
  - Everything right → `{ ok: true }`.
- `obrasValidas`:
  - Outside account: keeps those with `clienteAtivo`.
  - "Do cliente" account: keeps only `clienteId === conta.clienteId`.
  - "Do cliente" account with `clienteAtivo` false → `[]`.
- `motivoListaDeObras`:
  - Id not in `projetos` → `MOTIVO_OBRA_NAO_ENCONTRADA`.
  - Account with a client and a project from another client → `MOTIVO_OBRA_DE_OUTRO_CLIENTE`.
  - Empty list → `null`. Outside account with mixed clients → `null`.
- `normalizarEmpresa`: `"  Alfa  "` → `"Alfa"`, `""` → `null`, 121 characters → `null`.
- `deveReativarPorAcessoAte`:
  - true only when `!ativo && acessoAteAntes < hoje && acessoAteNovo >= hoje`.
  - false when manually deactivated (`acessoAteAntes` null or ≥ hoje).
  - false when `acessoAteNovo` is null.

- [ ] **Step 2: Rodar** `npx vitest run src/modules/portal/obra/regras.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implementar `regras.ts`** (pure, no imports besides `../acesso-regras`). `decidirAcessoObra` returns 404 when `!temSessao` is false and the person is not an obra account or `!obraLiberadaParaConta(e)`.

- [ ] **Step 4: Rodar de novo.** Expected: PASS.

- [ ] **Step 5: Commit** `feat(portal): regras puras da conta de obra`.

---

### Task 3: Alcance com as pastas (`situacoes`) no núcleo do link

**Files:**
- Modify: `src/modules/projetos/arquivos/link-publico-regras.ts` (`AlcanceArquivos`, `alcanceDoPortal`; new `alcanceDaObra`)
- Modify: `src/modules/projetos/arquivos/link-publico.ts`:
  - `alcanceDoToken` ~l.427
  - `montarConteudo` ~l.507–541
  - `uploadLiberadoNoAlcance` ~l.650
  - `uploadsDoAlcanceParaZip` ~l.787–804
- Modify: `scripts/smoke-portal-entregas.ts` (alcance built by hand, if any, gets `situacoes`)
- Test: `src/modules/projetos/arquivos/link-publico-regras.test.ts`

**Interfaces:**
- Consumes: `SITUACOES`, `type Situacao` from `@/modules/uploads/revisao-marcada`.
- Produces:
  - `AlcanceArquivos.situacoes: Situacao[]`: the folders shown. Portal and link = `[...SITUACOES]`.
  - `export function alcanceDaObra(projeto: { id: string; codigo: string; nome: string }): AlcanceArquivos`: like `alcanceDoPortal` with `situacoes: ["liberado_obra"]`.
  - `export function situacaoNoAlcance(alcance: Pick<AlcanceArquivos, "situacoes">, s: Situacao): boolean`.

- [ ] **Step 1: Testes (falham)**
  - `alcanceDaObra(p).situacoes` equals `["liberado_obra"]` and `porSituacao` is true.
  - `alcanceDoPortal(p).situacoes` equals `["compartilhado", "liberado_obra"]`.
  - `situacaoNoAlcance(alcanceDaObra(p), "compartilhado")` is false.

- [ ] **Step 2: Rodar.** Expected: FAIL.

- [ ] **Step 3: Implementar**
  1. Add the type field. `alcanceDoToken` sets `situacoes: [...SITUACOES]`.
  2. `montarConteudo`: `SITUACOES.map` becomes `link.situacoes.map`.
  3. `uploadLiberadoNoAlcance`: `situacoesDoUpload(...).length === 0` becomes "no situation of the upload is in the alcance". Use `.some((s) => situacaoNoAlcance(link, s))`.
  4. `uploadsDoAlcanceParaZip`: `recorte.situacao` outside `link.situacoes` returns `null`. The `(situacaoAlvo ? [situacaoAlvo] : SITUACOES)` becomes `link.situacoes`.

- [ ] **Step 4: Rodar** the test and `npx vitest run src/modules/projetos/arquivos`. Expected: PASS. Then run `npm run smoke:portal-entregas`. Expected: same green total as before (the client does not change).

- [ ] **Step 5: Commit** `feat(arquivos): alcance escolhe as pastas do cliente (obra = só Liberado para obra)`.

---

### Task 4: Porta dos arquivos (cliente ou obra), rotas de download e modelos 3D

**Files:**
- Create: `src/modules/portal/obra/acesso.ts` (server-only)
- Modify: `src/modules/portal/acesso.ts` (new porta next to the client one, which does not change)
- Modify the routes to swap `acessoAoProjetoDoPortal` for `acessoAosArquivosDoPortal`:
  - `src/app/api/portal/projetos/[projetoId]/arquivos/[uploadId]/route.ts`
  - `.../arquivos/zip/route.ts`
  - `.../arquivos/art/[id]/route.ts`
- Modify: `src/modules/portal/modelo3d/queries.ts`
- Modify: `src/app/api/portal/projetos/[projetoId]/modelos/[modeloId]/route.ts` (only if the signature of `modeloPermitidoNoPortal` changes; keep it the same)

**Interfaces:**
- Consumes: `decidirAcessoObra`, `EntradaAcessoObra` (Task 2), `alcanceDaObra` (Task 3), `precisaAceitarTermo` (Task 5 changes its body but not its signature; the order of tasks does not matter).
- Produces:
  ```ts
  // obra/acesso.ts
  export async function ehContaObra(userId: string): Promise<boolean>;
  export async function acessoDaObraAoProjeto(user: UsuarioDaSessao | null, projetoId: string): Promise<AcessoPortal>;
  // acesso.ts
  export type PapelNoPortal = "cliente" | "obra";
  export type AcessoArquivosPortal = { ok: true; userId: string; papel: PapelNoPortal; alcance: AlcanceArquivos } | { ok: false; status: 401 | 403 | 404; erro: string };
  export async function acessoDoUsuarioAosArquivosDoPortal(user: UsuarioDaSessao | null, projetoId: string): Promise<AcessoArquivosPortal>;
  export async function acessoAosArquivosDoPortal(projetoId: string): Promise<AcessoArquivosPortal>;   // lê a sessão
  // modelo3d/queries.ts
  export async function modelosParaVerNoPortal(user: UsuarioDaSessao, projetoId: string): Promise<ModeloDoPortal[] | null>;
  ```
- `modelosDoPortal` (client only, used by `pedido-revisao/service.ts`) keeps its signature and behavior.
- `modeloPermitidoNoPortal` now uses `modelosParaVerNoPortal`.

- [ ] **Step 1: `acessoDaObraAoProjeto`**
  1. Read user (`clienteId`, `contaObra { clienteId, cliente { ativo } }`). Read project (`id, codigo, nome, clienteId, cliente { ativo }`). Read `contaObraProjeto` by `(contaObraId, projetoId)`. Do the reads in sequence.
  2. Check the term only when `obraLiberadaParaConta` is true.
  3. Decide with `decidirAcessoObra` and return `alcance: alcanceDaObra(projeto)`.

  `ehContaObra` = `prisma.contaObra.findUnique({ where: { userId }, select: { id: true } }) !== null`.

- [ ] **Step 2: `acessoDoUsuarioAosArquivosDoPortal`**
  - `user` null → 401.
  - `user.tipo === "externo" && await ehContaObra(user.id)` → `acessoDaObraAoProjeto`, with `papel: "obra"`.
  - Otherwise `acessoDoUsuarioAoProjetoDoPortal` with `papel: "cliente"`.

  The JSDoc must say that ONLY file, .zip, ART and 3D use it.

- [ ] **Step 3: Rotas.** Swap the call in the three routes. The rest stays identical: block, `registrarAcessoUploads` origem `portal`, audit.

- [ ] **Step 4: Modelos**
  1. Extract the current body of `modelosDoPortal` (after the access check) into a private `modelosDoAlcance(projetoId, alcance, { incluirRecebidos })`.
  2. `modelosDoPortal` = client gate + `incluirRecebidos: true`.
  3. `modelosParaVerNoPortal` = new porta + `incluirRecebidos: acesso.papel === "cliente"`.
  4. `modeloPermitidoNoPortal` calls `modelosParaVerNoPortal`.

- [ ] **Step 5: Verificar** `npx vitest run src/modules/portal` (PowerShell). Run `npx tsc -p tsconfig.json --noEmit` with `NODE_OPTIONS=--max-old-space-size=8192`. Expected: no errors. Then `npm run smoke:portal-modelo3d` and `npm run smoke:portal-entregas`: green as before.

- [ ] **Step 6: Commit** `feat(portal): porta dos arquivos aceita conta de obra (só Liberado para obra)`.

---

### Task 5: Termo de uso de obra

**Files:**
- Modify: `src/modules/legal/termos.ts` (`TipoTermo`, `tipoTermoPorTipo`, `OBRA`, `TERMOS.obra`)
- Modify: `src/modules/legal/queries.ts` (`precisaAceitarTermo` + new `tipoTermoDoUsuario`)
- Modify: `src/modules/legal/actions.ts` (use `tipoTermoDoUsuario`)
- Modify: `src/modules/legal/schemas.ts` (enum + `"obra"`)
- Create: `docs/legal/termo-uso-obra.md`
- Test: `src/modules/legal/termos.test.ts` (create if missing)

**Interfaces:**
- Produces:
  - `export type TipoTermo = "colaborador" | "cliente" | "obra"`.
  - `export function tipoTermoPorTipo(tipo: "interno" | "externo", ehObra = false): TipoTermo` (externo + ehObra → `"obra"`). Existing callers (chat, smokes) keep working.
  - `export async function tipoTermoDoUsuario(user: { id: string; tipo: "interno" | "externo" }): Promise<TipoTermo>`: reads `ContaObra` only for externos.
  - `precisaAceitarTermo` uses `tipoTermoDoUsuario`.

- [ ] **Step 1: Testes (falham)**
  - `tipoTermoPorTipo("externo", true)` → `"obra"`. `tipoTermoPorTipo("interno", true)` → `"colaborador"`. `tipoTermoPorTipo("externo")` → `"cliente"`.
  - `TERMOS.obra.versao === "2026-11-25"`.
  - The text has the company markers that `preencherTermo` replaces (no `[RAZÃO SOCIAL COMPLETA]` left after filling with a full company).
  - The text contains the words "executar a obra", "revisão vigente" and "intransferível".

- [ ] **Step 2: Rodar.** Expected: FAIL.

- [ ] **Step 3: Escrever o termo e ligar.** Text guidelines are in the spec, "Termo de uso de obra". Base it on the client term and clause 7.1 of the collaborator term.
  - `aceitarTermo`: `const tipo = await tipoTermoDoUsuario(ctx.user)`. The refusal "Termo não aplicável ao seu perfil." stays.
  - `docs/legal/termo-uso-obra.md` carries the same text in a rich version, with a header saying it is **pending legal review before deploy**.

- [ ] **Step 4: Rodar** `npx vitest run src/modules/legal`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(legal): termo de uso da conta de obra`.

---

### Task 6: Serviço e ações da conta de obra + travas nos caminhos laterais

**Files:**
- Create: `src/modules/portal/obra/schemas.ts`, `service.ts`, `actions.ts`
- Modify: `src/modules/usuarios/actions.ts` (`editarUsuario`, `reativarUsuario`)
- Modify: `src/modules/perfis/overrides-actions.ts` (`criarOverride`)
- Modify: `src/modules/usuarios/queries.ts` (`listarUsuarios` selects `contaObra`)
- Create: `src/modules/portal/obra/conta-obra-guarda.test.ts`

**Interfaces:**
- Consumes: `regras.ts` (Task 2), `criarUsuarioComCredencial` (`@/lib/auth-admin`), `diaDeSaoPaulo`.
- Produces:
  ```ts
  // schemas.ts
  export const criarContaObraSchema = z.object({ name: z.string().min(2, "Informe o nome."), email: z.string().email("E-mail inválido."), /* campo-ok: e-mail de login (better-auth) */ empresa: z.string(), clienteId: z.string().optional().or(z.literal("")), projetoIds: z.array(z.string().min(1)).max(200), acessoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) });
  export const salvarContaObraSchema = criarContaObraSchema.omit({ email: true }).extend({ userId: z.string().min(1), versao: z.string().min(1) /* ContaObra.updatedAt ISO */ });
  // service.ts
  export async function exigirNaoEhContaObra(userId: string): Promise<void>;  // lança ActionError(MOTIVO_CONTA_OBRA)
  export async function criarContaObraNoBanco(i: CriarContaObraInput, autorId: string): Promise<{ id: string; senhaTemporaria: string }>;
  export async function salvarContaObraNoBanco(i: SalvarContaObraInput, autorId: string): Promise<{ userId: string; reativada: boolean }>;
  // actions.ts
  export const criarContaObra, salvarContaObra;   // defineAction usuarios:gerir, interno: true
  ```

- [ ] **Step 1: Guarda (falha)**

  `conta-obra-guarda.test.ts` (reads files with `fs`, like `responsaveis-guarda.test.ts`):
  - The files in `src/` (except `generated`, tests and `src/test`) that have `.user.(update|updateMany|create|upsert)(` and the word `clienteId` are exactly `lib/auth-admin.ts`, `modules/usuarios/actions.ts`, `modules/clientes/fusao.ts`.
  - `usuarios/actions.ts` and `perfis/overrides-actions.ts` contain `exigirNaoEhContaObra(`.
  - `fusao.ts` contains `contaObra.updateMany`.

- [ ] **Step 2: Rodar.** Expected: FAIL (`exigirNaoEhContaObra` missing).

- [ ] **Step 3: `service.ts`**

  `criarContaObraNoBanco`:
  1. Validate BEFORE creating the user:
     - email is free;
     - `normalizarEmpresa`;
     - `acessoAte >= hoje`;
     - the "do cliente" client exists and is active;
     - `motivoListaDeObras` over `projeto.findMany({ where: { id: { in } }, select: { id, clienteId } })`.
  2. Then `criarUsuarioComCredencial({ name, email, tipo: "externo" })` with no clienteId.
  3. Then one `$transaction`: `user.update({ acessoAte })` + `contaObra.create` + `contaObraProjeto.createMany`, with `criadoPorId`/`concedidoPorId` = author.
  4. If the transaction fails: `prisma.user.delete({ where: { id } })` (compensation) and throw again.

  `salvarContaObraNoBanco`:
  1. Read `ContaObra` (`id, updatedAt`) by `userId`; missing → `MOTIVO_OBRA_NAO_ENCONTRADA`.
  2. Same validations as create.
  3. Read `user (ativo, acessoAte)` and compute `deveReativarPorAcessoAte`.
  4. One transaction:
     - `contaObra.updateMany({ where: { id, updatedAt: versao }, data: { empresa, clienteId } })`; count ≠ 1 → `ActionError(MOTIVO_CONTA_OBRA_MUDOU)`.
     - `contaObraProjeto.deleteMany` for those that left (`projetoId notIn`).
     - `createMany({ skipDuplicates: true })` for those that came in (a project that stays keeps its `criadoEm`).
     - `user.update({ name, acessoAte, ...(reativar ? { ativo: true } : {}) })`.

- [ ] **Step 4: Ações e travas laterais**
  - `criarContaObra` / `salvarContaObra`: `defineAction({ modulo: "configuracoes", recurso: "usuarios", permissao: "gerir", interno: true, entidade: "ContaObra", acao: "criar-conta-obra" | "salvar-conta-obra", capturarAntes })`. `capturarAntes` reads `contaObra` + `projetos.projetoId` + `user.acessoAte`. `revalidatePath("/configuracoes/usuarios")`.
  - `editarUsuario`: when the target has `ContaObra` and the input brings `clienteId` non-empty, `perfilId` non-empty, `superUsuario === true`, `gereRh === true`, `moderaChat === true` or `ehSocio === true`, call `exigirNaoEhContaObra` (which throws). Validate before writing. Name/nomeCompleto pass.
  - `criarOverride`: `await exigirNaoEhContaObra(i.userId)` before the upsert.
  - `reativarUsuario`: on an obra account, keep `acessoAte` when it is `>= hoje` (clear only if past). Others stay the same.
  - `listarUsuarios`: `contaObra: { select: { empresa: true, clienteId: true, updatedAt: true, projetos: { select: { projetoId: true } } } }`.

- [ ] **Step 5: Rodar** the guard + `npx vitest run src/modules/portal src/modules/usuarios src/modules/perfis`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(portal): criar e editar conta de obra (lista de obras, empresa, acesso até)`.

---

### Task 7: Configurações → Usuários: tipo de acesso "Obra"

**Files:**
- Modify: `src/app/(dashboard)/configuracoes/usuarios/page.tsx` (load `projetosParaContaObra()`)
- Create: `src/modules/portal/obra/queries.ts` (first function: `projetosParaContaObra`)
- Create: `src/components/configuracoes/conta-obra-campos.tsx` (client)
- Modify: `src/components/configuracoes/usuarios-view.tsx` (tipo grid ~l.659, salvar ~l.294, editar ~l.366, badge ~l.548)

**Interfaces:**
- Consumes: `criarContaObra`, `salvarContaObra` (Task 6), `SeletorMultiplo` (`components/ui/seletor-multiplo.tsx`), `UsuarioListItem.contaObra`.
- Produces: `export async function projetosParaContaObra(): Promise<{ id: string; rotulo: string; clienteId: string }[]>`. `rotulo` = `"<formatarCodigo(codigo)> · <nome> — <cliente.nome>"`. Ordered `ano desc, sequencial desc`. Only projects of active clients.

- [ ] **Step 1: Formulário**
  1. The tipo grid gets a third option `["obra", "Obra", "Só a pasta Liberado para obra das obras marcadas"]`. The form state gains `acesso: "interno" | "cliente" | "obra"`, mapped onto `tipo` on save.
  2. With Obra the dialog hides: perfil, extras, sócio, cliente do portal, vínculo/cadastro.
  3. It shows `ContaObraCampos`:
     - "Empresa" (`Input`, maxLength 120);
     - "É do cliente" (`Select` with "Empresa de fora" = empty);
     - "Obras" (`SeletorMultiplo` filtered by the chosen client);
     - "Acesso até" (`Input type="date"`, `min` = hoje).
  4. Editing an existing account does not show the tipo grid (no switching between Cliente and Obra).
  5. Save: new → `criarContaObra`; editing an obra account → `salvarContaObra` with `versao = contaObra.updatedAt`.
- [ ] **Step 2: Lista.** `Badge` `Obra · <empresa>` in place of "Cliente do portal" when `u.contaObra`.
- [ ] **Step 3: Verificar** `npm run lint` (no new warning in these files) and app tsc.
- [ ] **Step 4: Commit** `feat(configuracoes): conta de obra no cadastro de usuários`.

---

### Task 8: Telas do portal para a obra

**Files:**
- Modify: `src/modules/portal/obra/queries.ts`
- Create (server, no `"use client"`): `src/components/portal/obra/obras-da-conta.tsx`, `obra-detalhe.tsx`
- Create (client): `src/components/portal/obra/entregas-da-obra.tsx`
- Modify, branching at the top with `if (user.tipo === "externo" && (await ehContaObra(user.id)))`:
  - `src/app/(dashboard)/portal/page.tsx`
  - `src/app/(dashboard)/portal/[projetoId]/page.tsx`
  - `.../prancha/[uploadId]/page.tsx`
  - `.../modelo/page.tsx`
- `.../briefing/page.tsx` unchanged (the client gate already refuses).
- Create: `src/modules/portal/obra/paginas-guarda.test.ts`

**Interfaces:**
- Consumes: `acessoDaObraAoProjeto` (Task 4), `alcanceDaObra`, `conteudoDoAlcance`, `conteudoDoAlcanceSemSelos`, `uploadLiberadoNoAlcance`, `uploadsComBloqueioDeDownload`, `modelosParaVerNoPortal`, `temModelo3dNoPortal`, `motivoSemModelo`, `querResumoPorEmail`, `ResumoEmailToggle`, `VisualizadorPrancha` (with `pedir={null}` and `leitura={[]}`), `VisualizadorModeloDinamico` (with `pedir={null}` and `aguardando={[]}`).
- Produces:
  ```ts
  export async function obrasParaLista(userId: string): Promise<{ id: string; codigo: string; nome: string; endereco: string | null; liberadas: number; ultimaLiberacao: string | null }[]>;
  export async function obraParaVer(user: UsuarioDaSessao, projetoId: string): Promise<{ projeto: { id; codigo; nome; endereco }; conteudo: ConteudoPublico | null } | null>;
  export async function pranchaDaObra(user: UsuarioDaSessao, projetoId: string, uploadId: string): Promise<{ nome: string; revisao: string; projetoNome: string } | null>;
  ```

- [ ] **Step 1: Queries**
  - `obrasParaLista`:
    1. Read `ContaObra` + projects (`projeto { id, codigo, nome, endereco, clienteId, cliente { ativo } }`) and filter with `obrasValidas`.
    2. For each one (in sequence):
       - `liberadas` = number of files in `conteudoDoAlcanceSemSelos(alcanceDaObra(p))`;
       - `ultimaLiberacao` = the larger of the active `liberado_obra` `ControleRevisao.aplicadoEm` (origem ≠ `migracao`) and the `situacao_marcada` `DocumentoEvento.createdAt` with `detalhe.pasta = "Liberado para obra"`, as a `YYYY-MM-DD` São Paulo day (`diaDeSaoPaulo(d)`).
  - `obraParaVer` = `acessoDaObraAoProjeto` ok → `conteudoDoAlcance` (with block/absent seals) + the project.
  - `pranchaDaObra` = porta ok + `uploadLiberadoNoAlcance` + `.pdf` + no download block. Same rules as `pranchaParaPortal`, without pedidos.
- [ ] **Step 2: Componentes**
  - `ObrasDaConta`:
    - `CabecalhoPagina` with title "Minhas obras" and description "Pranchas e modelos liberados para a execução das suas obras.";
    - one card per obra (link `/portal/<id>`): name, `formatarCodigo(codigo)`, address, "N pranchas liberadas", "Última liberação em dd/mm/aaaa";
    - `EmptyState` with text "Nenhuma obra liberada para você ainda. Fale com o escritório.";
    - at the end, `ResumoEmailToggle`.
  - `ObraDetalhe`:
    - header with name and code, address on the next line;
    - a card "Liberado para obra" with `EntregasDaObra`, a "Baixar tudo (.zip)" button (when `conteudoTemZip`) and "Modelo 3D" (when `temModelo3dNoPortal` over `modelosParaVerNoPortal`);
    - empty state "Nenhuma prancha liberada para obra ainda.".
  - `EntregasDaObra` = `ProvedorAcoesDoArquivo` with `hrefVer` only (PDF → `/portal/<id>/prancha/<uploadId>`; IFC → `/portal/<id>/modelo?modelo=…`) + `ArvoreEntregas`. No selos, no extras.
- [ ] **Step 3: Páginas**
  - `/portal`: obra → `<ObrasDaConta>`.
  - `/portal/[projetoId]`: obra → `obraParaVer` null → `notFound()`; otherwise `<ObraDetalhe>`. Do this before `clienteDoUsuario`.
  - Prancha: obra → `pranchaDaObra` + `VisualizadorPrancha` with no `pedir` and no `leitura`, breadcrumb "Minhas obras".
  - Modelo: obra → `modelosParaVerNoPortal` + viewer with no `pedir` + the same empty states, with "Ver a pasta" in place of "Ver as Entregas".
- [ ] **Step 4: Guarda das páginas**

  `paginas-guarda.test.ts`: each of the 4 pages contains `ehContaObra(`, and the call appears BEFORE `clienteDoUsuario(` (string index).

- [ ] **Step 5: Verificar** `npx vitest run src/modules/portal/obra`, app tsc, `npm run lint`.
- [ ] **Step 6: Commit** `feat(portal): telas da conta de obra (lista, pasta, prancha e 3D só leitura)`.

---

### Task 9: Seção "Acesso de obra" na aba Cliente do projeto

**Files:**
- Modify: `src/modules/portal/obra/queries.ts` (+ `contasObraDoProjeto`)
- Create: `src/components/portal/obra/acesso-obra-equipe.tsx` (server)
- Modify: `src/app/(dashboard)/projetos/[id]/cliente/page.tsx`

**Interfaces:**
- Produces:
  ```ts
  export async function contasObraDoProjeto(projetoId: string): Promise<{ userId: string; nome: string; empresa: string; ativo: boolean; acessoAte: string | null; ultimoAcesso: string | null }[]>;
  ```
  - `ultimoAcesso` = largest `DocumentoEvento.createdAt` with `categoria: "acesso"`, `userId` of the account and `documento.disciplina.projetoId`, formatted with `formatarDataHora`.

- [ ] **Step 1: Implementar.**
  - The section shows only when the list has someone.
  - Card "Acesso de obra" with a table: Nome · Empresa · Acesso até · Último acesso · (link "Editar conta" to `/configuracoes/usuarios` only when `can(user, "usuarios", "gerir")`).
  - Inactive account gets the "Desativada" badge.
  - The read is a separate block with `.catch` (same pattern as the agenda), so the conversation does not break.
- [ ] **Step 2: Verificar** app tsc, `npm run lint`.
- [ ] **Step 3: Commit** `feat(projetos): quem tem acesso de obra na aba Cliente`.

---

### Task 10: Resumo diário de obra

**Files:**
- Create: `src/modules/portal/obra/resumo-obra.ts` (pure) + `resumo-obra.test.ts`
- Create: `src/modules/portal/resumo-reserva.ts`: move `reservar`, `liberar`, `dataDoDia`, `fimDoDiaSp` out of `resumo-service.ts`, exported. `resumo-service.ts` imports from it.
- Create: `src/modules/portal/obra/resumo-service.ts`
- Modify: `src/modules/portal/resumo-service.ts`:
  - `rodarResumoDiario` gets `enviarObra?: EnviarEmailResumo | null` and calls `resumirObras` after the projects loop, before saving `ultimoDia`;
  - `ResultadoResumo` gets `obras: number`.
- Modify: `src/lib/jobs-handlers.ts` (`resumoDiarioPortal` passes `enviarObra` with slug `resumo-obra-portal`; the log line gets `obras=`)
- Modify: `src/lib/email-templates-meta.ts` (new entry `resumo-obra-portal`)

**Interfaces:**
- Consumes: `ItemDoResumo`, `itensDosDias`, `listaEmMarkdown`, `textoDoSino`, `periodoDoResumo`, `escaparMarkdown` (`resumo-diario.ts`); `obrasValidas` (Task 2); `rotuloRevisao`, `diaDeSaoPaulo`.
- Produces:
  ```ts
  export type MudancaObra = { documentoId: string; numero: number; tipo: "aplicado" | "removido"; em: Date };
  export function mudancasDosControles(c: readonly { documentoId: string; numero: number; aplicadoEm: Date; removidoEm: Date | null; origem: string | null }[]): MudancaObra[];
  export function mudancasDosEventos(e: readonly { documentoId: string; tipo: "situacao_marcada" | "situacao_retirada"; revisao: number; em: Date }[]): MudancaObra[];
  export type FatoObra = { dia: string; documentoId: string; tipo: "liberada" | "substituida" | "retirada"; de: number | null; para: number | null };
  export function fatosDaObra(m: readonly MudancaObra[], dias: readonly string[]): FatoObra[];
  export function itemDoFato(f: FatoObra, doc: { disciplina: string; nome: string }): ItemDoResumo;
  export function diasDaConta(dias: readonly string[], desde: Date): string[];   // dia d entra se desde < fim do dia d em SP
  export async function resumirObras(r: ResultadoResumo, o: { enviar: EnviarEmailResumo | null; notificar: NotificarSino; somenteProjetos?: string[] }, app: string): Promise<void>;
  ```

- [ ] **Step 1: Testes puros (falham)**
  - `mudancasDosControles`:
    - an active control gives only `aplicado`; a removed one gives `aplicado` + `removido`;
    - `origem: "migracao"` gives only `removido` (when removed);
    - the output is sorted by `em`.
  - `mudancasDosEventos`, for one document:
    - `marcada(1)` → `aplicado 1`;
    - then `marcada(2)` → `removido 1` + `aplicado 2` at the same instant;
    - `marcada(2)` again → nothing;
    - `retirada(2)` → `removido 2`;
    - `retirada` with nothing marked → nothing.
  - `fatosDaObra`:
    - `removido 1` + `aplicado 2` on the same SP day → one `substituida` with `de: 1, para: 2`;
    - `removido` 23:50 SP and `aplicado` 00:10 SP → `retirada` on one day and `liberada` on the next (Review Focus 4);
    - only `aplicado` → `liberada`; only `removido` → `retirada`;
    - days outside `dias` are dropped;
    - `aplicado 1` and `removido 1` on the same day → nothing (it came and went).
  - `itemDoFato`: the text uses `rotuloRevisao`:
    - "liberada para obra (R01)" for `para: 2`;
    - "substituída: R00 → R01";
    - "retirada de obra (R01)";
    - `nome` with `*` comes out escaped in `listaEmMarkdown`.
  - `diasDaConta`: an account created 10:00 SP on day X does not get X; it gets X+1.
- [ ] **Step 2: Rodar.** Expected: FAIL.
- [ ] **Step 3: Implementar o puro.**
  - SP day of an instant = `diaDeSaoPaulo(em)`.
  - `itemDoFato` returns `{ dia, disciplina: doc.disciplina, texto: "<nome> · …" }` (not `seguro`; the list escapes).
- [ ] **Step 4: Implementar `resumirObras`** (`obra/resumo-service.ts` traz `EnviarEmailResumo`, `NotificarSino` e `ResultadoResumo` de `../resumo-service` só com `import type`; o import inverso é de valor, e o ciclo só fica seguro assim)
  1. Read the accounts:
     ```ts
     prisma.contaObra.findMany({ where: { user: { ativo: true, tipo: "externo", clienteId: null } }, select: { clienteId, cliente{ativo}, user{id,name,email,createdAt}, projetos{ projetoId, criadoEm, projeto{ id, nome, clienteId, cliente{ativo} } } } })
     ```
     Reads outside a transaction, so nesting is allowed.
  2. Filter each account with `obrasValidas` and group by project (honor `somenteProjetos`).
  3. For each project (in its own try/catch, like `resumirProjeto`), with the window = [start of the first day, end of the last day in SP]:
     - read the `liberado_obra` `ControleRevisao` rows of the project with `aplicadoEm` or `removidoEm` in the window (`revisao { numero, documentoId }`);
     - read the `situacao_marcada|situacao_retirada` `DocumentoEvento` rows of the project's documents with `detalhe.pasta = "Liberado para obra"`: the full history of the documents that had an event in the window;
     - compute `fatosDaObra` and the labels (`DocumentoDisciplina.nomeArquivo` + `disciplina.disciplinaTextoLegado`).
  4. Per account: `diasDaConta(dias, max(user.createdAt, criadoEm))` → `reservar` sino → `notificar({ titulo: \`Novidades na obra ${p.nome}\`, corpo: textoDoSino, href })` → email (opt-out `portal_resumo` via `filtrarPorCategoria`) with `reservar`/`liberar`, exactly like `resumirProjeto`.
- [ ] **Step 5: Template e job.**
  - `resumo-obra-portal`: group "Projetos", label "Resumo diário do portal (obra)", same variables as the client one.
  - Subject: `"Novidades na obra {{projeto}} — {{periodo}}"`.
  - Body: "Olá, {{nome}}.\n\nEm {{periodo}}, mudou o que está liberado para obra em **{{projeto}}**:\n\n{{lista}}\n\nA prancha que vale é sempre a do portal; cópias baixadas antes podem estar desatualizadas.\n\n[Abrir no portal]({{url}})\n\nPara não receber mais este resumo, desligue em Minhas obras, no portal.\n\nSena Projetos".
- [ ] **Step 6: Rodar** `npx vitest run src/modules/portal`. Expected: PASS. Then `npm run smoke:portal-resumo`. Expected: green as before (the client account does not change; obra accounts are out).
- [ ] **Step 7: Commit** `feat(portal): resumo diário de obra (liberada, substituída, retirada)`.

---

### Task 11: Smoke `smoke:portal-obra`

**Files:**
- Create: `scripts/smoke-portal-obra.ts` (structure and cleanup like `scripts/smoke-portal-agenda.ts`: own scenario with a suffix, deleted at the end, `portal.resumoDiario` config saved and restored)
- Modify: `package.json` (`"smoke:portal-obra": "tsx --tsconfig tsconfig.server.json scripts/smoke-portal-obra.ts"`, same pattern as the neighbors)
- Modify: `CLAUDE.md` (line in the smoke list, next to the other portal ones)

**Interfaces:**
- Consumes: everything from Tasks 2–10, through the services, not the actions (no HTTP session), like the other portal smokes.

- [ ] **Step 1: Cenário.**
  - Clients A and B (active) and C (inactive).
  - Projects pA1, pA2 (A), pB (B), pC (C).
  - Disciplines with uploads:
    - document D1 outside the cycle: R01 in Liberado, R02 in Compartilhado;
    - document D2 inside the cycle, with a `liberado_obra` control;
    - an IFC in Liberado and another only in Compartilhado (conversion `concluido`, fake `.frag`).
  - Accounts:
    - obra "de fora" (pA1 + pB);
    - obra "do cliente A" (pA1);
    - client account of A.
  - Accept the obra term for the obra accounts.
- [ ] **Step 2: Conferências.** Each one is `check(rótulo, condição)`.
  1. The obra sees pA1 and pB (`obrasParaLista`), never pA2 or pC.
  2. `acessoDoUsuarioAosArquivosDoPortal` ok with `papel: "obra"` on pA1. On pA2, 404.
  3. `uploadLiberadoNoAlcance`: D1-R01 yes, D1-R02 null.
  4. .zip: only `Liberado para obra/…`; `{ situacao: "compartilhado" }` → null.
  5. `modelosParaVerNoPortal`: Liberado IFC yes, Compartilhado no, client recebidos no.
  6. Download block on D1-R01 removes it (`uploadsComBloqueioDeDownload`).
  7. Every client area refuses the obra:
     - `acessoDoUsuarioAoProjetoDoPortal`;
     - `contaPodeVerConversa`;
     - `contaDoPortalParaCliente`;
     - `clienteDoUsuario` → null;
     - `modelosDoPortal` → null;
     - `pranchaParaPortal` → null;
     - `escopoProjeto` → no project.
  8. Taking pB out of the list (`salvarContaObraNoBanco`) closes it on the next call.
  9. Inactive client C, and client A deactivated → the "do cliente A" account sees nothing (restore A afterward).
  10. "Do cliente A" account with pB in the list → `MOTIVO_OBRA_DE_OUTRO_CLIENTE`.
  11. Obra term pending (delete the acceptance) → 403 `MSG_PORTAL.termo`; `precisaAceitarTermo` returns `tipo: "obra"`.
  12. `exigirNaoEhContaObra` refuses. The guarded path of `editarUsuario`/`criarOverride` is checked by the guard test (the smoke calls `exigirNaoEhContaObra`).
  13. Optimistic lock: two saves with the same `versao` → the second gets `MOTIVO_CONTA_OBRA_MUDOU`.
  14. Expired account: `ativo: false, acessoAte: ontem`. Saving a future `acessoAte` → `reativada: true`, `ativo: true`, date kept.
  15. Resumo (with `hoje` fixed, `somenteProjetos`, fake `enviar`/`enviarObra`/`notificar`):
      - Liberada, Substituída and Retirada inside and outside the cycle;
      - a second run on the same day = zero new sinos and emails;
      - opt-out = sino only;
      - account created today and obra added to the list today do not get it;
      - the client account of A does not get the obra summary, and the obra account does not get the client summary.
- [ ] **Step 3: Rodar** `npm run smoke:portal-obra`. Expected: all checks OK and the scenario deleted (the script prints the count).
- [ ] **Step 4: Regressão.** Each one is green: `npm run smoke:portal-entregas`, `smoke:portal-modelo3d`, `smoke:portal-resumo`, `smoke:pedido-revisao-cliente`, `smoke:portal-mensagens`, `smoke:portal-atas`, `smoke:portal-agenda`.
- [ ] **Step 5: Commit** `test(portal): smoke da conta de obra`.

---

### Task 12: Manual e novidades

**Files:**
- Modify: `docs/manual/inicio/portal-cliente.md` (section "Conta de obra": what the person sees, how to create it in Configurações → Usuários, "Acesso até", revoking, the summary)
- Modify: `docs/manual/novidades.md` (dated entry 2026-11-25, in user language)

- [ ] **Step 1: Escrever** in pt-BR, no jargon.
- [ ] **Step 2: Commit** `docs(manual): conta de obra no portal`.

---

### Task 13: Auditoria final (nível 4)

- [ ] Read `docs/PROTOCOLO_AUDITORIA_FINAL.md` again and run it:
  - full test suite (`npx vitest run --maxWorkers=6`, PowerShell);
  - `npm run lint`;
  - tsc of the app and of the server (`NODE_OPTIONS=--max-old-space-size=8192`);
  - `npm run build` with no dev server;
  - the smokes from Task 11;
  - area reviewers in parallel: action-guardian, prisma-migration-reviewer, upload-storage-auditor, a11y-auditor, ui-state-linter, design-system-guardian, client-boundary-auditor, i18n-convention-reviewer, test-coverage-scout;
  - one general reviewer `model: "opus"`.
- [ ] On-screen verification with puppeteer:
  - copy `fixture.ts`/`tela.mjs` from `prints-auditoria/2026-11-23_agenda-portal/` into `prints-auditoria/2026-11-25_conta-obra/`;
  - screens: Minhas obras, the obra's folder, prancha, 3D, the Usuários form (Obra), the Cliente tab of the project;
  - 390×844 with `scrollWidth` 390; 1366×768 with the menu open;
  - write `LEIAME.md`;
  - stop the server and delete the scenario.
- [ ] Report in pt-BR (A–I, "Rulings", "Deferred minors"), ending with: 1) merge into `dev` locally (fast-forward), 2) push + PR, 3) keep the branch. Remind the owner of the deploy pending items, including the **legal review of the obra term** and the migration `20261125120000_conta_obra`.
