# Conversa do cliente com a coordenação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma conversa por projeto entre as contas do cliente (portal) e a coordenação/direção (escritório), com anexos, marca de "decisão do cliente", sino, e-mail uma vez até ler e atualização na hora pelo Socket.io (com conferência periódica de reserva).

**Architecture:** Tabelas próprias (`ConversaPortal`, `MensagemPortal`, `AnexoMensagemPortal`, `LeituraConversaPortal`, `DecisaoMensagemPortal`) num módulo novo `src/modules/portal/mensagens/`: regras puras (audiência, texto, e-mail, contagens), serviço com as escritas, leituras por lado (cliente × equipe), ações `defineAction`. O Socket.io só avisa "a conversa X mudou" por `user:<id>` a cada destinatário; a tela relê pela ação de leitura. `lib/socket.ts` passa a separar o socket do usuário externo (sem presença, sem rooms internos).

**Tech Stack:** Next.js 15 (RSC + Server Actions via `defineAction`), Prisma 7 (PostgreSQL 17), Zod, Socket.io (`lib/socket.ts`, cliente `lib/chat-client.ts`), vitest (env node), base-ui/shadcn, smokes em `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-21-portal-mensagens-coordenacao-design.md`

## Global Constraints

- UI, mensagens, commits em pt-BR; identificadores do domínio em pt-BR como os vizinhos.
- Commits semânticos pt-BR, terminando com `Co-Authored-By: <seu modelo> <noreply@anthropic.com>`. **Stage só arquivos seus, por caminho.** Arquivos com alterações do dono que NÃO podem entrar inteiros em commit: `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `src/app/(dashboard)/layout.tsx`, `src/lib/permissao-efetiva.ts`, `src/lib/permissao-efetiva.test.ts`, `src/lib/permissions.ts`, `src/lib/session.ts`, `src/lib/so-interno.ts`, `src/lib/so-interno.test.ts`. **`src/app/(dashboard)/layout.tsx` não se edita.** Para editar um dos outros, staging parcial: `git update-index --cacheinfo 100644,$(git hash-object -w <arquivo-com-só-a-sua-parte>),<caminho>`.
- Migração: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `prisma/migrations/20261122120000_conversa_portal/migration.sql` → `npx prisma migrate deploy` → `npm run db:generate`. Nunca `migrate dev` nem `prisma format`.
- vitest só pelo PowerShell: `npx vitest run <arquivo>`. Nunca `next build` com `next dev` rodando.
- Dentro de `$transaction`: sem `Promise.all`, sem `select`/`include` aninhado — leituras planas e em sequência.
- Mensagem e anexo nunca se editam nem se apagam (sem update/delete de `MensagemPortal`/`AnexoMensagemPortal` fora de cascata).
- Texto da mensagem: 0–5000 caracteres após `trim`; vazio só com `comAnexos: true`.
- Anexos: até 5 por mensagem, até 100 MB cada, tipos e conferência de conteúdo de `pedido-revisao/regras.ts` (`extensaoDoAnexo`, `assinaturaConfere`, `TAMANHO_MAX_ANEXO`, `MOTIVO_CONTEUDO_DO_ANEXO`).
- A audiência do escritório é UMA função (`podeVerConversa`) usada por toda leitura, escrita, rota, emissão e aviso. Sem permissão nova no catálogo.
- Ação do cliente: sem `recurso`, conta externa + `acessoDoUsuarioAoProjetoDoPortal(...).ok` conferidos no serviço; recusa uniforme `MOTIVO_NAO_ENCONTRADA` ("Conversa não encontrada."). Ação da equipe: `interno: true`, audiência conferida no serviço, mesma recusa.
- Avisos (sino, e-mail, Socket.io) só depois do commit; falha de aviso nunca desfaz a mensagem.
- Equipe: sino e e-mail respeitam a categoria `mensagem_cliente` (opt-out em Preferências corta os dois). Cliente: o sino vai SEM categoria (sempre); só o e-mail respeita `portal_mensagem` (`filtrarPorCategoria`), como o resumo diário. E-mail sem o texto da mensagem.
- Socket.io: emitir só por `emitParaUsuario(userId, "portal-conversa", { projetoId })`, a cada destinatário; nunca a room larga, nunca o texto.
- No portal a marca de decisão diz "Registrada pela coordenação", sem nome; o resumo é visível ao cliente.
- Toda tela nova: a 390×844 `document.documentElement.scrollWidth` = 390; `CabecalhoPagina` como primeiro elemento da página de lista.

## Review Focus

- Projetista (membro do projeto sem papel de coordenação) chamando a ação de leitura/escrita da equipe, a rota do anexo ou recebendo evento/sino: recusa "Conversa não encontrada." / 404 e nenhum aviso. Teste: `audiencia.test.ts` (Task 1) + smoke (Task 3, 4).
- Conta de OUTRO cliente (ou cliente inativo) com um `projetoId`/`anexoId` válido: recusa uniforme, sem vazar título nem nome. Teste: smoke (Task 3, 4).
- Dez mensagens seguidas da equipe sem o cliente ler: um e-mail por conta; depois de abrir a conversa, a próxima mensagem gera outro; duas mensagens simultâneas = um e-mail. Teste: `regras.test.ts` (Task 1) + smoke (Task 3).
- Socket de usuário externo: não recebe `presenca-inicial` nem `presenca`, não entra em `canal:`/`documento:`. Teste: `socket-regras.test.ts` (Task 2).
- Duas mensagens ao mesmo tempo na primeira conversa do projeto: uma só `ConversaPortal`, `ultimoLado` da mais recente. Teste: smoke (Task 3).

---

### Task 1: Tabelas e regras puras

**Files:**
- Modify: `prisma/schema.prisma` (enum, 5 models, relação inversa `Projeto.conversaPortal ConversaPortal?`)
- Create: `prisma/migrations/20261122120000_conversa_portal/migration.sql`
- Create: `src/modules/portal/mensagens/regras.ts`, `src/modules/portal/mensagens/audiencia.ts`
- Test: `src/modules/portal/mensagens/regras.test.ts`, `src/modules/portal/mensagens/audiencia.test.ts`

**Interfaces:**
- Produces (schema):
  ```prisma
  enum LadoMensagemPortal { cliente equipe }
  model ConversaPortal {
    id String @id @default(cuid())
    projetoId String @unique            // FK Projeto, onDelete: Cascade
    criadaEm DateTime @default(now())
    ultimaMensagemEm DateTime?
    ultimoLado LadoMensagemPortal?
    @@map("conversa_portal")
  }
  model MensagemPortal {
    id String @id @default(cuid())
    conversaId String                   // FK ConversaPortal, onDelete: Cascade
    autorId String                      // texto, sem relação
    autorNome String                    // retrato do nome no envio
    lado LadoMensagemPortal
    texto String @db.Text
    comAnexos Boolean @default(false)
    criadaEm DateTime @default(now())
    @@index([conversaId, criadaEm])
    @@map("mensagem_portal")
  }
  model AnexoMensagemPortal {
    id String @id @default(cuid())
    mensagemId String                   // FK MensagemPortal, onDelete: Cascade
    caminho String
    nome String
    tamanho Int
    tipo String
    criadoEm DateTime @default(now())
    @@index([mensagemId])
    @@map("anexo_mensagem_portal")
  }
  model LeituraConversaPortal {
    id String @id @default(cuid())
    conversaId String                   // FK ConversaPortal, onDelete: Cascade
    userId String                       // texto, sem relação
    lidaAte DateTime?
    emailAvisadoEm DateTime?
    @@unique([conversaId, userId])
    @@map("leitura_conversa_portal")
  }
  model DecisaoMensagemPortal {
    id String @id @default(cuid())
    mensagemId String                   // FK MensagemPortal, onDelete: Cascade
    resumo String?                      // até 300 caracteres
    marcadaPorId String
    marcadaEm DateTime @default(now())
    removidaPorId String?
    removidaEm DateTime?
    @@index([mensagemId])
    @@map("decisao_mensagem_portal")
  }
  ```
  No fim do `migration.sql`, à mão: `CREATE UNIQUE INDEX "decisao_mensagem_portal_uma_ativa" ON "decisao_mensagem_portal" ("mensagemId") WHERE "removidaEm" IS NULL;`
- Produces (`regras.ts`, puro):
  - Constantes: `TEXTO_MAX = 5000`, `RESUMO_MAX = 300`, `ANEXOS_MAX = 5`, `JANELA_ANEXO_MS = 15 * 60_000`, `MOTIVO_NAO_ENCONTRADA = "Conversa não encontrada."`, `MOTIVO_TEXTO_VAZIO = "Escreva a mensagem ou anexe um arquivo."`, `MOTIVO_TEXTO_LONGO = "A mensagem passa de 5.000 caracteres."`, `MOTIVO_ANEXOS_MAX = "Cada mensagem aceita até 5 anexos."`, `MOTIVO_JANELA_ANEXO = "O prazo para anexar a esta mensagem acabou. Envie uma nova mensagem."`, `MOTIVO_DECISAO_JA_MARCADA = "Esta mensagem já está marcada como decisão."`, `MOTIVO_DECISAO_NAO_MARCADA = "Esta mensagem não está marcada como decisão."`, `ROTULO_DECISAO_PORTAL = "Registrada pela coordenação"`.
  - `motivoParaNaoEnviar(p: { texto: string; comAnexos: boolean }): string | null`
  - `motivoParaNaoAnexar(p: { autorId: string; userId: string; criadaEm: Date; agora: Date; anexos: number; comAnexos: boolean }): string | null` — outro autor ou mensagem sem `comAnexos` → `MOTIVO_NAO_ENCONTRADA`.
  - `precisaDeEmail(l: { lidaAte: Date | null; emailAvisadoEm: Date | null }): boolean` — `emailAvisadoEm === null || (lidaAte !== null && emailAvisadoEm <= lidaAte)`.
  - `aguardandoResposta(c: { ultimoLado: "cliente" | "equipe" | null }): boolean`
  - `ladoOposto(lado)`, `contaNaoLida(m: { lado; criadaEm }, meuLado, lidaAte: Date | null): boolean` — só mensagens do lado oposto depois de `lidaAte`.
- Produces (`audiencia.ts`, puro):
  ```ts
  export type FatosAudiencia = {
    ativo: boolean; tipo: "interno" | "externo"; superUsuario: boolean; escopoGlobalPerfil: boolean;
    papelNoProjeto: string | null; perfilChave: string | null; enxergaProjeto: boolean;
  };
  export function podeVerConversa(f: FatosAudiencia): boolean;
  export function ehPapelDeCoordenacao(papel: string | null): boolean; // papel === "coordenador"
  export function destinatariosDaEquipe(p: { coordenadores: string[]; globais: string[]; autorId: string }): string[];
  ```
  `podeVerConversa`: inativo ou externo → false; `superUsuario` ou `escopoGlobalPerfil` → true; `ehPapelDeCoordenacao(papelNoProjeto)` → true; `perfilChave === "coordenador" && enxergaProjeto` → true; senão false. `destinatariosDaEquipe` = `destinatariosDaConclusao` (`planejamento/conclusao-aviso.ts`), reaproveitado.

- [ ] **Step 1: Testes que falham** — `audiencia.test.ts`: `"projetista membro do projeto não vê"` (papel `"projetista"`, `enxergaProjeto: true` → false); `"coordenador do projeto vê"`; `"perfil coordenador sem enxergar o projeto não vê"`; `"perfil coordenador que enxerga vê"`; `"escopo global vê sem ser membro"`; `"externo nunca vê, nem superUsuario"`; `"inativo não vê"`; `"sem coordenadores avisa os globais, nunca o autor"`. `regras.test.ts`: `"texto vazio só com anexos"`, `"texto de 5001 caracteres recusa"` (após trim), `"anexo de outra pessoa = não encontrada"`, `"anexo depois de 15 minutos recusa"`, `"sexto anexo recusa"`, `"e-mail: nunca avisado → sim; avisado e não leu → não; leu depois do aviso → sim"`, `"não lida conta só o lado oposto depois de lidaAte"`.
- [ ] **Step 2:** `npx vitest run src/modules/portal/mensagens` → FAIL (módulos não existem).
- [ ] **Step 3:** schema + migração + `regras.ts` + `audiencia.ts`. `npx prisma migrate deploy` e `npm run db:generate`.
- [ ] **Step 4:** `npx vitest run src/modules/portal/mensagens` → PASS.
- [ ] **Step 5:** commit `feat(portal): tabelas e regras da conversa com a coordenação`.

### Task 2: Socket do usuário externo separado

**Files:**
- Create: `src/lib/socket-regras.ts`; Test: `src/lib/socket-regras.test.ts`
- Modify: `src/lib/socket.ts`

**Interfaces:**
- Produces (`socket-regras.ts`, puro):
  ```ts
  export const ROOM_INTERNOS = "internos";
  export function roomsIniciais(p: { userId: string; externo: boolean }): string[]; // externo: só `user:<id>`; interno: `user:<id>` + ROOM_INTERNOS
  export function aceitaEvento(externo: boolean, evento: string): boolean;   // externo: nenhum dos eventos de entrada atuais
  export function contaNaPresenca(externo: boolean): boolean;               // externo: false
  ```
- `socket.ts`: no handshake, ler `User.tipo` do banco (`prisma.user.findUnique`, não confiar no objeto da sessão) e guardar `socket.data.externo`. Externo: entra só nos rooms de `roomsIniciais`, não lê `canalMembro`, não recebe `presenca-inicial`, não altera o mapa de presença; os handlers `entrar-canal`, `entrar-documento`, `sair-documento`, `solicitar-presenca`, `digitando` retornam cedo quando `!aceitaEvento(...)`. Os dois `io.emit("presenca", …)` passam a `io.to(ROOM_INTERNOS).emit(...)`.

- [ ] **Step 1: Testes que falham** — `"externo só entra no próprio room"`, `"interno entra no próprio room e em internos"`, `"externo recusa entrar-canal, entrar-documento, sair-documento, solicitar-presenca e digitando"`, `"interno aceita os mesmos eventos"`, `"externo não conta na presença"`.
- [ ] **Step 2:** `npx vitest run src/lib/socket-regras.test.ts` → FAIL.
- [ ] **Step 3:** `socket-regras.ts` e a ligação em `socket.ts`.
- [ ] **Step 4:** vitest → PASS; `npx tsc -p tsconfig.server.json --noEmit` (com `NODE_OPTIONS=--max-old-space-size=8192`) sem erro novo.
- [ ] **Step 5:** commit `fix(socket): conexão de cliente do portal sem presença nem rooms internos`.

### Task 3: Serviço, leituras, ações e avisos

**Files:**
- Create: `src/modules/portal/mensagens/service.ts`, `queries.ts`, `schemas.ts`, `actions.ts`, `avisos.ts`
- Modify: `src/lib/email-templates-meta.ts` (2 templates), `src/modules/usuarios/preferencias/queries.ts` (`notifMensagemCliente`, `notifPortalMensagem`)
- Create: `scripts/smoke-portal-mensagens.ts`; Modify: `package.json` (`smoke:portal-mensagens`)

**Interfaces:**
- Consumes: Task 1 (`regras.ts`, `audiencia.ts`, schema).
- Produces (`service.ts`):
  ```ts
  export type Autor = { userId: string; nome: string; lado: "cliente" | "equipe" };
  export async function enviarMensagem(p: { projetoId: string; autor: Autor; texto: string; comAnexos: boolean }): Promise<{ mensagemId: string; conversaId: string }>;
  export async function marcarLida(p: { projetoId: string; userId: string; ate: Date }): Promise<void>;
  export async function marcarDecisao(p: { mensagemId: string; userId: string; resumo: string | null }): Promise<void>;
  export async function desmarcarDecisao(p: { mensagemId: string; userId: string }): Promise<void>;
  export async function audienciaDoProjeto(projetoId: string): Promise<string[]>;            // ids internos ativos com podeVerConversa
  export async function podeVerConversaDoProjeto(userId: string, projetoId: string): Promise<boolean>;
  export async function contasDoClienteDoProjeto(projetoId: string): Promise<{ userId: string; nome: string; email: string | null }[]>; // externas ativas, cliente ativo
  ```
  `enviarMensagem`: uma transação — `INSERT INTO conversa_portal … ON CONFLICT ("projetoId") DO NOTHING`, `SELECT … FOR UPDATE` da conversa, cria a mensagem, atualiza `ultimaMensagemEm`/`ultimoLado`, faz upsert da leitura do autor com `lidaAte = criadaEm`. `marcarLida` nunca recua `lidaAte`. `marcarDecisao`: `P2002` do índice parcial → `MOTIVO_DECISAO_JA_MARCADA`. `desmarcarDecisao`: `updateMany({ where: { mensagemId, removidaEm: null } })`, count 0 → `MOTIVO_DECISAO_NAO_MARCADA`. As funções que recebem `userId` da equipe conferem `podeVerConversaDoProjeto`; as do cliente conferem a conta pelo acesso do portal — ambas recusam com `MOTIVO_NAO_ENCONTRADA`.
- Produces (`queries.ts`):
  ```ts
  export type MensagemDTO = { id: string; lado: "cliente" | "equipe"; autorNome: string; texto: string; criadaEm: string;
    anexos: { id: string; nome: string; tamanho: number }[]; decisao: { resumo: string | null; marcadaPor: string; marcadaEm: string } | null; minha: boolean };
  export type ConversaDTO = { projetoId: string; mensagens: MensagemDTO[]; temAnteriores: boolean; naoLidas: number;
    decisoes: { mensagemId: string; resumo: string | null; trecho: string; mensagemEm: string; marcadaPor: string }[] };
  export async function conversaParaCliente(projetoId: string, userId: string, antesDe?: string): Promise<ConversaDTO | null>;
  export async function conversaParaEquipe(projetoId: string, userId: string, antesDe?: string): Promise<ConversaDTO | null>;
  export async function conversasDaEquipe(userId: string, filtro: { soMinhas: boolean }): Promise<{ projetoId: string; codigo: string; nome: string; ultimaMensagemEm: string | null; aguardando: boolean; naoLidas: number }[]>;
  ```
  Últimas 50 mensagens (`antesDe` pagina). `conversaParaCliente` põe `decisao.marcadaPor = ROTULO_DECISAO_PORTAL` sempre. `conversasDaEquipe`: aguardando primeiro, depois `ultimaMensagemEm desc`.
- Produces (`actions.ts`): `enviarMensagemCliente`, `carregarConversaCliente` (`audit: false`), `marcarConversaLidaCliente` (`audit: false`), `enviarMensagemEquipe`, `carregarConversaEquipe` (`audit: false`), `marcarConversaLidaEquipe` (`audit: false`), `marcarDecisaoDoCliente`, `desmarcarDecisaoDoCliente` (ações da equipe), `salvarAvisoPortalMensagem` (grava `notif_portal_mensagem`, como `resumo-actions.ts`).
- Produces (`avisos.ts`): `avisarMensagemNova(mensagemId: string, deps?: { notificar; enviarEmail | null; emitir }): Promise<{ sinos: number; emails: number; emitidos: number }>` — destinatários: lado `cliente` escreveu → `destinatariosDaEquipe` (coordenadores membros ativos com `ehPapelDeCoordenacao`; sem nenhum, `whereAudiencia("global")`), filtrados por `audienciaDoProjeto`; lado `equipe` escreveu → `contasDoClienteDoProjeto` menos o autor. Sino e e-mail pela regra de categoria das Global Constraints; e-mail só se `precisaDeEmail` e a reserva ganhar: `UPDATE leitura_conversa_portal SET "emailAvisadoEm" = now() WHERE "conversaId" = $1 AND "userId" = $2 AND ("emailAvisadoEm" IS NULL OR ("lidaAte" IS NOT NULL AND "emailAvisadoEm" <= "lidaAte")) RETURNING id` (cria a linha antes, sem `lidaAte`); envio falhou (`false`) → devolve `emailAvisadoEm` ao valor anterior. Emissão `portal-conversa` para todos os destinatários E para a audiência/contas do próprio lado do autor (as outras telas abertas atualizam). Templates `portal-mensagem-equipe` (para o cliente) e `portal-mensagem-cliente` (para a equipe), variáveis `nome`, `projeto`, `autor`, `url`; sem o texto.
- Hrefs: cliente `/portal/<projetoId>#mensagens`; equipe `/projetos/<projetoId>/cliente`.

