# Aprovação formal da entrega — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coordenação envia ao cliente um pacote de arquivos das Entregas; o cliente (no portal) ou a equipe (por fora, com comprovante) responde uma vez — Aprovo · Aprovo com ressalvas · Não aprovo —, a resposta pode ser anulada com motivo, e Parcelas a faturar mostra a situação do aceite da parcela ligada.

**Architecture:** Módulo novo `src/modules/portal/aprovacao-entrega/` no molde de `pedido-revisao` e `contratos`: regras puras (`regras.ts`, `itens.ts`, `marca.ts`, `acoes.ts`), `service.ts` como ÚNICO escritor das 4 tabelas novas, `queries.ts` por lado (cliente × equipe), `actions.ts` (`defineAction`), `avisos.ts` (sino/e-mail depois do commit, dependências injetáveis). Comprovante por rota multipart interna. A audiência da equipe é a da conversa (`podeVerConversaDoProjeto`); o conjunto "o que o cliente vê nas Entregas" sai de `conteudoDoAlcance(alcanceDoPortal(...))` por uma função pura.

**Tech Stack:** Next.js 15 (RSC + Server Actions), Prisma 7 (PostgreSQL 17), Zod, vitest (env node), base-ui/shadcn, pg-boss (job de limpeza), smokes em `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-22-portal-aprovacao-entrega-design.md`

## Global Constraints

