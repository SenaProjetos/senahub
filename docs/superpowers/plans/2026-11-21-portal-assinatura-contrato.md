# Assinatura de contrato no portal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe pede pelo Jurídico a assinatura de uma versão de contrato/aditivo de cliente; uma conta ativa do cliente assina logada no portal, com os mesmos efeitos da assinatura do Jurídico.

**Architecture:** Tabela `PedidoAssinaturaPortal` (situação gravada aguardando|assinado|cancelado; "versão substituída" e "encerrado" derivados por função pura). O miolo da assinatura sai de `registrarAceite` para `assinarVersaoNoTx` (trava o documento e relê o status dentro do `tx`), usado pelo Jurídico e pelo portal. Módulo novo `src/modules/portal/contratos/` (regras puras, serviço, leituras, ações); rota de arquivo `/api/portal/contratos/[pedidoId]/arquivo`; card "Contratos" no portal e bloco do pedido na versão, no Jurídico.

**Tech Stack:** Next.js 15 (RSC + Server Actions via `defineAction`), Prisma 7 (PostgreSQL 17), Zod, vitest (env node), base-ui/shadcn, smokes em `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`

## Global Constraints

- UI, mensagens, commits em pt-BR; código em inglês só nos identificadores técnicos que já são assim (o projeto usa nomes pt-BR no domínio — siga os vizinhos).
- Commits semânticos pt-BR, terminando com `Co-Authored-By: <seu modelo> <noreply@anthropic.com>`. **Stage só arquivos seus, por caminho.** Arquivos com alterações do dono que NÃO podem entrar inteiros em commit: `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `src/app/(dashboard)/layout.tsx`, `src/lib/permissao-efetiva.ts`, `src/lib/permissao-efetiva.test.ts`, `src/lib/permissions.ts`, `src/lib/session.ts`, `src/lib/so-interno.ts`, `src/lib/so-interno.test.ts`. Para editar um deles, staging parcial: `git update-index --cacheinfo 100644,$(git hash-object -w <arquivo-com-só-a-sua-parte>),<caminho>` (monte a versão "HEAD + sua mudança" num arquivo temporário).
- Migração: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `prisma/migrations/20261122090000_pedido_assinatura_portal/migration.sql` → `npx prisma migrate deploy` → `npm run db:generate`. Nunca `migrate dev` nem `prisma format`.
- vitest só pelo PowerShell: `npx vitest run <arquivo>` (Git Bash quebra o vitest).
- Nunca `next build` com `next dev` rodando.
- Sem `Promise.all` num cliente de transação.
- Mudança de situação do pedido só por `updateMany` condicionado a `status = 'aguardando'`; count ≠ 1 = `MOTIVO_MUDOU`.
- Avisos (sino/e-mail) só depois do commit; falha de aviso nunca desfaz nada.
- Notificação SEM `categoria` (cliente não desliga pedido direto; "assinado" vai só para quem pediu).
- Cliente e projeto do pedido são SEMPRE lidos do `DocumentoJuridico` (o pedido não guarda cópia).
- Recebíveis/previsões gerados por assinatura do portal: autor = `pedidoPorId` (interno), nunca a conta externa.
- `capturarAntes` vai no objeto de config do `defineAction`, nunca como terceiro argumento.
- Toda tela nova: a 390×844 `document.documentElement.scrollWidth` = 390.

## Review Focus

- Conta de OUTRO cliente chamando `assinarContratoNoPortal`/a rota do arquivo com um `pedidoId` válido de outro cliente: recusa uniforme ("Pedido não encontrado." / 404), sem vazar título. Teste: smoke, Task 3 e Task 4.
- Cliente que ficou inativo depois do pedido: some do portal, assinar recusa, rota 404. Teste: smoke, Task 3.
- Duas contas do mesmo cliente assinando o mesmo pedido ao mesmo tempo: um aceite de pedido, uma transição, recebíveis uma vez. Teste: smoke, Task 3.
- Versão nova enviada enquanto o pedido aguarda: some do portal, assinar recusa com `MOTIVO_VERSAO_SUBSTITUIDA`, o Jurídico mostra "Versão substituída" e permite pedir de novo. Teste: `regras.test.ts` (Task 1) + smoke (Task 3).
- Equipe assinando no Jurídico ao mesmo tempo que o cliente no portal (contrato por data, rascunho): uma só transição, recebíveis uma vez, pedido assinado. Teste: smoke, Task 2 (miolo) e Task 3.

---

### Task 1: Tabela do pedido e regras puras

**Files:**
- Modify: `prisma/schema.prisma` (enum + model + relações inversas em `DocumentoJuridico` e `DocJuridicoVersao`)
- Create: `prisma/migrations/20261122090000_pedido_assinatura_portal/migration.sql`
- Create: `src/modules/portal/contratos/regras.ts`
- Test: `src/modules/portal/contratos/regras.test.ts`

**Interfaces:**
- Produces (schema):
  ```prisma
  enum StatusPedidoAssinatura { aguardando assinado cancelado }
  model PedidoAssinaturaPortal {
    id String @id @default(cuid())
    documentoId String   // FK DocumentoJuridico, onDelete: Cascade
    versaoId    String   // FK DocJuridicoVersao, onDelete: Cascade
    status      StatusPedidoAssinatura @default(aguardando)
    pedidoPorId String   // texto, sem relação (evita relação nova em User)
    pedidoEm    DateTime @default(now())
    canceladoPorId String?
    canceladoEm    DateTime?
    assinadoPorId   String?
    assinadoPorNome String?
    assinadoEm      DateTime?
    aceiteId        String? @unique   // AceiteDocumento.id, texto, sem relação
    @@index([documentoId, status])
    @@index([versaoId])
    @@map("pedido_assinatura_portal")
  }
  ```
  Relações inversas: `DocumentoJuridico.pedidosAssinaturaPortal PedidoAssinaturaPortal[]`, `DocJuridicoVersao.pedidosAssinaturaPortal PedidoAssinaturaPortal[]`.
  No fim do `migration.sql`, à mão: `CREATE UNIQUE INDEX "pedido_assinatura_portal_um_aguardando" ON "pedido_assinatura_portal" ("documentoId") WHERE "status" = 'aguardando';`
- Produces (`regras.ts`, puro, sem Prisma/server-only):
  ```ts
  export type StatusPedido = "aguardando" | "assinado" | "cancelado";
  export type SituacaoPedido = "aguardando" | "assinado" | "cancelado" | "versao_substituida" | "encerrado";
  export type StatusContratual = "rascunho" | "aguardando_assinatura" | "assinado" | "vencido" | "rescindido"; // reexporte de juridico/contrato/estado se preferir
  export function situacaoDoPedido(p: { status: StatusPedido; versaoNumero: number }, d: { versaoVigenteNumero: number; statusContrato: StatusContratual | null }): SituacaoPedido;
  export function visivelNoPortal(s: SituacaoPedido): boolean; // aguardando | assinado
  export function rotuloSituacaoEquipe(s: SituacaoPedido): string;
  export type EntradaPedir = {
    tipo: string; vinculoId: string | null; clienteId: string | null; clienteAtivo: boolean;
    projetoClienteId: string | null | undefined; // undefined = documento sem projeto
    contasAtivas: number; versaoNumero: number; versaoVigenteNumero: number; arquivoNome: string;
    statusContrato: StatusContratual | null;
    temPedidoAguardandoNaVigente: boolean; // pedido "aguardando" cuja versão É a vigente (o de versão substituída não conta: o serviço o cancela ao pedir de novo)
  };
  export function motivoParaNaoPedir(e: EntradaPedir): string | null;
  export function motivoParaNaoAssinar(s: SituacaoPedido): string | null;
  export function motivoParaNaoCancelar(status: StatusPedido): string | null;
  export function textoPedidoAssinatura(e: { documentoTitulo: string; tipo: string; projetoNome: string | null; porNome: string }): { titulo: string; corpo: string };
  export function textoAssinadoNoPortal(e: { documentoTitulo: string; versaoNumero: number; contaNome: string }): { titulo: string; corpo: string };
  export function rotuloTipoDocumento(tipo: string): string; // "contrato" → "Contrato", "aditivo" → "Aditivo"
  ```
  Constantes (texto exato, iguais na tela e no `ActionError`):
  - `MOTIVO_NAO_CONTRATUAL = "Só contrato ou aditivo pode ser assinado pelo portal."`
  - `MOTIVO_CONTRATO_EQUIPE = "Contrato de equipe não vai para o portal."`
  - `MOTIVO_SEM_CLIENTE = "O documento não tem cliente."`
  - `MOTIVO_CLIENTE_INATIVO = "O cliente está inativo; o portal dele está fechado."`
  - `MOTIVO_PROJETO_OUTRO_CLIENTE = "O projeto do documento é de outro cliente."`
  - `MOTIVO_SEM_CONTA = "O cliente não tem conta ativa no portal."`
  - `MOTIVO_VERSAO_NAO_VIGENTE = "Só a versão mais recente pode ir para assinatura."`
  - `MOTIVO_NAO_PDF = "Só arquivo PDF pode ser assinado pelo portal."`
  - `MOTIVO_ENCERRADO = "Contrato vencido ou rescindido não vai para assinatura."`
  - `MOTIVO_JA_PEDIDO = "Já há um pedido de assinatura aguardando neste documento."`
  - `MOTIVO_JA_ASSINADO = "Este contrato já foi assinado."`
  - `MOTIVO_CANCELADO = "A equipe cancelou este pedido de assinatura."`
  - `MOTIVO_VERSAO_SUBSTITUIDA = "A equipe enviou uma versão nova deste documento; aguarde o novo pedido."`
  - `MOTIVO_CONTRATO_ENCERRADO = "Este contrato foi encerrado e não aceita mais assinatura."`
  - `MOTIVO_NAO_AGUARDANDO = "O pedido não está mais aguardando assinatura."`
  - `MOTIVO_MUDOU = "O pedido mudou enquanto você agia. Recarregue a página."`
  - `MOTIVO_NAO_ENCONTRADO = "Pedido não encontrado."`
  - `MOTIVO_EXTERNO_NO_JURIDICO = "Assine pelo portal, no pedido de assinatura."`

- [ ] **Step 1: Escrever os testes de `regras.test.ts`** (falham: módulo não existe). Casos mínimos:
  ```ts
  expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "aguardando_assinatura" })).toBe("aguardando");
  expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "assinado" })).toBe("aguardando"); // empresa assinou antes
  expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 1 }, { versaoVigenteNumero: 2, statusContrato: "aguardando_assinatura" })).toBe("versao_substituida");
  expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "rescindido" })).toBe("encerrado");
  expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "vencido" })).toBe("encerrado");
  expect(situacaoDoPedido({ status: "assinado", versaoNumero: 1 }, { versaoVigenteNumero: 3, statusContrato: "vencido" })).toBe("assinado"); // assinado fica para sempre
  expect(situacaoDoPedido({ status: "cancelado", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: null })).toBe("cancelado");
  // visivelNoPortal: só aguardando e assinado
  // motivoParaNaoPedir: base válida (tipo "contrato", vinculoId null, clienteId "c1", clienteAtivo, projetoClienteId "c1", contasAtivas 1, versão 2 de 2, "contrato.PDF", status "rascunho", sem pedido) → null
  //   e um caso por motivo, na ordem: aditivo válido → null; "procuracao" → MOTIVO_NAO_CONTRATUAL; vinculoId → MOTIVO_CONTRATO_EQUIPE;
  //   clienteId null → MOTIVO_SEM_CLIENTE; clienteAtivo false → MOTIVO_CLIENTE_INATIVO; projetoClienteId "c2" → MOTIVO_PROJETO_OUTRO_CLIENTE;
  //   projetoClienteId undefined (sem projeto) → null; contasAtivas 0 → MOTIVO_SEM_CONTA; versão 1 de 2 → MOTIVO_VERSAO_NAO_VIGENTE;
  //   "contrato.docx" → MOTIVO_NAO_PDF; status "vencido"/"rescindido" → MOTIVO_ENCERRADO; status "assinado" → null; temPedidoAguardandoNaVigente → MOTIVO_JA_PEDIDO
  // motivoParaNaoAssinar: aguardando → null; assinado → MOTIVO_JA_ASSINADO; cancelado → MOTIVO_CANCELADO;
  //   versao_substituida → MOTIVO_VERSAO_SUBSTITUIDA; encerrado → MOTIVO_CONTRATO_ENCERRADO
  // motivoParaNaoCancelar: aguardando → null; assinado/cancelado → MOTIVO_NAO_AGUARDANDO
  // textoPedidoAssinatura({ documentoTitulo: "Contrato Villa", tipo: "aditivo", projetoNome: "Villa Verde", porNome: "Helena" }).corpo contém "Helena", "aditivo", "Contrato Villa" e "Villa Verde"; sem projeto, corpo não contém "projeto"
  ```
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run src/modules/portal/contratos/regras.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `regras.ts`.** Ordem de `motivoParaNaoPedir` = ordem da lista acima. PDF = nome termina em `.pdf` sem caixa. `rotuloSituacaoEquipe`: aguardando "Aguardando o cliente", assinado "Assinado pelo cliente", cancelado "Cancelado", versao_substituida "Versão substituída", encerrado "Contrato encerrado". Textos: título do pedido "Contrato para assinar"; corpo `${porNome} pediu sua assinatura no ${tipo minúsculo} "${titulo}"` + (projeto ? ` do projeto ${projetoNome}` : "") + "."; título do assinado "Contrato assinado pelo portal"; corpo `${contaNome} assinou "${titulo}" (v${n}) pelo portal.`
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando → PASS.
- [ ] **Step 5: Schema + migração.** Editar o schema; gerar o SQL com `migrate diff` para o arquivo da migração; acrescentar o índice parcial; `npx prisma migrate deploy`; `npm run db:generate`. Expected: migração aplicada; `npx prisma migrate status` sem pendência.
- [ ] **Step 6: Commit** (`schema.prisma`, a migração, `regras.ts`, `regras.test.ts`): `feat(portal): pedido de assinatura de contrato — tabela e regras`.

### Task 2: Miolo da assinatura e `registrarAceite`

**Files:**
- Create: `src/modules/juridico/assinatura/assinar-service.ts`
- Create: `src/modules/juridico/alcada.ts` (move `exigirSocioSeAcimaDaAlcada` de `actions.ts`, exportada; sem `"use server"`)
- Modify: `src/modules/juridico/actions.ts` (`registrarAceite` usa o miolo; recusa conta externa; remove o caminho (c) `ehClienteDoContrato`; outros usos de `exigirSocioSeAcimaDaAlcada` passam a importar de `alcada.ts`)
- Create: `scripts/smoke-portal-assinatura.ts` (seção "miolo") + script `"smoke:portal-assinatura"` em `package.json` (mesmo formato do `smoke:portal-briefing`)

**Interfaces:**
- Consumes: nada da Task 1 além do client gerado.
- Produces:
  ```ts
  // assinar-service.ts (server-only)
  export type EntradaAssinatura = {
    versaoId: string;
    ator: { id: string; nome: string };     // quem assina (AceiteDocumento.userId/userNome, evento)
    autorFinanceiroId: string;              // autor de recebíveis e da alteração contratual
    hashArquivo: string; ip: string | null; userAgent: string | null;
  };
  export type ResultadoAssinatura = {
    aceiteId: string; jaAssinado: boolean; transicao: boolean;
    documento: { id: string; projetoId: string | null; vinculoId: string | null; formaCobranca: "por_data" | "por_entrega" };
  };
  export async function hashDaVersao(versaoId: string): Promise<string>; // ActionError "Arquivo da versão indisponível para assinatura."
  export async function assinarVersaoNoTx(tx: Prisma.TransactionClient, e: EntradaAssinatura): Promise<ResultadoAssinatura>;
  export async function depoisDeAssinar(r: ResultadoAssinatura, autorFinanceiroId: string): Promise<void>;
  // alcada.ts
  export async function exigirSocioSeAcimaDaAlcada(valor: number | null | undefined, user: { superUsuario: boolean; ehSocio: boolean }): Promise<void>;
  ```
  `assinarVersaoNoTx`: `SELECT id FROM documento_juridico WHERE id = (documento da versão) FOR UPDATE`; relê versão + documento (os campos que `registrarAceite` lê hoje) DENTRO do `tx`; aceite existente de `(versaoId, ator.id)` → `{ jaAssinado: true, transicao: false }` sem escrever; senão cria `AceiteDocumento` + `registrarEventoAssinatura(tx, { tipo: "assinado", … })` e, se `devePassarParaAssinado(tipo, statusContrato)` (status RELIDO), faz exatamente o bloco de transição atual de `registrarAceite` (status/`assinadoEm`, aditivo de equipe com `autorFinanceiroId`, prazo do projeto, `gerarRecebiveisDoContrato` com `autorId: autorFinanceiroId`). `depoisDeAssinar`: se `!jaAssinado && formaCobranca === "por_entrega" && !vinculoId` → `sincronizarPrevisoesDepois(alvo, autorFinanceiroId)` (o `revalidarFinanceiro()` fica com quem chama, que é action).
- `registrarAceite`: primeira checagem `if (ctx.user.tipo === "externo") throw new ActionError(MOTIVO_EXTERNO_NO_JURIDICO)`; mantém `juridico:gerir` / dono do vínculo / RH; mantém a alçada antes (leitura fora do `tx` é só o pré-filtro); `hashDaVersao`; `comRetentativaDeConflito(() => prisma.$transaction(tx => assinarVersaoNoTx(tx, { ator: {id, nome}, autorFinanceiroId: ctx.user.id, … })))`; `depoisDeAssinar`; `revalidarFinanceiro()` quando por entrega; `rev()`; retorno `{ id: aceiteId, jaAssinado }` (mesmo formato de hoje).

- [ ] **Step 1: Escrever a seção "miolo" do smoke** (falha: `assinar-service` não existe). Cria cliente, projeto, `DocumentoJuridico` tipo `contrato`, `statusContrato: "rascunho"`, `clienteId`, `projetoId`, `valor: 1000`, `parcelas: 2`, `primeiroVencimento` (hoje+30), `formaCobranca: "por_data"`, uma versão com arquivo PDF real gravado por `salvarArquivo` (ex.: `juridico/smoke_<tag>/v1.pdf`), dois usuários internos de teste. Checks:
  - `[miolo] duas assinaturas simultâneas (Promise.all de duas transações com assinarVersaoNoTx, usuários diferentes)`: dois aceites, `transicao` true em exatamente UM resultado, `statusContrato = "assinado"`, `lancamento.count({ contratoId, status: { not: "previsao" } }) === 2` (parcelas uma vez).
  - `[miolo] mesma pessoa de novo`: `jaAssinado: true`, aceites continuam 2.
  - `[miolo] recebíveis com autor financeiro`: os lançamentos têm `autorId` = o `autorFinanceiroId` passado (use um id diferente do ator numa das chamadas e confira).
  - Limpeza: apaga lançamentos, aceites, eventos, versão, documento, projeto, cliente, usuários, arquivo.
- [ ] **Step 2: Rodar e ver falhar.** `npm run smoke:portal-assinatura` → erro de import.
- [ ] **Step 3: Implementar `assinar-service.ts`, `alcada.ts` e a refatoração de `registrarAceite`.**
- [ ] **Step 4: Rodar.** `npm run smoke:portal-assinatura` → todas `[OK]`. `npx tsc -p tsconfig.json --noEmit` e `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit` limpos. `npm test` (PowerShell) verde.
- [ ] **Step 5: Commit** (`assinar-service.ts`, `alcada.ts`, `actions.ts`, smoke, `package.json`): `refactor(juridico): miolo da assinatura com trava do documento; conta externa só assina pelo portal`.

### Task 3: Serviço do pedido, leituras e ações

**Files:**
- Create: `src/modules/portal/contratos/service.ts`
- Create: `src/modules/portal/contratos/acesso.ts`
- Create: `src/modules/portal/contratos/queries.ts` (portal) e `src/modules/portal/contratos/equipe-queries.ts` (Jurídico)
- Create: `src/modules/portal/contratos/schemas.ts`, `src/modules/portal/contratos/actions.ts`
- Modify: `src/lib/email-templates-meta.ts` (+ template) e, se houver teste de cobertura das metas, o teste
- Modify: `scripts/smoke-portal-assinatura.ts` (seções pedido/portal)

**Interfaces:**
- Consumes: Task 1 (regras, constantes, modelo), Task 2 (`hashDaVersao`, `assinarVersaoNoTx`, `depoisDeAssinar`, `exigirSocioSeAcimaDaAlcada`).
- Produces:
  ```ts
  // acesso.ts (server-only) — reusa decidirAcessoPortal (modules/portal/acesso-regras.ts) com projetoClienteId = documento.clienteId
  export type ContaDoPortal = { userId: string; nome: string; clienteId: string };
  export async function contaDoPortalParaCliente(user: UsuarioDaSessao | null, clienteIdDoDocumento: string | null): Promise<{ ok: true; conta: ContaDoPortal } | { ok: false; status: 401 | 403 | 404; erro: string }>;

  // service.ts (server-only); deps injetáveis como em inputs/portal-pedido-service.ts
  export type AvisarAssinatura = {
    notificar: (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>;
    enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null;
  };
  export async function pedirAssinaturaNoPortal(p: { documentoId: string; versaoId: string; por: { id: string; nome: string; superUsuario: boolean; ehSocio: boolean } }, deps?: AvisarAssinatura): Promise<{ pedidoId: string; avisadas: number; emails: number }>;
  export async function cancelarPedidoAssinatura(p: { pedidoId: string; porId: string }): Promise<void>;
  export async function assinarPedidoNoPortal(p: { pedidoId: string; conta: ContaDoPortal; ip: string | null; userAgent: string | null }, deps?: Pick<AvisarAssinatura, "notificar">): Promise<{ aceiteId: string; jaAssinado: boolean; documentoProjetoId: string | null; porEntrega: boolean }>;

  // queries.ts (server-only) — portal
  export type ContratoDoPortal = {
    pedidoId: string; titulo: string; tipoRotulo: string; versaoNumero: number; arquivoNome: string;
    pedidoPorNome: string; pedidoEm: string; situacao: "aguardando" | "assinado";
    assinadoPorNome: string | null; assinadoEm: string | null;
  };
  export async function contratosDoPortal(clienteId: string, projetoId: string | null): Promise<ContratoDoPortal[]>; // projetoId null = documentos SEM projeto; só visivelNoPortal; aguardando primeiro, depois pedidoEm desc

  // equipe-queries.ts (server-only) — Jurídico
  export type PedidoNaVersao = { id: string; situacao: SituacaoPedido; rotulo: string; pedidoPorNome: string; pedidoEm: string; assinadoPorNome: string | null; assinadoEm: string | null; canceladoEm: string | null };
  export type PortalDoDocumento = { motivoParaNaoPedir: string | null; contasAtivas: number; pedidosPorVersao: Record<string, PedidoNaVersao[]> };
  export async function portalDosDocumentos(documentoIds: string[]): Promise<Record<string, PortalDoDocumento>>; // motivo calculado para a versão VIGENTE

  // actions.ts ("use server")
  export const pedirAssinaturaPortal;      // { modulo: "juridico", recurso: "juridico", permissao: "gerir", interno: true, schema: { documentoId, versaoId } }
  export const cancelarAssinaturaPortal;   // idem, schema { pedidoId }
  export const assinarContratoNoPortal;    // { modulo: "portal", schema: { pedidoId, concordo: z.literal(true, { message: "Marque que leu e concorda com o documento." }) } } — sem recurso; confere conta no serviço
  ```
- Regras do serviço:
  - `pedirAssinaturaNoPortal`: lê documento (+ cliente ativo, projeto.clienteId, versões), contas ativas (`User` `tipo: "externo"`, `ativo: true`, `clienteId`), pedido aguardando do documento; `motivoParaNaoPedir` → `ActionError`; alçada: `if (devePassarParaAssinado(tipo, statusContrato)) await exigirSocioSeAcimaDaAlcada(valor, por)`; `create` do pedido — P2002 no índice parcial → `ActionError(MOTIVO_JA_PEDIDO)`. Depois do commit, por conta: sino (`textoPedidoAssinatura`, `href` = `/portal/<projetoId>#contratos` ou `/portal#contratos`) e e-mail `portal-contrato-assinatura` (vars `nome` = primeiro nome, `documento` = título, `projeto` = nome do projeto ou "", `url` = `APP_URL` + href). Contas com `enviarEmail` false/erro não derrubam nada.
  - `cancelarPedidoAssinatura`: `updateMany({ where: { id, status: "aguardando" }, data: { status: "cancelado", canceladoPorId, canceladoEm } })`; count ≠ 1 → `MOTIVO_NAO_AGUARDANDO`.
  - `assinarPedidoNoPortal`: lê pedido + documento.clienteId; pedido inexistente OU `documento.clienteId !== conta.clienteId` → `ActionError(MOTIVO_NAO_ENCONTRADO)`; `hashDaVersao` fora do `tx`; `comRetentativaDeConflito(() => prisma.$transaction(async tx => { FOR UPDATE no pedido; FOR UPDATE no documento; relê pedido, versão vigente (max numero), statusContrato; motivoParaNaoAssinar(situacaoDoPedido(...)) → ActionError; const r = await assinarVersaoNoTx(tx, { ator: { id: conta.userId, nome: conta.nome }, autorFinanceiroId: pedido.pedidoPorId, … }); updateMany aguardando → assinado (aceiteId, assinadoPorId, assinadoPorNome, assinadoEm); count ≠ 1 → ActionError(MOTIVO_MUDOU) }))`; depois: `depoisDeAssinar(r, pedido.pedidoPorId)`; sino a `pedidoPorId` se ativo (`textoAssinadoNoPortal`, `href: "/juridico"`).
  - A action do cliente: `contaDoPortalParaCliente(ctx.user, …)` precisa do cliente do documento — leia `pedido → documento.clienteId` na action (ou um helper do serviço) e responda `MOTIVO_NAO_ENCONTRADO` para qualquer recusa de acesso; `userAgent` via `headers()`; `ctx.ip`. `revalidatePath("/portal", "layout")`, `/juridico`, e `revalidarFinanceiro()` quando `porEntrega`.
  - Ações da equipe: `capturarAntes` no config (pedido: documento com `statusContrato`; cancelar: o pedido). `revalidatePath("/juridico")` e `/portal` layout.
- Template (`email-templates-meta.ts`, grupo "Projetos", ao lado de `portal-briefing-pedido`): slug `portal-contrato-assinatura`, label "Pedido de assinatura de contrato pelo portal (cliente)", descrição no tom do briefing (sem opção de desligar; sem SMTP, só o sino), variáveis `nome`, `documento`, `projeto`, `url`, assunto padrão `Assinatura pendente: {{documento}}`, corpo padrão curto em pt-BR com o link.

- [ ] **Step 1: Escrever as seções do smoke** (falham: serviço inexistente), com `notificar`/`enviarEmail` falsos gravando em listas (como `smoke-portal-briefing.ts`). Cenário: cliente A (ativo) com 2 contas ativas + 1 inativa; cliente B com 1 conta; projeto de A; contrato por data como na Task 2; documento de A SEM projeto; um usuário interno sócio (para a alçada) e um não-sócio. Checks:
  - `[pedido] recusas sem gravar`: procuração → `MOTIVO_NAO_CONTRATUAL`; cliente sem conta ativa → `MOTIVO_SEM_CONTA`; cliente inativo → `MOTIVO_CLIENTE_INATIVO`; versão 1 de 2 → `MOTIVO_VERSAO_NAO_VIGENTE`; `.docx` → `MOTIVO_NAO_PDF`; nenhum pedido criado.
  - `[pedido] alçada`: contrato com `valor` acima do limite pedido por não-sócio → recusa com a mensagem de alçada; por sócio → cria.
  - `[pedido] avisos`: 2 sinos e 2 e-mails (só contas ativas de A), slug `portal-contrato-assinatura`, `vars.projeto` = nome do projeto; documento sem projeto → `vars.projeto === ""` e href `/portal#contratos`.
  - `[pedido] dois pedidos simultâneos` (`Promise.all` de dois `pedirAssinaturaNoPortal`): um passa, o outro `MOTIVO_JA_PEDIDO`; 1 linha aguardando.
  - `[portal] leitura`: `contratosDoPortal(A, projeto)` tem o item "aguardando"; `contratosDoPortal(B, projeto)` vazio; `contratosDoPortal(A, null)` só o documento sem projeto.
  - `[portal] outro cliente não assina`: conta de B → `MOTIVO_NAO_ENCONTRADO`, nenhum aceite.
  - `[portal] versão nova`: cria v2 → `contratosDoPortal` não mostra o pedido da v1; assinar recusa `MOTIVO_VERSAO_SUBSTITUIDA`; `portalDosDocumentos` mostra `versao_substituida` e `motivoParaNaoPedir === null`. Pedir na v2: o pedido da v1 (ainda `aguardando` no banco) passa a `cancelado` (`canceladoPorId` = quem pede) na MESMA transação que cria o novo — senão o índice parcial recusaria. Check: v1 `cancelado`, 1 aguardando (v2).
  - `[portal] duas contas assinando ao mesmo tempo` (`Promise.all`): uma passa, a outra `MOTIVO_JA_ASSINADO` ou `MOTIVO_MUDOU`; 1 aceite de conta externa; `statusContrato = "assinado"`; parcelas uma vez; pedido `assinado` com `assinadoPorNome`; sino para `pedidoPorId`; parcelas com `autorId = pedidoPorId`.
  - `[portal] equipe × cliente ao mesmo tempo` (novo contrato rascunho, por data, com pedido): `Promise.all([registrar pelo miolo como interno, assinarPedidoNoPortal])` → 2 aceites, 1 transição, parcelas uma vez, pedido `assinado`.
  - `[portal] cliente inativo`: inativar A com pedido aguardando → `contratosDoPortal` (a página já redireciona; confira `contaDoPortalParaCliente` → `ok: false`) e assinar → `MOTIVO_NAO_ENCONTRADO`.
  - `[portal] cancelar`: cancela → some do portal; cancelar de novo → `MOTIVO_NAO_AGUARDANDO`; assinar → `MOTIVO_CANCELADO`.
  - `[portal] assinado fica`: após nova versão do contrato assinado, o pedido assinado continua em `contratosDoPortal`.
- [ ] **Step 2: Rodar e ver falhar.** `npm run smoke:portal-assinatura` → falha de import.
- [ ] **Step 3: Implementar** `acesso.ts`, `service.ts` (incluindo o cancelamento automático do aguardando de versão substituída dentro do `create` do pedido, numa transação), `queries.ts`, `equipe-queries.ts`, `schemas.ts`, `actions.ts`, template.
- [ ] **Step 4: Rodar.** smoke → todas `[OK]`; `npm test` verde (inclui guardas de `Promise.all` em transação e de campos); tsc dos dois configs limpo; `npm run lint` limpo.
- [ ] **Step 5: Commit**: `feat(portal): pedir, cancelar e assinar contrato pelo portal`.

### Task 4: Rota do arquivo do contrato no portal

**Files:**
- Create: `src/app/api/portal/contratos/[pedidoId]/arquivo/route.ts`
- Modify: `scripts/smoke-portal-assinatura.ts` (seção rota, chamando a função de decisão exportada)

**Interfaces:**
- Consumes: `contaDoPortalParaCliente`, `situacaoDoPedido`, `visivelNoPortal`, `registrarEventoAssinatura`, `comRetentativaDeConflito`, `lerArquivo`, `logAudit`.
- Produces: `GET /api/portal/contratos/[pedidoId]/arquivo?disposition=inline|attachment`. Separe a decisão para o smoke: `export async function arquivoDoPedidoParaConta(user: UsuarioDaSessao | null, pedidoId: string): Promise<{ ok: true; versao: { id: string; arquivoPath: string; arquivoNome: string }; conta: ContaDoPortal } | { ok: false; status: 401 | 403 | 404; erro: string }>` em `src/modules/portal/contratos/arquivo.ts`.
- Regras: pedido inexistente, de outro cliente, cliente inativo, situação não visível (cancelado, versão substituída, encerrado) → 404 `"Arquivo indisponível."`; sem sessão 401; senha/termo 403 (mensagens de `decidirAcessoPortal`). Serve a versão DO PEDIDO. Evento `visualizado` uma vez por (ator, versão), best-effort (mesmo bloco da rota `/api/juridico/versoes/[id]/download`). `logAudit({ userId, modulo: "portal", acao: "baixar-contrato", entidade: "PedidoAssinaturaPortal", entidadeId, detalhe: { versaoId, disposition } })`. `Content-Type: application/pdf`, `Content-Disposition` com `encodeURIComponent(arquivoNome)`, `Cache-Control: private, no-store`. Arquivo sumido → 410 `"Arquivo indisponível."`.

- [ ] **Step 1: Seção do smoke** (falha: `arquivo.ts` inexistente): conta de A no pedido aguardando → ok e versão certa; conta de B → 404; pedido cancelado → 404; versão substituída → 404; pedido assinado com versão nova depois → ok com a versão ASSINADA; cliente inativo → 404; `null` → 401.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `arquivo.ts` e a rota.
- [ ] **Step 4: Rodar** smoke `[OK]`; tsc; lint.
- [ ] **Step 5: Commit**: `feat(portal): arquivo do contrato no portal`.

### Task 5: Jurídico — pedir e acompanhar na versão

**Files:**
- Create: `src/components/juridico/pedido-assinatura-portal.tsx` (client)
- Modify: `src/app/(dashboard)/juridico/page.tsx` (chama `portalDosDocumentos` para os documentos de cliente e passa adiante)
- Modify: `src/components/juridico/juridico-view.tsx` (`Doc.portal?: PortalDoDocumento`; em `DocsTab`, na linha de cada versão)

**Interfaces:**
- Consumes: `portalDosDocumentos`, `PortalDoDocumento`, `PedidoNaVersao`, `pedirAssinaturaPortal`, `cancelarAssinaturaPortal`.
- Produces: `<PedidoAssinaturaPortal documentoId versaoId vigente={i === 0} portal={d.portal} podeGerir />`.
- Comportamento: só para documento com cliente e tipo contrato/aditivo (os outros não recebem `portal`). Na versão vigente, botão "Pedir assinatura no portal" (ícone `Send` ou `MonitorSmartphone`), desabilitado com o motivo visível (`title` + texto pequeno com `aria-describedby`) quando `motivoParaNaoPedir`; confirmação: título "Pedir a assinatura pelo portal?", descrição "As N contas do cliente no portal vão receber um e-mail e um aviso pedindo a assinatura da vN." (singular para 1). Para cada pedido da versão: linha "Portal: {rotulo} · pedido por {nome} em {data}" (+ "· assinado por X em Y" / "· cancelado em Y"); se aguardando (inclusive substituída/encerrada), botão "Cancelar pedido" com confirmação. Toast pt-BR, `router.refresh()`. Sem cor sozinha para a situação (texto sempre).
- `ContratosEquipeTab` não muda.

- [ ] **Step 1:** Implementar o componente e a ligação. (Sem lógica nova: os motivos vêm do servidor; a cobertura é o smoke + a tela.)
- [ ] **Step 2:** `npm run lint`, tsc, `npm test` verdes.
- [ ] **Step 3: Commit**: `feat(juridico): pedir assinatura pelo portal na versão do contrato`.

### Task 6: Portal — card "Contratos" e assinatura

**Files:**
- Create: `src/components/portal/contratos-card.tsx` (server ou client fino) e `src/components/portal/assinar-contrato-dialog.tsx` (client)
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx` (card antes do Briefing, em `LimiteErroEntregas` + `Suspense` próprios, `id="contratos"`)
- Modify: `src/app/(dashboard)/portal/page.tsx` (card dos documentos sem projeto, entre o cabeçalho e a lista de projetos, só quando houver item; `id="contratos"`)

**Interfaces:**
- Consumes: `contratosDoPortal`, `ContratoDoPortal`, `assinarContratoNoPortal`, rota da Task 4.
- Comportamento: card "Contratos" (título com ícone `FileSignature`); vazio → não renderiza o card. Cada item: título, `tipoRotulo` · `v{n}`, "Pedido por {nome} em {data}"; aguardando → selo "Aguardando sua assinatura" (texto + cor warning) e botões "Ler e assinar" (abre o diálogo) e "Baixar"; assinado → "Assinado por {nome} em {data}" e botões "Ver PDF" (nova aba, `?disposition=inline`) e "Baixar". Diálogo (`DialogContent` + `DialogBody`), que É a confirmação (não há `confirm` extra): título "Assinar {tipoRotulo} — v{n}", link "Abrir o PDF em nova aba", `Checkbox` "Li o documento e concordo com os termos.", botão "Assinar" desabilitado sem o checkbox; erro do servidor no campo (`fieldErrors.concordo`) ou em `toast.error`. Sucesso: toast "Contrato assinado.", fecha, `router.refresh()`. Mensagem do erro de carregamento no `LimiteErroEntregas`: "Não foi possível carregar os contratos agora. Tente de novo; se continuar, fale com a equipe do projeto." Mobile: botões com `flex-wrap`, sem rolagem lateral.

- [ ] **Step 1:** Implementar card, diálogo e as duas páginas.
- [ ] **Step 2:** lint, tsc, `npm test` verdes.
- [ ] **Step 3: Commit**: `feat(portal): card de contratos e assinatura no portal`.

### Task 7: Manual, novidades e registro do smoke

**Files:**
- Modify: `docs/manual/inicio/portal-cliente.md` (seção "Contratos": onde aparece, assinar, depois de assinado) — **staging parcial** (o dono tem alterações nele)
- Modify: a página do Jurídico no manual (`grep -ril "assinatura" docs/manual` para achar; seção "Pedir assinatura pelo portal", cancelar, versão nova)
- Modify: `docs/manual/novidades.md` (entrada no topo, linguagem de usuário)
- Modify: `CLAUDE.md` — UMA linha na lista de smokes, depois de `smoke:portal-briefing`: `npm run smoke:portal-assinatura    # assinatura de contrato pelo portal: miolo com trava (uma transição, parcelas uma vez), pedir (recusas, alçada, avisos, corrida), outro cliente/inativo/cancelado/versão substituída, duas contas e equipe × cliente ao mesmo tempo, arquivo` — **staging parcial**

- [ ] **Step 1:** Escrever os textos (pt-BR, para o usuário final, sem jargão técnico).
- [ ] **Step 2:** Conferir `git diff --cached` só com as suas linhas nos dois arquivos do dono.
- [ ] **Step 3: Commit**: `docs(portal): assinatura de contrato pelo portal`.