- [ ] **Step 1: Smoke que falha** — `scripts/smoke-portal-mensagens.ts` (padrão de `scripts/smoke-portal-assinatura.ts`: cria e apaga o próprio cenário; `deps` falsos para sino/e-mail/emissão). Casos `[OK]`: cliente envia e a conversa nasce; projetista, coordenador de outro projeto e perfil Coordenador sem ver o projeto recebem `MOTIVO_NAO_ENCONTRADA` na leitura e não estão nos destinatários; gestor global lê sem ser membro; conta de outro cliente e de cliente inativo recusam; coordenador membro recebe sino e e-mail; sem coordenador, os globais; o autor nunca; dez mensagens da equipe = um e-mail por conta; `marcarLida` e a próxima mensagem gera outro e-mail; duas mensagens simultâneas = um e-mail e uma conversa; opt-out `portal_mensagem` corta o e-mail do cliente e mantém o sino; opt-out `mensagem_cliente` corta sino e e-mail do coordenador; decisão marca, marca de novo recusa, desmarca, histórico com 1 linha removida, portal mostra `"Registrada pela coordenação"`; leitura do cliente não traz nome de quem marcou; texto vazio sem anexo recusa.
- [ ] **Step 2:** `npm run smoke:portal-mensagens` → falha (módulo inexistente).
- [ ] **Step 3:** serviço, leituras, ações, avisos, templates, preferências.
- [ ] **Step 4:** smoke → todos `[OK]`; `npx vitest run src/modules/portal src/lib` → PASS.
- [ ] **Step 5:** commit `feat(portal): conversa com a coordenação — serviço, avisos e smoke`.