- UI, mensagens e commits em pt-BR; identificadores do domínio em pt-BR como os vizinhos.
- Commits semânticos pt-BR, terminando com `Co-Authored-By: <seu modelo> <noreply@anthropic.com>`. **Stage só arquivos seus, por caminho.** Arquivos com alterações do dono que NÃO podem entrar inteiros em commit: `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `src/app/(dashboard)/layout.tsx`, `src/lib/permissao-efetiva.ts`, `src/lib/permissao-efetiva.test.ts`, `src/lib/permissions.ts`, `src/lib/session.ts`, `src/lib/so-interno.ts`, `src/lib/so-interno.test.ts`. **`src/app/(dashboard)/layout.tsx` não se edita.** Para editar um dos outros: staging parcial `git update-index --cacheinfo 100644,$(git hash-object -w <arquivo-com-só-a-sua-parte>),<caminho>`.
- Migração: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `prisma/migrations/20261122140000_aprovacao_entrega/migration.sql` → `npx prisma migrate deploy` → `npm run db:generate`. Nunca `migrate dev` nem `prisma format`.
- vitest só pelo PowerShell: `npx vitest run <arquivo>`. Nunca `next build` com `next dev`/`dev:server` rodando nesta pasta.
- Dentro de `$transaction`: sem `Promise.all`, sem `select`/`include` aninhado — leituras planas e em sequência.
- Só `service.ts` escreve `AprovacaoEntrega`, `AprovacaoEntregaItem`, `RespostaAprovacaoEntrega`, `ComprovanteAprovacaoEntrega`. Nenhuma escrita em `Lancamento`, `ContratoParcelaEntrega`, `uploads/ciclo/*` ou Jurídico.
- Pacote e itens nunca se editam; resposta nunca se apaga (anular preenche `anuladaEm`). Toda troca de status é `updateMany` condicionado ao status lido; `count ≠ 1` → motivo de "já mudou".
- Limites (após `trim`): título 1–120; mensagem 0–1000; texto da resposta 0–2000, obrigatório (≥1) em `aprovado_com_ressalvas` e `nao_aprovado`; motivo da anulação 1–500; nome de quem respondeu por fora 1–120; 1–200 arquivos por pacote.
- Comprovante: `pdf`, `png`, `jpg`, `jpeg`, `eml`, `msg`, até 20 MB (`20 * 1024 * 1024`); sem uso depois de 24 h → o job apaga registro e arquivo.
- Equipe (enviar, cancelar, registrar por fora, anular, ver a seção, baixar comprovante) = `podeVerConversaDoProjeto(userId, projetoId)` (`portal/mensagens/service.ts`) + `interno: true`. Sem permissão nova no catálogo. Recusa uniforme `MOTIVO_NAO_ENCONTRADO = "Pedido não encontrado."`; página → `notFound()`; rota → 404.
- Cliente: ação sem `recurso`; o serviço confere `acessoDoUsuarioAoProjetoDoPortal(user, projetoId).ok` (conta externa ativa de cliente ativo) com a mesma recusa uniforme.
- O cliente NUNCA recebe: comprovante, `registradoPorId`/nome de quem registrou, nome de quem anulou, pacote cancelado.
- Avisos só depois do commit; falha de aviso nunca desfaz. Cliente: sino SEM categoria; e-mail `portal-aprovacao-entrega` sem opt-out (só no envio). Equipe e financeiro: categoria `aprovacao_entrega` (`notif_aprovacao_entrega`).
- Datas: "dia" de São Paulo por `lib/data.ts` (`diaDeSaoPaulo`, `utcInicioDoDia`); nunca `new Date()` cru para dia.
- Toda tela nova: a 390×844 `document.documentElement.scrollWidth` = 390; com o menu aberto a 1366×768, o cabeçalho não sobrepõe a barra.

## Review Focus

- Arquivo do pacote substituído entre o cliente abrir a tela e clicar "Aprovo": recusa `MOTIVO_DESATUALIZADO`, nenhuma resposta gravada. Teste: smoke (Task 2).
- Conta de OUTRO cliente, de cliente inativo, ou projetista do projeto, com um `aprovacaoId`/`comprovanteId` válido: recusa uniforme / 404, sem vazar título. Teste: smoke (Task 2, 4).
- Cliente responde e a equipe registra por fora ao mesmo tempo (ou duas contas do cliente): uma só resposta ativa, o outro recebe `MOTIVO_JA_RESPONDIDO`. Teste: smoke (Task 2).
- Registro por fora com comprovante de outro pacote, já usado por outra resposta ou enviado por outra pessoa: recusa `MOTIVO_COMPROVANTE`. Teste: smoke (Task 4).
- Data do registro por fora: pacote enviado às 23h30 de São Paulo do dia X (02h30Z de X+1) aceita o dia X; dia seguinte a hoje (SP) recusa. Teste: `regras.test.ts` (Task 1).

---

### Task 1: Tabelas e regras puras

**Files:**
- Modify: `prisma/schema.prisma` (3 enums, 4 models, inversas `Projeto.aprovacoesEntrega AprovacaoEntrega[]` e `ContratoParcelaEntrega.aprovacoesEntrega AprovacaoEntrega[]`)
- Create: `prisma/migrations/20261122140000_aprovacao_entrega/migration.sql`
- Create: `src/modules/portal/aprovacao-entrega/regras.ts`, `itens.ts`, `marca.ts`
- Test: `regras.test.ts`, `itens.test.ts`, `marca.test.ts` (mesma pasta)

**Interfaces:**
- Produces (schema):
  ```prisma
  enum StatusAprovacaoEntrega { aguardando respondido cancelado }
  enum RespostaEntrega { aprovado aprovado_com_ressalvas nao_aprovado }
  enum OrigemRespostaEntrega { portal equipe }
  model AprovacaoEntrega {
    id String @id @default(cuid())
    projetoId String                      // FK Projeto, onDelete: Cascade
    titulo String
    mensagem String? @db.Text
    status StatusAprovacaoEntrega @default(aguardando)
    impressaoDigital String               // sha256 hex da lista dos itens
    parcelaId String?                     // FK ContratoParcelaEntrega, onDelete: SetNull
    enviadoPorId String                   // texto, sem relação
    enviadoPorNome String
    enviadoEm DateTime @default(now())
    canceladoPorId String?
    canceladoEm DateTime?
    @@index([projetoId, enviadoEm])
    @@index([parcelaId])
    @@map("aprovacao_entrega")
  }
  model AprovacaoEntregaItem {
    id String @id @default(cuid())
    aprovacaoId String                    // FK AprovacaoEntrega, onDelete: Cascade
    uploadId String                       // texto, sem relação (foto)
    revisaoId String?
    documentoId String?
    disciplinaId String?
    disciplinaNome String
    faseSigla String?
    documentoTitulo String                // titulo ?? nomeArquivo do DocumentoDisciplina; sem documento = nomeArquivo do upload
    revisaoRotulo String                  // rotuloRevisao(numero) de lib/utils; sem revisão = rotuloRevisao(upload.versao)
    nomeArquivo String
    hashSha256 String
    ordem Int
    @@index([aprovacaoId])
    @@index([uploadId])
    @@map("aprovacao_entrega_item")
  }
  model RespostaAprovacaoEntrega {
    id String @id @default(cuid())
    aprovacaoId String                    // FK AprovacaoEntrega, onDelete: Cascade
    resposta RespostaEntrega
    texto String? @db.Text
    origem OrigemRespostaEntrega
    respondidoPorId String?               // conta do portal (origem portal); nulo por fora
    respondidoPorNome String              // nome da conta / nome digitado por fora
    registradoPorId String?               // equipe (origem equipe)
    registradoPorNome String?
    respondidoEm DateTime                 // portal: agora; equipe: utcInicioDoDia do dia informado
    registradoEm DateTime @default(now())
    impressaoDigital String
    comprovanteId String? @unique         // FK ComprovanteAprovacaoEntrega, onDelete: Restrict
    anuladaEm DateTime?
    anuladaPorId String?
    anuladaPorNome String?
    motivoAnulacao String?
    @@index([aprovacaoId])
    @@map("resposta_aprovacao_entrega")
  }
  model ComprovanteAprovacaoEntrega {
    id String @id @default(cuid())
    aprovacaoId String                    // FK AprovacaoEntrega, onDelete: Cascade
    enviadoPorId String
    caminho String
    nome String
    tamanho Int
    tipo String
    criadoEm DateTime @default(now())
    usadoEm DateTime?
    @@index([aprovacaoId])
    @@index([usadoEm, criadoEm])
    @@map("comprovante_aprovacao_entrega")
  }
  ```
  No fim do `migration.sql`, à mão: `CREATE UNIQUE INDEX "resposta_aprovacao_entrega_uma_ativa" ON "resposta_aprovacao_entrega" ("aprovacaoId") WHERE "anuladaEm" IS NULL;`
- Produces (`regras.ts`, puro): constantes dos limites das Global Constraints (`TITULO_MAX = 120`, `MENSAGEM_MAX = 1000`, `TEXTO_MAX = 2000`, `MOTIVO_ANULACAO_MAX = 500`, `NOME_POR_FORA_MAX = 120`, `ITENS_MAX = 200`, `TAMANHO_MAX_COMPROVANTE = 20 * 1024 * 1024`, `TAMANHO_MAX_COMPROVANTE_LABEL = "20 MB"`, `EXTENSOES_COMPROVANTE = ["pdf","png","jpg","jpeg","eml","msg"]`, `COMPROVANTE_VALIDADE_MS = 24 * 3600_000`) e motivos:
  `MOTIVO_NAO_ENCONTRADO = "Pedido não encontrado."`, `MOTIVO_JA_RESPONDIDO = "Este pedido já foi respondido."`, `MOTIVO_CANCELADO = "Este pedido foi cancelado."`, `MOTIVO_JA_ANULADA = "Esta resposta já foi anulada."`, `MOTIVO_DESATUALIZADO = "Um dos arquivos foi atualizado depois do envio. A coordenação vai enviar de novo."`, `MOTIVO_DESATUALIZADO_EQUIPE = "Um dos arquivos mudou depois do envio: cancele este pedido e envie de novo."`, `MOTIVO_TEXTO_OBRIGATORIO = "Explique as ressalvas ou o motivo de não aprovar."`, `MOTIVO_SEM_ITENS = "Escolha ao menos um arquivo das Entregas."`, `MOTIVO_ITEM_FORA = "Um dos arquivos escolhidos não está nas Entregas do cliente."`, `MOTIVO_PARCELA = "Esta parcela não é de um contrato deste projeto."`, `MOTIVO_DATA_FUTURA = "A data da resposta não pode ser depois de hoje."`, `MOTIVO_DATA_ANTES_DO_ENVIO = "A data da resposta não pode ser antes do envio do pedido."`, `MOTIVO_COMPROVANTE = "Anexe o comprovante da resposta antes de registrar."`, `MOTIVO_PEDIDO_MUDOU = "Este pedido mudou. Recarregue a página."`, `MOTIVO_TIPO_COMPROVANTE = "Anexe PDF, imagem (PNG ou JPG) ou e-mail (EML ou MSG)."`. Rótulos: `ROTULO_RESPOSTA: Record<RespostaEntrega, string>` = `{ aprovado: "Aprovado", aprovado_com_ressalvas: "Aprovado com ressalvas", nao_aprovado: "Não aprovado" }`, `ROTULO_REGISTRADA_PELA_EQUIPE = "Registrada pela coordenação"`.
  ```ts
  export type Resposta = "aprovado" | "aprovado_com_ressalvas" | "nao_aprovado";
  export function contaComoAceite(r: Resposta): boolean;                    // aprovado e com ressalvas
  export function motivoDoTexto(r: Resposta, texto: string | null): string | null; // trim; vazio em ressalvas/não → MOTIVO_TEXTO_OBRIGATORIO; > TEXTO_MAX → "O texto passa de 2.000 caracteres."
  export function motivoParaResponder(p: { status: "aguardando" | "respondido" | "cancelado"; desatualizado: boolean; equipe: boolean }): string | null;
      // respondido → MOTIVO_JA_RESPONDIDO; cancelado → MOTIVO_CANCELADO; desatualizado → equipe ? MOTIVO_DESATUALIZADO_EQUIPE : MOTIVO_DESATUALIZADO
  export function motivoParaCancelar(status): string | null;                // só aguardando
  export function motivoParaAnular(p: { status; respostaAtiva: boolean }): string | null; // status ≠ respondido ou sem resposta ativa → MOTIVO_JA_ANULADA
  export function motivoDaDataPorFora(p: { dia: string; enviadoEm: Date; hoje: string }): string | null;
      // dia/hoje "YYYY-MM-DD"; compara com diaDeSaoPaulo(enviadoEm)
  export function extensaoDoComprovante(nome: string): string;
  export function motivoDoComprovante(p: { nome: string; tamanho: number }): string | null; // tipo → MOTIVO_TIPO_COMPROVANTE; tamanho → "O comprovante passa de 20 MB."
  export function conteudoDoComprovanteConfere(ext: string, inicio: Uint8Array): boolean;
      // pdf/png/jpg/jpeg → assinaturaConfere de pedido-revisao/regras.ts; msg → começa com D0 CF 11 E0 A1 B1 1A E1; eml → os primeiros 512 bytes decodificados em latin1 não têm byte 0
  ```
- Produces (`itens.ts`, puro):
  ```ts
  export type Candidato = { uploadId: string; nomeArquivo: string; disciplinaId: string; disciplinaNome: string;
    faseChave: string; faseRotulo: string; revisaoRotulo: string; ehPdf: boolean };
  export function candidatosDasEntregas(c: ConteudoPublico): Candidato[];
      // achata situacoes → disciplinas → pastas (PastaFase) → extensoes → arquivos; um por uploadId (o mesmo arquivo nas duas pastas conta 1);
      // fora: bloqueado e ausente do disco; ordem disciplina, fase, nome. revisaoRotulo = rotuloRevisao(arquivo.versao)
  export function impressaoDigital(itens: readonly { uploadId: string; hashSha256: string }[]): string;
      // sha256 hex (node:crypto createHash) de linhas `uploadId|hashSha256` ordenadas por uploadId, unidas por "\n"
  export function itemDesatualizado(i: { excluido: boolean; substituido: boolean; nasEntregas: boolean }): boolean;
  ```
  `ConteudoPublico` é tipo de `src/modules/projetos/arquivos/link-publico.ts` (import só de tipo). `itens.ts` importa `node:crypto` — ele roda só no servidor; `marca.ts`, `regras.ts` e `acoes.ts` não importam Prisma/Next.
- Produces (`marca.ts`, puro):
  ```ts
  export type MarcaAceite = { tipo: "aceita" | "aguardando" | "nao_aprovada"; ressalvas: boolean; em: string | null; titulo: string };
  export function marcaDaParcela(pacotes: readonly { titulo: string; status: "aguardando" | "respondido" | "cancelado"; enviadoEm: Date;
    resposta: { resposta: Resposta; respondidoEm: Date } | null /* só a ATIVA */ }[]): MarcaAceite | null;
      // aceito mais recente (por respondidoEm) vence; senão o mais recente não cancelado (por enviadoEm): respondido não-aceite → nao_aprovada, aguardando → aguardando; só cancelados/nada → null. em = dia "YYYY-MM-DD" (SP)
  ```

- [ ] **Step 1: Testes que falham** — `regras.test.ts`: `"com ressalvas conta como aceite, não aprovado não"`, `"texto obrigatório em ressalvas e não aprovo, opcional em aprovo"`, `"texto de 2001 caracteres recusa"`, `"responder: respondido, cancelado e desatualizado recusam com a frase de cada lado"`, `"anular só respondido com resposta ativa"`, `"data por fora: pacote às 23h30 SP do dia X aceita X"` (enviadoEm `2026-12-11T02:30:00Z`, dia `"2026-12-10"` → null), `"data por fora antes do envio recusa"`, `"data por fora amanhã recusa"`, `"comprovante: .docx recusa, 20 MB + 1 recusa, .MSG aceita"`, `"msg sem assinatura OLE não confere; eml com byte 0 não confere"`. `itens.test.ts`: `"mesmo arquivo nas duas pastas vira um candidato"`, `"bloqueado e ausente ficam de fora"`, `"impressão digital não depende da ordem"`, `"impressão digital muda com o hash"`. `marca.test.ts`: `"aceito mais recente vence um aguardando mais novo"`, `"ressalvas marca aceita com ressalvas"`, `"sem aceito, não aprovado mais recente"`, `"só cancelados = sem marca"`.
- [ ] **Step 2:** `npx vitest run src/modules/portal/aprovacao-entrega` → FAIL (módulos não existem).
- [ ] **Step 3:** schema, migração (+ índice parcial à mão), `regras.ts`, `itens.ts`, `marca.ts`; `npx prisma migrate deploy` e `npm run db:generate`.
- [ ] **Step 4:** vitest → PASS.
- [ ] **Step 5:** commit `feat(portal): tabelas e regras da aprovação da entrega`.

### Task 2: Serviço e smoke

**Files:**
- Create: `src/modules/portal/aprovacao-entrega/service.ts`
- Create: `scripts/smoke-portal-aprovacao-entrega.ts`; Modify: `package.json` (`"smoke:portal-aprovacao-entrega": "tsx --tsconfig tsconfig.server.json scripts/smoke-portal-aprovacao-entrega.ts"`, no formato dos vizinhos)

**Interfaces:**
- Consumes: Task 1; `podeVerConversaDoProjeto` (`portal/mensagens/service.ts`); `acessoDoUsuarioAoProjetoDoPortal`, `UsuarioDaSessao` (`portal/acesso.ts`); `alcanceDoPortal` (`link-publico-regras.ts`); `conteudoDoAlcance` (`link-publico.ts`).
- Produces (`service.ts`):
  ```ts
  export type Equipe = { userId: string; nome: string };
  export async function candidatosDoProjeto(projetoId: string): Promise<Candidato[]>;     // candidatosDasEntregas(conteudoDoAlcance(alcanceDoPortal(projeto)))
  export async function enviarAprovacao(p: { projetoId: string; quem: Equipe; titulo: string; mensagem: string | null; uploadIds: string[]; parcelaId: string | null }): Promise<{ id: string }>;
  export async function responderPeloPortal(p: { aprovacaoId: string; conta: UsuarioDaSessao & { nome: string }; resposta: Resposta; texto: string | null; impressaoDigital: string }): Promise<{ projetoId: string; respostaId: string }>;
  export async function registrarPorFora(p: { aprovacaoId: string; quem: Equipe; resposta: Resposta; texto: string | null; dia: string; respondidoPorNome: string; comprovanteId: string }): Promise<{ projetoId: string; respostaId: string }>;
  export async function cancelarAprovacao(p: { aprovacaoId: string; quem: Equipe }): Promise<{ projetoId: string }>;
  export async function anularResposta(p: { respostaId: string; quem: Equipe; motivo: string }): Promise<{ projetoId: string; aprovacaoId: string }>;
  export async function desatualizadosDoProjeto(projetoId: string, aprovacaoIds: string[]): Promise<Set<string>>; // ids de pacotes AGUARDANDO com algum item desatualizado
  export async function parcelasDoProjeto(projetoId: string): Promise<{ id: string; rotulo: string }[]>; // parcelasAFaturar({ projetoId }) → "Contrato — nº. descrição"
  ```
  - `enviarAprovacao`: audiência (`podeVerConversaDoProjeto`) senão `MOTIVO_NAO_ENCONTRADO`; título/mensagem pelos limites; `uploadIds` sem repetição, 1–200, todos em `candidatosDoProjeto` senão `MOTIVO_ITEM_FORA`; `parcelaId` em `parcelasDoProjeto` senão `MOTIVO_PARCELA`. Lê (fora da transação) os uploads com `hashSha256`, `versao`, `documentoId`, `revisaoId`, disciplina e documento (título/nome, fase sigla, número da revisão) e monta os itens na ordem dos candidatos; uma transação cria pacote + itens com `impressaoDigital`.
  - `responderPeloPortal`: lê o pacote; acesso do portal ao `projetoId` dele senão `MOTIVO_NAO_ENCONTRADO`; `impressaoDigital` ≠ a do pacote → `MOTIVO_PEDIDO_MUDOU`; `motivoDoTexto`; Entregas atuais por `candidatosDoProjeto` (fora da transação). Transação: `SELECT id, "excluidoEm", "substituidoPorId" FROM upload WHERE id = ANY($1) FOR UPDATE` (raw), `itemDesatualizado` por item (upload sumido = excluído), `motivoParaResponder`; `updateMany({ where: { id, status: "aguardando" }, data: { status: "respondido" } })` (count 0 → relê e devolve `MOTIVO_JA_RESPONDIDO`/`MOTIVO_CANCELADO`); cria a resposta `origem: "portal"`, `respondidoEm = new Date()`, nome da conta. `P2002` do índice parcial → `MOTIVO_JA_RESPONDIDO`.
  - `registrarPorFora`: audiência; `motivoDaDataPorFora` (hoje = `diaDeSaoPaulo()`); nome 1–120; mesma transação do portal com `origem: "equipe"`, `respondidoEm = utcInicioDoDia(dia)` (`lib/data.ts`), `registradoPorId/Nome`, e o comprovante: `updateMany({ where: { id: comprovanteId, aprovacaoId, enviadoPorId: quem.userId, usadoEm: null }, data: { usadoEm: agora } })`, count ≠ 1 → `MOTIVO_COMPROVANTE`.
  - `cancelarAprovacao`: audiência; `updateMany` aguardando → cancelado com quem/quando; count 0 → motivo do status atual.
  - `anularResposta`: audiência do projeto do pacote da resposta; motivo 1–500; transação: `updateMany` resposta `{ id, anuladaEm: null }` → anulada (count 0 → `MOTIVO_JA_ANULADA`), `updateMany` pacote `{ id, status: "respondido" }` → aguardando (count 0 → rollback com `MOTIVO_JA_ANULADA`).
- Smoke: padrão de `scripts/smoke-portal-assinatura.ts` (cria e apaga o próprio cenário: projeto, cliente, 2 contas do cliente, conta de outro cliente, cliente inativo, coordenador, projetista, uploads marcados nas Entregas, contrato por entrega assinado com parcela). Sem avisos nesta task.

- [ ] **Step 1: Smoke que falha** — casos `[OK]`: envio só com arquivos das Entregas (arquivo fora → `MOTIVO_ITEM_FORA`; parcela de outro projeto → `MOTIVO_PARCELA`; projetista → `MOTIVO_NAO_ENCONTRADO`); foto: itens com hash e rótulo de revisão, impressão digital = `impressaoDigital(itens)`; cliente aprova; segunda resposta → `MOTIVO_JA_RESPONDIDO`; duas contas ao mesmo tempo (`Promise.allSettled` de duas chamadas, fora de transação) = 1 resposta ativa; cliente × `registrarPorFora` ao mesmo tempo = 1; outro cliente e cliente inativo → `MOTIVO_NAO_ENCONTRADO`; upload substituído (setar `substituidoPorId` num upload novo) → `MOTIVO_DESATUALIZADO` e `desatualizadosDoProjeto` contém o pacote; upload excluído → idem; arquivo tirado das Entregas → idem; respondido não vira desatualizado depois de substituir; texto vazio em ressalvas → `MOTIVO_TEXTO_OBRIGATORIO`; impressão digital errada → `MOTIVO_PEDIDO_MUDOU`; cancelar aguardando, cancelar de novo → `MOTIVO_CANCELADO`, responder cancelado → `MOTIVO_CANCELADO`; anular volta a aguardando e permite nova resposta; anular duas vezes ao mesmo tempo = uma; resposta anulada continua no banco.
- [ ] **Step 2:** `npm run smoke:portal-aprovacao-entrega` → falha (módulo inexistente).
- [ ] **Step 3:** `service.ts` (os casos que dependem de comprovante entram na Task 4).
- [ ] **Step 4:** smoke → todos `[OK]`; `npx vitest run src/modules/portal` → PASS.
- [ ] **Step 5:** commit `feat(portal): serviço da aprovação da entrega e smoke`.

### Task 3: Leituras, ações, avisos e marca na parcela

**Files:**
- Create: `src/modules/portal/aprovacao-entrega/queries.ts`, `schemas.ts`, `actions.ts`, `avisos.ts`
- Modify: `src/modules/juridico/contrato/parcelas-a-faturar-queries.ts` (filtro opcional `{ projetoId }` em `parcelasAFaturar` e campo `aceite`), `src/modules/juridico/contrato/parcelas-a-faturar.ts` (tipo `ParcelaAFaturar.aceite: MarcaAceite | null`, preenchido `null` pela função pura), `src/lib/email-templates-meta.ts` (template), `src/modules/usuarios/preferencias/queries.ts` (`notifAprovacaoEntrega`), `src/components/configuracoes/preferencias-view.tsx` (toggle "Aprovações de entrega do cliente" ao lado de "Mensagens de clientes no portal")
- Modify: smoke (casos de avisos e marca)

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces (`queries.ts`):
  ```ts
  export type ItemDTO = { uploadId: string; disciplinaNome: string; faseSigla: string | null; documentoTitulo: string; revisaoRotulo: string;
    nomeArquivo: string; ehPdf: boolean; nasEntregas: boolean };
  export type RespostaDTO = { id: string; resposta: Resposta; texto: string | null; origem: "portal" | "equipe"; respondidoPorNome: string;
    respondidoEm: string; anulada: { em: string; motivo: string; por: string | null } | null;
    registradoPorNome: string | null; comprovante: { id: string; nome: string } | null };   // registrado/comprovante/anulada.por = null no lado do cliente
  export type AprovacaoDTO = { id: string; titulo: string; mensagem: string | null; status: "aguardando" | "respondido" | "cancelado";
    desatualizado: boolean; enviadoEm: string; enviadoPorNome: string | null /* null no cliente */; impressaoDigital: string;
    parcela: { id: string; rotulo: string } | null /* null no cliente */; itens: ItemDTO[]; respostas: RespostaDTO[] /* ativa primeiro, depois anuladas mais novas primeiro */ };
  export async function aprovacoesParaCliente(projetoId: string, user: UsuarioDaSessao): Promise<AprovacaoDTO[] | null>; // null sem acesso; sem cancelados; aguardando primeiro
  export async function aprovacoesParaEquipe(projetoId: string, userId: string): Promise<AprovacaoDTO[] | null>;         // null fora da audiência; mais recente primeiro
  export async function formularioDeEnvio(projetoId: string, userId: string): Promise<{ candidatos: Candidato[]; parcelas: { id: string; rotulo: string }[]; contasAtivas: number } | null>;
  ```
  `nasEntregas` = uploadId em `candidatosDoProjeto` (uma leitura por chamada); `ehPdf` pelo nome. `desatualizado` só em aguardando (`desatualizadosDoProjeto`).
- Produces (`actions.ts`): equipe (`interno: true`, sem `recurso`): `enviarAprovacaoEntrega`, `cancelarAprovacaoEntrega`, `registrarRespostaPorFora`, `anularRespostaAprovacao`, `carregarFormularioAprovacao` (`audit: false`); cliente (sem `interno`): `responderAprovacaoEntrega`. Cada ação chama o serviço e, depois, `avisos.ts`; devolve `{ projetoId }` para `revalidatePath`. `capturarAntes` em cancelar/registrar/anular (o pacote). Schemas Zod em `schemas.ts` com mensagens pt-BR e os limites das Global Constraints (sem `.refine` inline no `defineAction` — memória "refine inline quebra o build").
- Produces (`avisos.ts`):
  ```ts
  export type DepsAvisos = { notificar: (userId: string, n: { titulo: string; corpo: string; href: string }, categoria?: string) => Promise<void>;
    enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null; gestoresFinanceiro: () => Promise<string[]> };
  export async function avisarEnvio(aprovacaoId: string, deps?: DepsAvisos): Promise<{ sinos: number; emails: number }>;   // contas ativas do cliente (contasDoClienteDoProjeto): sino sem categoria + e-mail
  export async function avisarResposta(respostaId: string, deps?: DepsAvisos): Promise<{ sinos: number }>;              // portal: audiência (destinatariosDaEquipe como em mensagens/avisos.ts) cat. aprovacao_entrega; + financeiro se parcela e aceite (portal ou equipe)
  export async function avisarAnulacao(respostaId: string, deps?: DepsAvisos): Promise<{ sinos: number }>;              // contas ativas do cliente, sino sem categoria; + financeiro se parcela e a anulada era aceite
  ```
  `gestoresFinanceiro` padrão = `prisma.user.findMany({ where: wherePermissao("financeiro", "gerir") })`, sem o autor. Hrefs: cliente `/portal/<projetoId>#aprovacoes`; equipe `/projetos/<projetoId>/cliente#aprovacoes`; financeiro `/financeiro/contas`. Template `portal-aprovacao-entrega` (grupo "Projetos"), variáveis `nome`, `titulo`, `projeto`, `url`, assunto `"Aprovação pendente: {{titulo}}"`, descrição dizendo que não tem opção de desligar.
- `parcelasAFaturar(filtro?: { projetoId?: string })`: com `projetoId` acrescenta `projetoId` ao `where`; depois de `listarParcelasAFaturar`, lê os pacotes das parcelas listadas (com a resposta ativa) e preenche `aceite = marcaDaParcela(...)`.

- [ ] **Step 1: Casos no smoke que falham** — com `deps` falsos: envio = 1 sino + 1 e-mail por conta ativa, nenhum à conta inativa nem a outro cliente; sem SMTP (`enviarEmail: null`) só sinos; resposta do cliente = sino ao coordenador (não ao projetista, nem ao autor); aceite em pacote com parcela = sino ao financeiro; "não aprovo" com parcela = sem sino ao financeiro; anulação = sino às contas do cliente; `aprovacoesParaCliente` não traz cancelado, `registradoPorNome`, comprovante nem `anulada.por`; projetista → `aprovacoesParaEquipe` = null; `parcelasAFaturar({ projetoId })` traz só as do projeto e `aceite.tipo = "aceita"` com `ressalvas: true` depois de "com ressalvas"; anulada → volta a `"aguardando"`.
- [ ] **Step 2:** smoke → falha.
- [ ] **Step 3:** queries, schemas, actions, avisos, template, preferências, marca.
- [ ] **Step 4:** smoke → `[OK]`; `npx vitest run src/modules/portal src/modules/juridico` → PASS; `npm run lint` sem erro novo.
- [ ] **Step 5:** commit `feat(portal): leituras, ações e avisos da aprovação da entrega`.