### Task 4: Rotas de anexo (enviar e baixar)

**Files:**
- Create: `src/app/api/portal/mensagens/[mensagemId]/anexos/route.ts` (POST), `src/app/api/portal/mensagens/anexos/[anexoId]/route.ts` (GET)
- Modify: `src/modules/portal/mensagens/service.ts` (`gravarAnexo`, `anexoParaUsuario`), smoke (casos de anexo)

**Interfaces:**
- Produces: `gravarAnexo(p: { mensagemId: string; userId: string; caminho: string; nome: string; tamanho: number; tipo: string }): Promise<{ anexoId: string }>` — trava a linha da mensagem (`FOR UPDATE`), aplica `motivoParaNaoAnexar`; `anexoParaUsuario(anexoId: string, user: { id: string; tipo: "interno" | "externo"; mustChangePassword: boolean }): Promise<{ caminho: string; nome: string; tipo: string } | null>` — externo pelo acesso do portal ao projeto da conversa, interno por `podeVerConversaDoProjeto`.
- POST: mesmo esqueleto de `src/app/api/portal/pedidos/[id]/anexos/route.ts` (teto antes de ler o corpo, `limitarStream`, `assinaturaConfere`, arquivo apagado se o registro falhar), aberto a interno e externo, caminho `portal/mensagens/<conversaId>/<mensagemId>/<aleatorio>-<nome>` via `salvarStream`. Depois do registro, emite `portal-conversa` aos dois lados (pelas mesmas listas de `avisos.ts`, sem novo sino nem e-mail).
- GET: `Content-Disposition` (inline para PDF/imagem com `?disposition=inline`, senão attachment), `X-Content-Type-Options: nosniff`, `logAudit`. Qualquer recusa = 404 `"Arquivo indisponível."`.