### Task 4: Comprovante (rotas e limpeza)

**Files:**
- Create: `src/app/api/portal/aprovacoes/[aprovacaoId]/comprovante/route.ts` (POST), `src/app/api/portal/aprovacoes/comprovantes/[comprovanteId]/route.ts` (GET)
- Modify: `src/modules/portal/aprovacao-entrega/service.ts` (`gravarComprovante`, `comprovanteParaEquipe`, `limparComprovantesNaoUsados`), `src/lib/jobs.ts` (automação `limpar-comprovantes-aprovacao`, cron `"30 4 * * *"`), smoke

**Interfaces:**
- Produces:
  ```ts
  export async function gravarComprovante(p: { aprovacaoId: string; quem: Equipe; caminho: string; nome: string; tamanho: number; tipo: string }): Promise<{ comprovanteId: string }>; // audiência; só pacote aguardando
  export async function comprovanteParaEquipe(comprovanteId: string, userId: string): Promise<{ caminho: string; nome: string; tipo: string } | null>; // audiência do projeto do pacote
  export async function limparComprovantesNaoUsados(agora?: Date): Promise<number>; // usadoEm null e criadoEm < agora − 24 h: apaga arquivo (resolverCaminho) e linha
  ```
- POST: mesmo esqueleto de `src/app/api/portal/mensagens/[mensagemId]/anexos/route.ts` (teto antes de ler o corpo, `limitarStream`, conferência de conteúdo com `conteudoDoComprovanteConfere`, arquivo apagado se o registro falhar), só interno (`requireInterno`-equivalente da rota), caminho `portal/aprovacoes/<aprovacaoId>/<aleatorio>-<nome>` via `salvarStream`; resposta `{ comprovanteId }`. Recusa de audiência = 404.
- GET: só interno da audiência; `Content-Disposition` inline para PDF/imagem com `?disposition=inline`, senão attachment; `X-Content-Type-Options: nosniff`; `logAudit`. Qualquer recusa = 404 `"Arquivo indisponível."`.

- [ ] **Step 1: Casos no smoke que falham** — `registrarPorFora` sem comprovante/`comprovanteId` inexistente → `MOTIVO_COMPROVANTE`; comprovante de outro pacote → `MOTIVO_COMPROVANTE`; comprovante enviado por outra pessoa → `MOTIVO_COMPROVANTE`; comprovante já usado (resposta anulada e novo registro com o mesmo id) → `MOTIVO_COMPROVANTE`; registro por fora válido grava origem `equipe`, `respondidoEm` = meia-noite UTC do dia e marca `usadoEm`; `comprovanteParaEquipe` = null para projetista e caminho para o coordenador; `limparComprovantesNaoUsados(agora + 25 h)` apaga o não usado e mantém o usado.
- [ ] **Step 2:** smoke → falha.
- [ ] **Step 3:** serviço, rotas, automação.
- [ ] **Step 4:** smoke → `[OK]`; lint sem erro novo.
- [ ] **Step 5:** commit `feat(portal): comprovante da resposta registrada por fora`.

### Task 5: Card "Aprovações de entrega" no portal

**Files:**
- Create: `src/components/portal/aprovacoes-entrega-card.tsx` (client), `src/components/portal/responder-aprovacao-dialog.tsx`
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx` (card com `id="aprovacoes"`, em `LimiteErroEntregas` + `Suspense` próprio com `CardCarregando`, LOGO ANTES do card de Contratos; some quando a lista é vazia)

**Interfaces:**
- Consumes: Task 3 `aprovacoesParaCliente`, `responderAprovacaoEntrega`, `ROTULO_RESPOSTA`, `ROTULO_REGISTRADA_PELA_EQUIPE`.
- Cada pacote: título, mensagem, "Enviado em dd/mm/aaaa", itens (disciplina · fase · documento · revisão · arquivo); link: PDF nas Entregas → `/portal/<projetoId>/prancha/<uploadId>`, outro formato → `/api/portal/projetos/<projetoId>/arquivos/<uploadId>`; `nasEntregas: false` → sem link, texto "fora das Entregas". Aguardando e atual: botões "Aprovo", "Aprovo com ressalvas", "Não aprovo" (`flex-wrap`); o diálogo mostra o rótulo escolhido, campo de texto (obrigatório nos dois últimos, contador `n/2000`) e o aviso "Sua resposta é definitiva e fica registrada com seu nome, a data e a lista destes arquivos."; envia `impressaoDigital` do DTO. Aguardando e desatualizado: `MOTIVO_DESATUALIZADO`, sem botões. Resposta ativa: rótulo + texto + "por <nome> em dd/mm/aaaa hh:mm" (origem portal) ou `ROTULO_REGISTRADA_PELA_EQUIPE` + "em dd/mm/aaaa" (origem equipe). Anuladas: riscadas (`line-through` + texto "Anulada pela coordenação em dd/mm/aaaa: <motivo>"; a informação não depende só da cor).
- Pendentes no topo com destaque por borda/selo "Aguardando sua resposta".

- [ ] **Step 1:** implementar; `npm run lint` e `npx tsc --noEmit` (com `NODE_OPTIONS=--max-old-space-size=8192`) sem erro novo.
- [ ] **Step 2:** commit `feat(portal): card de aprovações de entrega`.

### Task 6: Seção "Aprovações de entrega" na aba Cliente

**Files:**
- Create: `src/modules/portal/aprovacao-entrega/acoes.ts` + `acoes.test.ts`, `src/components/mensagens-cliente/aprovacoes-equipe.tsx`, `src/components/mensagens-cliente/enviar-aprovacao-dialog.tsx`, `src/components/mensagens-cliente/registrar-resposta-dialog.tsx`, `src/components/mensagens-cliente/anular-resposta-dialog.tsx`
- Modify: `src/app/(dashboard)/projetos/[id]/cliente/page.tsx` (seção `id="aprovacoes"` abaixo da conversa, com `Suspense`; a página continua `notFound()` fora da audiência)

**Interfaces:**
- Consumes: Task 3 (equipe), Task 4 (POST do comprovante antes de chamar `registrarRespostaPorFora`).
- Produces (`acoes.ts`, puro, ADR-0002):
  ```ts
  export const ACAO_REGISTRAR_POR_FORA = "registrar-por-fora", ACAO_CANCELAR = "cancelar-aprovacao", ACAO_ANULAR = "anular-resposta", ACAO_VER_COMPROVANTE = "ver-comprovante";
  export function itensDaAprovacao(a: Pick<AprovacaoDTO, "status" | "desatualizado" | "respostas">): AcaoItem[];
  ```
  aguardando: registrar (desabilitado com `MOTIVO_DESATUALIZADO_EQUIPE` se desatualizado) + cancelar (`destructive`, `confirmar`); respondido: anular (`destructive`; o diálogo de motivo é a confirmação) + ver comprovante (link, só se a resposta ativa tem comprovante); cancelado: `[]`. Linha com 2+ itens usa `LinhaComMenu` + `BotaoAcoes`; com 1, só `BotaoAcoes`.
- Diálogo de envio (`DialogBody` + `CollapsibleSection` para a parcela): título, mensagem, candidatos agrupados por disciplina → fase com "Marcar a fase" por grupo e contador "n arquivos", parcela (Select, "Nenhuma" padrão; some sem parcelas), aviso quando `contasAtivas = 0`: "Este cliente não tem conta ativa no portal: registre a resposta por fora."; sem candidatos: estado vazio "Nada nas Entregas do cliente ainda.".
- Registrar por fora: resposta (3 opções), texto, data (input date, padrão hoje SP, `max` hoje), nome de quem respondeu, arquivo do comprovante (enviado pela rota ao escolher; mostra nome/tamanho; erro da rota no campo).
- Lista: título, "Enviado por <nome> em dd/mm", nº de arquivos (itens recolhíveis), selo da situação com texto (Aguardando · Aprovado · Aprovado com ressalvas · Não aprovado · Cancelado · Desatualizado), parcela ligada, resposta ativa (com "Registrada por <nome>" e o comprovante quando origem equipe), anuladas riscadas com quem/quando/motivo. Botão "Enviar para aprovação" no topo da seção.

- [ ] **Step 1: Teste que falha** — `acoes.test.ts`: `"aguardando atual oferece registrar e cancelar"`, `"aguardando desatualizado desabilita registrar com a frase do servidor"`, `"respondido oferece anular e, com comprovante, ver comprovante"`, `"cancelado não tem ações"`.
- [ ] **Step 2:** `npx vitest run src/modules/portal/aprovacao-entrega/acoes.test.ts` → FAIL.
- [ ] **Step 3:** descritor e telas.
- [ ] **Step 4:** vitest → PASS; lint e tsc sem erro novo.
- [ ] **Step 5:** commit `feat(projetos): aprovações de entrega na aba Cliente`.

### Task 7: Marca em Parcelas a faturar

**Files:**
- Modify: `src/components/financeiro/lancamentos/parcelas-a-faturar-card.tsx`

**Interfaces:**
- Consumes: `ParcelaAFaturar.aceite: MarcaAceite | null` (Task 3).
- Linha com `aceite`: selo de texto — `"Aceita pelo cliente em dd/mm/aaaa"` (+ `" (com ressalvas)"`), `"Aguardando aceite do cliente"`, `"Não aprovada pelo cliente em dd/mm/aaaa"`, com `title` = título do pacote. O botão Faturar e a ordem da lista não mudam.

- [ ] **Step 1:** implementar; lint e tsc sem erro novo.
- [ ] **Step 2:** commit `feat(financeiro): aceite do cliente nas parcelas a faturar`.

### Task 8: Manual, registro e verificação

**Files:**
- Modify: `docs/manual/inicio/portal-cliente.md` (seção "Aprovações de entrega", staging parcial), a página do manual de Projetos que descreve a aba Cliente, a página do manual que descreve Parcelas a faturar, `docs/manual/novidades.md`, o índice de busca do manual se o projeto o regera, `CLAUDE.md` (linha do `smoke:portal-aprovacao-entrega` na lista de comandos e a categoria `aprovacao_entrega` na lista de categorias — staging parcial)

- [ ] **Step 1:** textos (pt-BR, linguagem do usuário).
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run smoke:portal-aprovacao-entrega` e (sem `next dev`) `npm run build` → todos sem erro.
- [ ] **Step 3:** commit `docs(portal): aprovação da entrega no manual`.
- [ ] **Step 4:** auditoria em tela (`docs/PROTOCOLO_AUDITORIA_FINAL.md` §13) sob `npm run dev:server` (`NODE_OPTIONS=--max-old-space-size=8192`): coordenadora envia pacote com parcela; cliente vê, abre uma prancha, responde "com ressalvas"; Parcelas a faturar mostra a marca; coordenadora anula; cliente vê riscado e responde de novo; registro por fora com comprovante; projetista sem a seção; 390×844 e 1366×768 com menu aberto; prints + `LEIAME.md` em `prints-auditoria/2026-11-22_aprovacao-entrega/`; servidor encerrado no fim.