- [ ] **Step 1: Casos no smoke que falham** — chamando `gravarAnexo`/`anexoParaUsuario` direto: anexo do autor dentro da janela grava; sexto recusa; de outra pessoa recusa; projetista e outro cliente recebem `null`; coordenador e conta do cliente recebem o caminho.
- [ ] **Step 2:** smoke → falha.
- [ ] **Step 3:** serviço + as duas rotas.
- [ ] **Step 4:** smoke → `[OK]`; `npm run lint` sem erro novo.
- [ ] **Step 5:** commit `feat(portal): anexos da conversa com a coordenação`.

### Task 5: Card "Fale com a coordenação" no portal

**Files:**
- Create: `src/components/portal/mensagens/conversa-card.tsx` (client), `src/components/portal/mensagens/use-conversa-ao-vivo.ts`, `src/components/mensagens-cliente/mensagem-item.tsx` (compartilhado com a equipe), `src/components/mensagens-cliente/escrever-mensagem.tsx` (compartilhado: texto + anexos, recebe a ação por prop)
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx` (card com `id="mensagens"`, dentro de `LimiteErroEntregas` próprio, depois de Pedidos de revisão)

**Interfaces:**
- Consumes: Task 3 ações do cliente; Task 4 rotas.
- `useConversaAoVivo(p: { projetoId: string; carregar: () => Promise<void> }): void` — `getSocket()` de `lib/chat-client.ts`, ouve `portal-conversa` (filtra `projetoId`), chama `carregar`; sem socket conectado, `setInterval` de 20 s só com `document.visibilityState === "visible"`; limpa ao desmontar.
- Card: últimas mensagens (lado do cliente à direita), "Ver anteriores", lista "Decisões" recolhível quando houver, campo de escrever (Enter envia, Shift+Enter quebra linha), anexos 1 por requisição depois de criar a mensagem com `comAnexos`, botão "Avisar por e-mail" ligado/desligado (`salvarAvisoPortalMensagem`). Abrir/receber com o card visível chama `marcarConversaLidaCliente`. Marca de decisão: selo "Decisão" + `ROTULO_DECISAO_PORTAL` + resumo.

- [ ] **Step 1:** implementar; `npm run lint` e `npx tsc --noEmit` (com heap) sem erro novo.
- [ ] **Step 2:** conferir em tela (Task 7 faz os prints): cliente envia, recebe resposta da equipe sem recarregar (sob `dev:server`) e com recarga periódica (sob `npm run dev`).
- [ ] **Step 3:** commit `feat(portal): card de conversa com a coordenação`.

### Task 6: Aba Cliente e lista "Mensagens de clientes"

**Files:**
- Modify: `src/modules/projetos/abas.ts` (`"/cliente": "Cliente"` em `ABA_LABEL` e na lista configurável), `src/app/(dashboard)/projetos/[id]/layout.tsx` (`"/cliente"` em `abasVisiveis` só se `podeVerConversaDoProjeto`), `src/modules/projetos/abas.test.ts` se ele enumera as abas
- Create: `src/app/(dashboard)/projetos/[id]/cliente/page.tsx`, `src/components/mensagens-cliente/conversa-equipe.tsx`, `src/components/mensagens-cliente/marcar-decisao-dialog.tsx`, `src/app/(dashboard)/projetos/mensagens-cliente/page.tsx`
- Modify: `src/app/(dashboard)/projetos/page.tsx` (ação "Mensagens de clientes" no `CabecalhoPagina`, com o total aguardando, só para quem é audiência de ao menos um projeto)

**Interfaces:**
- Consumes: Task 3 ações/queries da equipe, `MensagemItem`/`EscreverMensagem` (Task 5).
- Aba: página `notFound()` se `!podeVerConversaDoProjeto`. Conversa + "Decisões" à direita (abaixo no celular). Menu da mensagem (ADR-0002: descritor puro `itensDaMensagem(m, { podeDecidir })` em `src/modules/portal/mensagens/acoes.ts` com teste, `LinhaComMenu` + `BotaoAcoes`): "Marcar como decisão do cliente" / "Remover marca de decisão" (confirm antes). O diálogo de marcar tem resumo opcional (até 300) e o aviso "O cliente vê este resumo."
- Lista: `CabecalhoPagina` "Mensagens de clientes"; filtro "Só os projetos em que sou coordenador" ligado por padrão quando a pessoa é membro coordenador de algum projeto (`?todos=1` desliga); linha = projeto, última mensagem, selo "Aguardando resposta", não lidas; clique abre a aba.
- Preferências: em `src/components/configuracoes/preferencias-view.tsx`, toggle "Mensagens de clientes no portal" para `notif_mensagem_cliente`, ao lado de "Pedidos de revisão do cliente".

- [ ] **Step 1: Teste que falha** — `acoes.test.ts`: `"sem permissão de decidir não há itens"`, `"mensagem sem marca oferece marcar"`, `"mensagem marcada oferece remover"`.
- [ ] **Step 2:** `npx vitest run src/modules/portal/mensagens/acoes.test.ts` → FAIL.
- [ ] **Step 3:** descritor, telas, aba, lista, preferência.
- [ ] **Step 4:** vitest → PASS; lint e tsc sem erro novo.
- [ ] **Step 5:** commit `feat(projetos): aba Cliente e lista de mensagens de clientes`.

### Task 7: Manual, novidades, registro e verificação em tela

**Files:**
- Modify: `docs/manual/inicio/portal-cliente.md` (seção "Fale com a coordenação", staging parcial), a página de Projetos do manual com a aba Cliente, `docs/manual/novidades.md`, o índice de busca do manual se o projeto o regera, `CLAUDE.md` (linha do `smoke:portal-mensagens` na lista de comandos e as categorias `mensagem_cliente`/`portal_mensagem` na lista de categorias — staging parcial)

- [ ] **Step 1:** textos (pt-BR, linguagem do usuário).
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run smoke:portal-mensagens`, e (sem `next dev`) `npm run build` → todos sem erro.
- [ ] **Step 3:** auditoria em tela (`docs/PROTOCOLO_AUDITORIA_FINAL.md` §13) sob `npm run dev:server`: cliente e coordenadora em dois navegadores, mensagem chega sem recarregar; projetista não vê a aba; decisão marcada aparece no portal sem nome; 390×844 e 1366×768 com menu aberto; prints + `LEIAME.md` em `prints-auditoria/2026-11-21_mensagens-coordenacao/`.
- [ ] **Step 4:** commit `docs(portal): conversa com a coordenação no manual`.
