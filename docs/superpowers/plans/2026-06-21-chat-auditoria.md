# Chat — Auditoria e Plano de Evolução — Implementation Plan

> **For agentic workers:** Implemente onda a onda, tarefa a tarefa. Os passos usam checkbox
> (`- [ ]`) para acompanhamento entre sessões. Marque `- [x]` ao concluir e atualize o
> **Status** no topo de cada onda. Não pular a auditoria (`defineAction`) nem trocar a stack.

**Goal:** Corrigir as inconsistências do módulo de chat e evoluí-lo em integração com o resto
do sistema e em experiência de uso, a partir da auditoria de 2026-06-21 (32 achados).

**Architecture:** Mudanças cirúrgicas no módulo existente (`src/modules/chat`, `src/components/chat`,
`src/lib/socket.ts`, `src/lib/chat-client.ts`) + 4 rotas em `src/app/api/chat`. Lógica nova testável
(parsing de menções, agrupamento de não lidas, dedução de status) sai para módulos-folha puros
(sem `server-only`/sessão/prisma no caminho de import do teste) e é coberta por `vitest`. UI/socket/rota:
implementar + `npx tsc --noEmit` + verificação manual rodando `npm run dev:server`.

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript · Prisma 7 (`@/generated/prisma/client`) ·
Socket.io · pg-boss · vitest · sonner · shadcn-on-base-ui.

## Global Constraints

- Arquitetura fixa: Server Actions + Zod no `defineAction`; leitura via Server Components/`queries.ts`.
  Rotas REST só para multipart/streaming/token. **Não** adicionar SWR nem react-hook-form.
- Código/identificadores em inglês; **toda** string de UI em português (pt-BR); commits semânticos pt-BR.
- Auditoria obrigatória em mutações sensíveis via `defineAction`. Ações de alta frequência do chat
  (`enviar-mensagem`, `marcar-lido`, `status-chat`, reações, digitando) mantêm `audit: false`
  (já é o padrão hoje) — **exceto** excluir/editar/fixar/criar-grupo, que **auditam**.
- Prisma sempre de `@/generated/prisma/client`. shadcn é base-ui: triggers `render={<Comp/>}`, não `asChild`.
  `Select onValueChange` devolve `string | null`.
- Realtime só roda sob `npm run dev:server`/prod (Socket.io + pg-boss no `server.ts`). `npm run dev` não tem socket.
- Testes automatizados só para **lógica pura**. UI/socket/rota: `npx tsc --noEmit` + verificação manual.
- Toda migração nova: `npm run db:migrate` (prisma migrate dev) com nome semântico. Client: `npm run db:generate`.

---

## Legenda de status

- ⬜ pendente · 🟡 em andamento · ✅ concluído · ⛔ bloqueado/descartado

| Onda | Tema | Modelo padrão | Status |
|------|------|---------------|--------|
| C0 | Quick wins e correções | Sonnet 4.6 (esforço baixo) | ✅ |
| C1 | Integração e notificações | **Opus 4.8** | ✅ (falta verif. manual 2 usuários) |
| C2 | Recursos de mensagem | Sonnet 4.6 | ✅ (falta verif. manual) |
| C3 | Presença, canais e projeto | Sonnet 4.6 | ✅ (falta verif. manual 2 usuários) |
| C4 | Escala, histórico e busca | Misto (ver tarefa) | ✅ (falta verif. manual recibos) |
| C5 | Extras (digitando, grupos, a11y, limpeza) | Sonnet 4.6 | ✅ C5-1/2/3/4/5 — falta verif. manual |

## Protocolo de modelo (importante)

> **A troca de modelo é manual (`/model`).** O assistente **não** consegue alçar o modelo da
> sessão sozinho nem via hook/settings — isso é ação do usuário. Por isso:
>
> 1. **Antes de iniciar cada etapa**, o assistente anuncia o modelo recomendado e o comando exato,
>    ex.: `👉 Troque agora: /model opus` (ou `/model sonnet`), e **espera** você confirmar a troca.
> 2. Só depois de você confirmar, o assistente executa a etapa.
> 3. O assistente também avisa quando **pode voltar** para o modelo mais barato na etapa seguinte.
>
> Racional do mapa: **Opus** onde o erro é silencioso/estrutural (realtime com race condition,
> corretude de recibos/contagem/paginação); **Sonnet** onde o erro é óbvio e barato de pegar
> (CRUD, UI, migração com padrão repetido) — `tsc` + `lint` + `vitest` + critérios de aceite travam regressão.

### Modelo por etapa (referência rápida)

| Tarefa | Modelo | Comando | Motivo |
|--------|--------|---------|--------|
| C0-1 recibos no reload | Sonnet 4.6 | `/model sonnet` | Mecânico, baixo risco |
| C0-2 gate role `abrirDM` | Sonnet 4.6 | `/model sonnet` | Correção pontual |
| C0-3 remover código morto | Sonnet 4.6 | `/model sonnet` | Limpeza |
| C0-4 menções com acento | Sonnet 4.6 | `/model sonnet` | Lógica pura + testes |
| C1-1 notificar online fora do chat | **Opus 4.8** | `/model opus` | Realtime cross-cutting |
| C1-2 socket global + badge | **Opus 4.8** | `/model opus` | Provider global, concorrência, layout/nav |
| C1-3 padronizar sino | Sonnet 4.6 | `/model sonnet` | Extração mecânica de helper |
| C1-4 não perturbe (reunião) | **Opus 4.8** | `/model opus` | Lógica de notificar × presença |
| C2-1 editar/excluir | Sonnet 4.6 | `/model sonnet` | CRUD + migração padrão |
| C2-2 reações | Sonnet 4.6 | `/model sonnet` | CRUD + migração padrão |
| C2-3 fixar + painel | Sonnet 4.6 | `/model sonnet` | UI + evento já existente |
| C2-4 menção notifica | Sonnet 4.6 | `/model sonnet` | Reusa C0-4; atenção à dedup |
| C2-5 composer multiline | Sonnet 4.6 | `/model sonnet` | UI |
| C2-6 reply-to | Sonnet 4.6 | `/model sonnet` | CRUD + migração padrão |
| C3-1 status na UI | Sonnet 4.6 | `/model sonnet` | UI + broadcast |
| C3-2 join room de novo membro | **Opus 4.8** | `/model opus` | Realtime + cross-módulo (projetos) |
| C3-3 link canal ↔ projeto | Sonnet 4.6 | `/model sonnet` | Navegação |
| C3-4 arquivar canais | Sonnet 4.6 | `/model sonnet` | Filtro de listagem |
| C3-5 mutar + marcar tudo lido | Sonnet 4.6 | `/model sonnet` | CRUD + migração padrão |
| C4-1 N+1 em `listarCanais` | **Opus 4.8** | `/model opus` | Corretude de contagem |
| C4-2 reduzir escrita/leitura de recibos | **Opus 4.8** | `/model opus` | Corretude de recibos sob carga |
| C4-3 histórico paginado | **Opus 4.8** | `/model opus` | Cursor sem pulo de scroll |
| C4-4 busca | Sonnet 4.6 | `/model sonnet` | Query + UI |
| C5-1 digitando | Sonnet 4.6 | `/model sonnet` | Relay efêmero com throttle |
| C5-2 grupos ad-hoc | Sonnet 4.6 | `/model sonnet` | CRUD + migração (reusa C3-2) |
| C5-3 limpeza de anexos | Sonnet 4.6 | `/model sonnet` | I/O de arquivo |
| C5-4 limites de upload | Sonnet 4.6 | `/model sonnet` | Validação |
| C5-5 acessibilidade | Sonnet 4.6 | `/model sonnet` | UI/teclado |

## Rastreabilidade — achado da auditoria → tarefa

| # | Achado (auditoria 2026-06-21) | Tarefa |
|---|-------------------------------|--------|
| 1 | Recibos de leitura quebram ao recarregar | C0-1 |
| 2 | "Fixar mensagem" é meio-recurso | C2-3 |
| 3 | Código morto (`marcarMensagemLida`, `leitoresDaMensagem`) | C0-3 |
| 4 | `editedAt` sem feature de editar/excluir | C2-1 |
| 5 | Falha de segurança em `abrirDM` (sem gate de role) | C0-2 |
| 6 | Menções quebram com acentos (`\w`) | C0-4 |
| 7 | Menções não notificam o mencionado | C2-4 |
| 8 | Multiline inconsistente (Input vs pre-wrap) | C2-5 |
| 9 | `chatStatus` subutilizado na UI | C3-1 |
| 10 | Novo membro de projeto não entra no room ao vivo | C3-2 |
| 11 | Online-fora-do-chat não é notificado | C1-1 |
| 12 | Sem badge global de não lidas | C1-2 |
| 13 | Socket global leve (independente de abrir o chat) | C1-2 |
| 14 | Integrar com o sino de notificações | C1-3 |
| 15 | Link do canal → projeto (e projeto → chat) | C3-3 |
| 16 | Arquivar/silenciar canais de projetos concluídos | C3-4 |
| 17 | Limpeza de anexos órfãos | C5-3 |
| 18 | Coerência de limites/tipos de upload | C5-4 |
| 19 | Editar e excluir mensagem | C2-1 |
| 20 | Reações em emoji | C2-2 |
| 21 | Responder/citar mensagem (reply-to) | C2-6 |
| 22 | Indicador "está digitando…" | C5-1 |
| 23 | Grupos ad-hoc | C5-2 |
| 24 | Busca de mensagens e canais | C4-4 |
| 25 | Carregar histórico antigo (scroll infinito) | C4-3 |
| 26 | Painel de mensagens fixadas | C2-3 |
| 27 | Silenciar/mutar canal + "marcar tudo como lido" | C3-5 |
| 28 | Não perturbe automático (status=reunião) | C1-4 |
| 29 | Acessibilidade (teclado, aria-live) | C5-5 |
| 30 | N+1 em `listarCanais` | C4-1 |
| 31 | Amplificação de escrita em `marcarLido` | C4-2 |
| 32 | `leituras` carregadas para todas as mensagens | C4-2 |

---

## Onda C0 — Quick wins e correções  ✅

> Correções de baixo risco e alto retorno. Nenhuma migração. Faça primeiro.

### C0-1 — Recibos de leitura persistem no reload  (achado #1)

A query [`mensagensCanal`](../../../src/modules/chat/queries.ts) já inclui `leituras`, mas a rota
`mensagens/route.ts` descarta o campo no `map`. O cliente só recebe recibos via socket → ✓✓ some no F5.

**Files:**
- Modify: `src/app/api/chat/canais/[canalId]/mensagens/route.ts` — incluir `leituras` (e `fixada`, `editedAt`) no payload.
- Modify: `src/components/chat/chat-view.tsx` — o tipo `Msg` já tem `leituras?`; garantir hidratação inicial e que o `<CheckCheck>` use `m.leituras` carregado.

**Acceptance:**
- [x] Enviar mensagem em DM, outro usuário abre o canal, recarregar a página do autor → mensagem mostra ✓✓.
  → Rota inclui `leituras`, `fixada`, `editedAt` no payload; cliente inicializa `Msg` com esses campos. (falta verif. manual)
- [x] `npx tsc --noEmit` limpo. → ✓

### C0-2 — Gate de role no `abrirDM`  (achado #5)

`abrirDM` ([actions.ts](../../../src/modules/chat/actions.ts)) só valida `usuarioId !== user.id`.
`usuariosParaDM` exclui `cliente`/`freelancer` apenas na UI → chamada direta abre DM com perfil proibido.

**Files:**
- Modify: `src/modules/chat/actions.ts` — em `abrirDM`, buscar o alvo e `throw new ActionError("Usuário indisponível para conversa.")` se `role ∈ {cliente, freelancer}` ou `ativo === false`.
- Extrair a constante de roles elegíveis (hoje implícita em `usuariosParaDM`/`bootstrap`/`page`) para um único lugar: `src/modules/chat/roles.ts` (`export const CHAT_ROLES`, `DM_ROLES_EXCLUIDAS`).

**Acceptance:**
- [x] Teste puro `src/modules/chat/roles.test.ts` cobrindo a regra de elegibilidade. → ✓ (371 testes passando)
- [x] Chamar `abrirDM` com id de cliente retorna `{ ok:false }` com mensagem amigável.
  → `abrirDM` verifica role do alvo via `DM_ROLES_EXCLUIDAS` de `roles.ts` antes de criar o canal.

### C0-3 — Remover/consolidar código morto  (achado #3)

`marcarMensagemLida` (`leitura/actions.ts`) e `leitoresDaMensagem` (`leitura/queries.ts`) não são
importados em lugar nenhum. Decidir: **(a)** remover, ou **(b)** ligar `leitoresDaMensagem` ao tooltip
de recibos por mensagem. Recomendado: **(a) remover** agora; o recibo já funciona via `marcarLido`.

**Files:**
- Delete: `src/modules/chat/leitura/actions.ts`, `src/modules/chat/leitura/queries.ts` (e a pasta se vazia).
- Verify: `Grep "leitura/"` sem referências remanescentes.

**Acceptance:**
- [x] `npx tsc --noEmit` e `npm run lint` limpos após remoção.
  → Arquivos deletados; pasta `leitura/` removida; sem referências remanescentes.

### C0-4 — Menções com acento  (achado #6)

`renderConteudo` e o regex de autocomplete usam `\w`/`@\w+`, que não casa `José`, `Conceição`.

**Files:**
- Create: `src/modules/chat/mencoes.ts` — `regexMencao()`, `realceMencoes(txt)`, `extrairMencoes(txt)` usando classe Unicode (`[\p{L}\p{N}_]`, flag `u`).
- Modify: `src/components/chat/chat-view.tsx` — `renderConteudo`, `mencaoMatch`, `inserirMencao` passam a usar `mencoes.ts`.

**Acceptance:**
- [x] Teste puro `src/modules/chat/mencoes.test.ts`: realça `@José`, casa parcial com acento, ignora email. → ✓
- [x] Digitar `@Jos` sugere "José" e insere `@José`. → implementado; falta verif. manual.

---

## Onda C1 — Integração e notificações  ✅

> Maior retorno de uso real: hoje quem está logado **fora** do chat não recebe nada.

### C1-1 — Notificar usuários online-mas-fora-do-chat  (achado #11)

`enviarMensagem` só notifica `!usuarioOnline(id)` ([actions.ts](../../../src/modules/chat/actions.ts)).
Quem está logado em outra tela não recebe sino, push nem som (o `FloatingChat` só conecta o socket ao abrir).
Estratégia: o socket global (C1-2) cuida de som/badge/toast para **online**; o push/sino continua para **offline**.
Aqui, garantir que **toda** mensagem para membros (exceto autor) emita para `user:${id}` um evento leve
`mensagem-nao-vista` mesmo que o membro não esteja no room do canal naquele dispositivo.

**Files:**
- Modify: `src/lib/socket.ts` — confirmar `emitParaUsuario`; adicionar helper `emitMensagemGlobal(membros, payload, autorId)`.
- Modify: `src/modules/chat/actions.ts` — após `emitParaCanal`, emitir `emitParaUsuario(id, "chat-badge", {...})` para membros online ≠ autor; manter push só para offline.

**Acceptance:**
- [x] Usuário A em `/financeiro`, B envia DM → A recebe toast + som + badge (via C1-2) sem abrir o chat.
  → `enviarMensagem` emite `chat-badge` via `emitParaUsuario` para membros online ≠ autor; push VAPID só para offline. (falta verif. manual)
- [x] Usuário offline continua recebendo push + sino. → push VAPID em `notificar.ts` preservado. (falta verif. manual)

### C1-2 — Socket global + badge de não lidas  (achados #12, #13)

Item "Chat" do menu é estático ([nav-config.ts](../../../src/lib/nav-config.ts)). Falta um provider montado
no layout do dashboard que mantém o socket vivo em todas as telas e expõe a contagem de não lidas.

**Files:**
- Create: `src/components/chat/chat-presence-provider.tsx` (client) — conecta `getSocket()`, ouve `chat-badge`/`mensagem`, mantém `totalNaoLidas` em contexto, toca som (respeitando preferências) e dá toast com link `/chat?c=`.
- Create: `src/lib/chat-badge-store.ts` (puro) — redução de eventos → contagem; testável.
- Modify: `src/app/(dashboard)/layout.tsx` — montar o provider (carregar contagem inicial via bootstrap leve).
- Modify: `src/lib/nav-config.ts` + componente de nav/sidebar/bottom-nav — renderizar badge no item "Chat".
- Modify: `src/components/chat/floating-chat.tsx` — consumir o contexto (badge no botão flutuante) em vez de só abrir.

**Acceptance:**
- [x] Teste puro `src/lib/chat-badge-store.test.ts`. → ✓ (371 testes passando)
- [x] Badge aparece/zera corretamente ao navegar e ao abrir o canal; uma única conexão de socket por aba.
  → `ChatPresenceProvider` no layout do dashboard; `ChatBadgeStore` reduz eventos em memória. (falta verif. manual)
- [x] `FloatingChat` deixa de ser a única origem do socket (sem 2 conexões na tela de chat).
  → Provider monta o socket; `FloatingChat` consome o contexto. (falta verif. manual)

### C1-3 — Padronizar entrada no sino de notificações  (achado #14)

`notificar` já cria `Notificacao` + push. Garantir título/corpo/tag/href consistentes e deduplicar por canal.

**Files:**
- Modify: `src/modules/chat/actions.ts` — extrair montagem da notificação para helper; `tag: chat-${canalId}` (já existe) para colapsar múltiplas.

**Acceptance:**
- [x] DM e menção geram entrada no sino com link que abre o canal certo.
  → Helper de notificação padronizado; `tag: chat-${canalId}` colapsa múltiplas mensagens do mesmo canal. (falta verif. manual)

### C1-4 — Não perturbe automático (status = reunião)  (achados #28, parte de #9)

Quando `chatStatus = "reuniao"`, suprimir som e push automaticamente.

**Files:**
- Modify: `src/lib/notificar.ts` ou camada do chat — checar `chatStatus` do destinatário antes do push.
- Modify: `chat-presence-provider.tsx` — não tocar som se o próprio usuário está em `reuniao`.

**Acceptance:**
- [x] Usuário em "reunião" não recebe som/push; ainda acumula badge e sino.
  → `notificar.ts` checa `chatStatus === "reuniao"` antes do push; `ChatPresenceProvider` suprime som se o próprio usuário está em reunião. (falta verif. manual)

---

## Onda C2 — Recursos de mensagem  ✅

### C2-1 — Editar e excluir mensagem  (achados #4, #19)

Usar `editedAt` existente; soft-delete com placeholder "mensagem removida".

**Schema:**
```prisma
model Mensagem {
  // ...
  editedAt   DateTime?
  excluidaEm DateTime?   // NOVO — soft delete
}
```

**Files:**
- Modify: `prisma/schema.prisma` (+ `npm run db:migrate -- --name chat_msg_edit_delete`).
- Modify: `src/modules/chat/actions.ts` — `editarMensagem` e `excluirMensagem` (**auditam**; só autor ou admin/supervisor; emitem `mensagem-editada`/`mensagem-excluida`).
- Modify: `src/modules/chat/queries.ts` — filtrar/representar excluídas; incluir `editedAt`.
- Modify: `src/components/chat/chat-view.tsx` — menu por mensagem (editar/excluir), rótulo "(editada)", escutar eventos.

**Acceptance:**
- [x] Autor edita → "(editada)" e atualização ao vivo; admin exclui qualquer uma; excluída vira placeholder.
  → Migração `20260621125258_chat_c2` (excluidaEm + respostaAId + MensagemReacao); eventos `mensagem-editada`/`mensagem-excluida` via socket. (falta verif. manual)
- [x] Auditoria registra editar/excluir. → `defineAction` com `audit:true` em `editarMensagem` e `excluirMensagem`.

### C2-2 — Reações em emoji  (achado #20)

**Schema:**
```prisma
model MensagemReacao {
  id         String   @id @default(cuid())
  mensagemId String
  mensagem   Mensagem @relation(fields: [mensagemId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  emoji      String
  createdAt  DateTime @default(now())
  @@unique([mensagemId, userId, emoji])
  @@index([mensagemId])
  @@map("mensagem_reacao")
}
```

**Files:**
- Modify: `prisma/schema.prisma` (+ migração `chat_reacoes`).
- Modify: `src/modules/chat/actions.ts` — `reagir` (toggle, `audit:false`, emite `reacao`).
- Modify: `src/modules/chat/queries.ts` — agregar reações por mensagem (`emoji → contagem + nomes`).
- Modify: `src/components/chat/chat-view.tsx` — barra de reações + picker reutilizando `EMOJIS`.

**Acceptance:**
- [x] Reagir/desreagir ao vivo; contagem e tooltip com nomes; idempotente por (msg,user,emoji).
  → `MensagemReacao` com `@@unique([mensagemId, userId, emoji])`; `reagir` faz toggle; `agregarReacoes` agrega para UI; evento `reacao` via socket. (falta verif. manual)

### C2-3 — Fixar mensagem: completar UI + painel  (achados #2, #26)

`fixarMensagem` e o evento `"fixada"` já existem no backend; falta UI.

**Files:**
- Modify: `src/components/chat/chat-view.tsx` — ação "fixar/desafixar" no menu da mensagem; escutar `"fixada"`; `Msg` ganha `fixada`; painel "Fixadas" no topo do canal.
- Modify: `src/modules/chat/queries.ts` — `mensagensFixadas(canalId)`.
- Modify: rota de mensagens — já incluir `fixada` (feito em C0-1).

**Acceptance:**
- [x] Fixar mostra no painel; desafixar remove; sincroniza ao vivo entre clientes.
  → Menu por mensagem com "fixar/desafixar" (só admin/supervisor/autor); painel "Fixadas" no topo; evento `fixada` via socket; `mensagensFixadas(canalId)` em `queries.ts`. (falta verif. manual)

### C2-4 — Menções notificam o mencionado  (achado #7)

Parsing server-side (de C0-4) → notificar citados que sejam membros do canal.

**Files:**
- Modify: `src/modules/chat/actions.ts` — em `enviarMensagem`, `extrairMencoes(conteudo)` → resolver para userIds membros → `notificar` (sino+push se offline; `chat-badge` com flag `mencao` se online). Evitar duplicar com a notificação normal de DM.
- Reuse: `src/modules/chat/mencoes.ts`.

**Acceptance:**
- [x] `@Fulano` em `#geral` gera sino "Você foi mencionado…"; não-membros citados são ignorados.
  → `extrairMencoes` resolve para userIds membros; notificação de menção com título "Você foi mencionado" e link ao canal; não-membros ignorados. (falta verif. manual)

### C2-5 — Composer multiline  (achado #8)

Trocar `<Input>` por `<textarea>` auto-resize; `Enter` envia, `Shift+Enter` quebra linha (coerente com `whitespace-pre-wrap`).

**Files:**
- Modify: `src/components/chat/chat-view.tsx` — textarea controlada; manter atalhos; popups de emoji/menção ancorados.

**Acceptance:**
- [x] Mensagem multilinha enviada e renderizada com quebras; atalhos corretos.
  → `<textarea>` auto-resize (max 120px); `Enter` envia, `Shift+Enter` quebra linha; conteúdo renderizado com `whitespace-pre-wrap`. (falta verif. manual)

### C2-6 — Responder/citar (reply-to)  (achado #21)

**Schema:** `Mensagem.respostaAId String?` + self-relation.

**Files:**
- Modify: `prisma/schema.prisma` (+ migração `chat_reply`).
- Modify: `actions.ts` (aceitar `respostaAId`), `queries.ts` (incluir trecho citado), `chat-view.tsx` (botão responder + citação clicável).

**Acceptance:**
- [x] Responder mostra citação; clicar rola até a original.
  → Migração `chat_c2` inclui `respostaAId`; botão "Responder" no menu da mensagem; citação exibida acima do campo de composição; clique na citação rola até a mensagem original via `scrollIntoView`. (falta verif. manual)

---

## Onda C3 — Presença, canais e projeto  ✅

### C3-1 — Exibir `chatStatus` na UI  (achado #9)

Online list ignora ocupado/reunião. Surfar status com cor/legenda (cores já existem: `STATUS_COR`).

**Files:**
- Modify: `src/components/chat/chat-view.tsx` — bolinha por status na lista de online, na DM e no header do canal; combinar presença (online) × `chatStatus`.
- Modify: `queries.ts`/bootstrap — já trazem `chatStatus`; garantir atualização ao vivo (evento `status-chat` broadcast).
- Modify: `src/modules/chat/actions.ts` — `definirStatusChat` emite presença/status para os canais do usuário.

**Acceptance:**
- [x] Mudar para "reunião" reflete em tempo real para os outros.
  → `StatusDot` com cores por status; seletor no topo da sidebar; `definirStatusChat` emite `status-chat` para os canais do usuário; atualizado ao vivo via socket. (falta verif. manual)

### C3-2 — Novo membro entra no room ao vivo  (achado #10)

`ensureCanaisProjeto`/`syncMembros` adiciona membro, mas o socket dele (já conectado) não entra no room.

**Files:**
- Modify: `src/modules/chat/service.ts` — `syncMembros` retorna os `novos`; quem chamou emite `emitParaUsuario(id, "entrar-canal-novo", { canalId })`.
- Modify: pontos que mudam membresia de projeto/disciplina (em `modules/projetos`) chamam o sync e propagam o evento.

**Acceptance:**
- [x] Adicionar membro a projeto → ele passa a receber mensagens do canal sem reconectar.
  → `syncMembros` retorna `novos`; `actions.ts` dos projetos emite `entrar-canal-novo` via `emitParaUsuario`; cliente em `ChatPresenceProvider`/`chat-view.tsx` escuta e adiciona o canal à lista sem reload. (falta verif. manual)

### C3-3 — Link bidirecional canal ↔ projeto  (achado #15)

**Files:**
- Modify: `src/components/chat/chat-view.tsx` — header do canal de projeto/disciplina linka para `/projetos/[projetoId]`.
- Modify: página/aba do projeto — botão "Abrir chat do projeto" → `/chat?c=<canalId>`.

**Acceptance:**
- [x] Navegação funciona nos dois sentidos.
  → Header do canal de projeto/disciplina tem link `<ExternalLink> Projeto` → `/projetos/[projetoId]`; página do projeto tem botão "Abrir chat" → `/chat?c=<canalId>` (via `canalDoProjeto`). (falta verif. manual)

### C3-4 — Arquivar/ocultar canais de projetos concluídos  (achado #16)

**Files:**
- Modify: `src/modules/chat/queries.ts` — `listarCanais` rebaixa/colapsa canais cujo projeto está concluído/arquivado (usar status de `Projeto`).
- Modify: `chat-view.tsx` — seção "Arquivados" colapsável.
- Consider: `Canal.arquivadoEm` se for preciso arquivar manualmente (avaliar antes de migrar).

**Acceptance:**
- [x] Projeto concluído some da lista principal e aparece em "Arquivados".
  → `listarCanais` rebaixa canais com `projetoSituacao ∈ {concluido, arquivado, cancelado}` para o fundo da lista; sidebar exibe esses canais colapsados em seção "Arquivados". (falta verif. manual)

### C3-5 — Mutar canal + "marcar tudo como lido"  (achado #27)

**Schema:** `CanalMembro.silenciado Boolean @default(false)`.

**Files:**
- Modify: `prisma/schema.prisma` (+ migração `chat_mute`).
- Modify: `actions.ts` — `silenciarCanal`, `marcarTudoLido`.
- Modify: `notificar`/badge — respeitar `silenciado` (sem som/push; badge discreto).
- Modify: `chat-view.tsx` — menu do canal.

**Acceptance:**
- [x] Canal silenciado não toca som/push; "marcar tudo como lido" zera badges.
  → Migração `20260621131024_chat_canal_mute` (`CanalMembro.silenciado`); `silenciarCanal` e `marcarTudoLido` em `actions.ts`; badge e som respeitam `silenciado`; menu de contexto por canal na sidebar. (falta verif. manual)

---

## Onda C4 — Escala, histórico e busca  ✅

### C4-1 — Eliminar N+1 em `listarCanais`  (achado #30)

Hoje um `count` por canal. Trocar por um `groupBy` de não lidas.

**Files:**
- Modify: `src/modules/chat/queries.ts` — uma `mensagem.groupBy({ by:["canalId"], _count })` filtrando por `createdAt > lastReadAt` por canal (ou contagem agregada + ajuste em memória).

**Acceptance:**
- [x] Mesmos números de não lidas; nº de queries não cresce com o nº de canais.
  → Implementado com `naoLidasPorCanal(userId)` (1 raw `LEFT JOIN`+`GROUP BY`), reusado em
    `listarCanais` e `contarNaoLidasTotal`. Verificado contra o DB: 8 usuários, 138 pares user×canal, 0 divergências.

### C4-2 — Reduzir escrita/leitura de recibos  (achados #31, #32)

`marcarLido` cria até 200 linhas a cada abertura **e** a cada mensagem ao vivo; `mensagensCanal`
carrega `leituras` de 100 mensagens (O(100·N) em `#geral`).

**Files:**
- Modify: `src/modules/chat/actions.ts` — `marcarLido` só insere recibos de mensagens após `lastReadAt`; debounce no cliente para o caso "mensagem ao vivo com canal aberto".
- Modify: `src/modules/chat/queries.ts` — carregar recibos **sob demanda** (só para mensagens do próprio autor, ou via endpoint leve ao passar o mouse), não para todas.
- Modify: `chat-view.tsx` — não re-disparar `marcarLido` a cada mensagem; agrupar.

**Acceptance:**
- [x] Abrir `#geral` não gera centenas de inserts; recibos continuam corretos.
  → `marcarCanalLido` (helper compartilhado por `marcarLido`/`marcarTudoLido`) só insere recibos
    das mensagens **após o `lastReadAt` anterior**. `mensagensCanal` carrega `leituras` só das
    mensagens do próprio autor (segunda query enxuta). Cliente faz debounce de 1,2s para rajadas ao
    vivo, com flush ao trocar de canal/desmontar. (falta verif. manual com 2 usuários)

### C4-3 — Histórico paginado (scroll infinito)  (achado #25)

`mensagensCanal` trava nas últimas 100.

**Files:**
- Modify: `queries.ts`/rota — paginação por cursor (`createdAt`/`id`), `take` configurável.
- Modify: `chat-view.tsx` — "carregar mais" ao rolar para o topo, preservando posição.

**Acceptance:**
- [x] Rolar para cima carrega mensagens antigas sem pulo de scroll.
  → `mensagensCanal(canalId, userId, { limite, antesDe })` pagina por cursor com `orderBy
    [{createdAt desc},{id desc}]` (ordem total estável — sem pulo/duplicata nas fronteiras),
    `take: limite+1` como sentinela de `temMais`. Rota lê `?antes=<id>`. Cliente: `useLayoutEffect`
    preserva a posição compensando o crescimento do conteúdo; carga ao chegar a <80px do topo.
    Verificado contra o DB: paginação reconstrói o histórico (ordem e cobertura idênticas, sem duplicatas).

### C4-4 — Busca de mensagens e canais  (achado #24)

**Files:**
- Create: `src/modules/chat/busca.ts` (queries) — busca por `conteudo` (ILIKE/full-text PT) restrita aos canais do usuário; busca de canais por nome/código de projeto.
- Modify: `chat-view.tsx` — campo de busca (canais) + painel de resultados (mensagens) com deep-link ao canal/mensagem.

**Acceptance:**
- [x] Buscar termo lista resultados só de canais que o usuário participa; clicar abre no contexto.
  → `buscarMensagens(userId, termo)` (`busca.ts`) com `contains`/`insensitive` restrito a
    `canal.membros.some({ userId })`, mín. 2 caracteres. Rota GET `/api/chat/busca?q=`. Cliente:
    campo de busca na sidebar (filtra canais por nome/código no cliente + painel de mensagens com
    debounce 350ms); clicar abre o canal e rola/realça a mensagem-alvo se estiver na janela.
    Verificado contra o DB: 14 resultados em 8 usuários, 0 fora de escopo; guarda de mín. de caracteres OK.

---

## Onda C5 — Extras  ✅

### C5-1 — Indicador "está digitando…"  (achado #22)

**Files:**
- Modify: `src/lib/socket.ts` — relay efêmero `digitando` para o room do canal (sem persistir).
- Modify: `chat-client.ts`/`chat-view.tsx` — emitir com throttle ao digitar; exibir "Fulano está digitando…".

**Acceptance:**
- [x] Indicador aparece/some com timeout; não persiste nada no banco.
  → `socket.ts` faz relay efêmero do evento `digitando` para o room do canal (excluindo o emissor).
    Cliente emite `digitando:true` na 1ª tecla (throttle, re-arm a cada tecla); emite `false` 3s após
    parar ou ao enviar/trocar de canal/desmontar. Receptor exibe "X está digitando…" com auto-expire
    de 5s (proteção contra evento `false` perdido). Nenhuma escrita no banco. (falta verif. manual)

### C5-2 — Grupos ad-hoc  (achado #23)

**Schema:** novo `TipoCanal.grupo` + `Canal.criadoPorId`.

**Files:**
- Modify: `prisma/schema.prisma` (enum + campo; migração `chat_grupo`).
- Modify: `service.ts`/`actions.ts` — `criarGrupo(nome, membros)` (**audita**), adicionar/remover membro, renomear.
- Modify: `chat-view.tsx` — fluxo de criação e gestão de membros.

**Acceptance:**
- [x] Criar grupo com N membros; todos entram no room ao vivo (reusa C3-2).
  → Schema: `TipoCanal.grupo`, `Canal.criadoPorId`, migração `20260621142951_chat_grupo`. Queries: batch
    para `grupoMembros` (sem N+1). Actions: `criarGrupo` (audita), `adicionarMembroGrupo`, `removerMembroGrupo`,
    `renomearGrupo`. UI: seção "Grupos" na sidebar + `CriarGrupoDialog` + `GerenciarGrupoDialog`; sockets
    `sair-canal` e `grupo-renomeado` atualizados ao vivo. (falta verif. manual)

### C5-3 — Limpeza de anexos órfãos  (achado #17)

**Files:**
- Modify: `excluirMensagem` (C2-1) e exclusão de canal — remover arquivo via `lib/storage`.
- Optional: job pg-boss varrendo `chat/<canalId>` sem `Mensagem` correspondente (`lib/jobs.ts`/`jobs-handlers.ts`).

**Acceptance:**
- [x] Excluir mensagem com anexo remove o arquivo do disco.
  → `excluirMensagem` em `actions.ts` chama `removerArquivo(msg.anexoPath)` após o soft-delete (best-effort
    via `void`). Job pg-boss de varredura não implementado (opcional — o hook direto cobre o caso principal).

### C5-4 — Coerência de limites/tipos de upload  (achado #18)

Chat limita 15 MB sem validar tipo; padronizar com a política de uploads da plataforma.

**Files:**
- Modify: `src/app/api/chat/anexo/route.ts` — validar extensão/MIME permitidos; alinhar limite; mensagens de erro pt-BR.

**Acceptance:**
- [x] Upload de tipo não permitido é rejeitado com mensagem clara.
  → `src/app/api/chat/anexo/route.ts`: allowlist de extensões (imagens, PDF, Office, CAD/BIM, compactados,
    mídia); erro pt-BR com extensão rejeitada incluída na mensagem; erro de tamanho também em pt-BR.

### C5-5 — Acessibilidade  (achado #29)

**Files:**
- Modify: `chat-view.tsx` — popups de emoji/menção navegáveis por teclado (setas/Enter/Esc); `aria-live="polite"` na lista de mensagens; foco gerenciado ao abrir/fechar.

**Acceptance:**
- [x] Operável só por teclado; leitor de tela anuncia novas mensagens.
  → `chat-view.tsx`: `aria-live="polite" aria-relevant="additions"` na lista de mensagens; popup de menção
    com `role="listbox"` + `role="option"` + `aria-selected`; ArrowUp/ArrowDown/Enter/Escape para navegar e
    selecionar menção via teclado; Escape também fecha emoji picker.

---

## Verificação por onda (rodar sempre)

- [x] `npx tsc --noEmit` limpo — ✓ (C0–C5 completos)
- [x] `npm run lint` limpo — ✓ (0 erros, 0 avisos)
- [x] `npm test` (vitest) — novos testes puros passam — ✓ 371 testes, 47 arquivos
- [ ] **Manual sob `npm run dev:server` (socket/realtime): 2 navegadores/usuários** ← PENDENTE (ver abaixo)
- [x] Atualizar a tabela de **status** no topo e marcar checkboxes — ✓
- [ ] Commit semântico pt-BR por onda — pendente (não feito ainda)

### Checklist de verificação manual (fazer com 2 usuários simultâneos)

> Rodar `npm run dev:server`. Abrir 2 abas logadas como usuários distintos (ex.: admin + outro).

**C1 — Notificações:**
- [ ] Usuário B em `/dashboard` (fora do chat), A envia DM → B recebe toast + som + badge no menu "Chat"
- [ ] Usuário offline (fechar aba) → recebe push VAPID no browser
- [ ] Status "reunião" → B não recebe som/push de A; badge e sino continuam acumulando
- [ ] Sino de notificações registra DM e menção com link correto

**C2 — Recursos de mensagem:**
- [ ] Editar própria mensagem → atualiza ao vivo para o outro usuário com "(editada)"
- [ ] Excluir mensagem → placeholder "mensagem removida" para os dois
- [ ] Reagir com emoji → contagem/tooltip atualiza ao vivo; desreagir remove
- [ ] Fixar/desafixar → painel "Fixadas" reflete ao vivo
- [ ] `@mencao` com acento (ex: `@José`) → autocomplete funciona; mencionado recebe sino
- [ ] Mensagem multilinha (Shift+Enter) → renderiza com quebras
- [ ] Responder mensagem → citação clicável rola até a original

**C3 — Presença:**
- [ ] Mudar status (disponível/ocupado/reunião) → StatusDot atualiza para o outro em tempo real
- [ ] Adicionar usuário B a um projeto → B recebe evento `entrar-canal-novo` e o canal aparece sem refresh
- [ ] Canal de projeto concluído aparece em "Arquivados" na sidebar
- [ ] Silenciar canal → sem som ao receber mensagem; "Marcar tudo como lido" zera badge
- [ ] Link "Projeto" no header do canal e botão "Abrir chat" na página do projeto navegam corretamente

**C4 — Escala:**
- [ ] Abrir `#geral` não gera centenas de INSERTs em `mensagem_leitura` (verificar logs do pg)
- [ ] ✓✓ persiste após F5 quando o outro usuário abriu o canal
- [ ] Rolar até o topo carrega mensagens antigas sem pulo de scroll
- [ ] Busca retorna apenas mensagens de canais que o usuário participa

**C5 — Extras:**
- [ ] Indicador "está digitando…" aparece/some com timeout; não persiste no banco
- [ ] Criar grupo com 2+ membros → todos entram no room ao vivo
- [ ] Adicionar/remover membro de grupo → reflete ao vivo (via `entrar-canal-novo`/`sair-canal`)
- [ ] Renomear grupo → nome atualiza ao vivo para todos os membros
- [ ] Upload de `.exe` ou tipo não listado → rejeitado com mensagem clara em pt-BR
- [ ] Upload acima de 15 MB → rejeitado com mensagem clara
- [ ] Excluir mensagem com anexo → arquivo removido do disco (`STORAGE_BASE_PATH/chat/…`)
- [ ] Popup de menção: ArrowUp/Down navega; Enter insere; Esc fecha
- [ ] Leitor de tela (NVDA/VoiceOver) anuncia novas mensagens automaticamente

## Notas de decisão (preencher ao executar)

- Migrações criadas: `20260621_chat_c2` (2026-06-21) — excluidaEm + respostaAId + MensagemReacao em uma só migration
- C2: `agregarReacoes` exportada de `queries.ts` (importada tanto pela rota quanto por `actions.ts`)
- C2: `meRole` adicionado como prop de `ChatView` (default "administrativo") — passa `user.role` da page
- C2-5: textarea auto-resize com `max-height: 120px`; Enter envia, Shift+Enter insere quebra
- C2-3: painel fixadas carregado na rota principal (junto com mensagens) em vez de endpoint separado
- C2-4: menção → notifica offline com título "Você foi mencionado"; online → só sino (sem push, socket já cuida)
- C1/C2: verif. manual pendente para ambas as ondas (badge, toast, editar/excluir, reações, reply, fixar)

## Referências de arquivos (mapa rápido)

**Server:**
- `src/modules/chat/{service,actions,queries,busca,mencoes,roles}.ts`
- `src/lib/socket.ts` · `src/lib/notificar.ts` · `src/lib/storage.ts` (removerArquivo)

**Client:**
- `src/components/chat/{chat-view,floating-chat,chat-presence-provider,chat-badge}.tsx`
- `src/lib/{chat-client,chat-badge-store}.ts`

**Rotas REST** (apenas multipart/streaming — o resto é Server Action):
- `src/app/api/chat/{bootstrap,anexo,busca,estado,canais/[canalId]/mensagens}/route.ts`

**Páginas e nav:**
- `src/app/(dashboard)/chat/page.tsx`
- `src/app/(dashboard)/layout.tsx` (monta `ChatPresenceProvider`)
- `src/components/shell/{sidebar-nav,bottom-nav}.tsx` (badge chat)
- `src/app/(dashboard)/projetos/[id]/page.tsx` (botão "Abrir chat")

**Schema** (`prisma/schema.prisma`):
- Models: `Canal`, `CanalMembro`, `Mensagem`, `MensagemLeitura`, `MensagemReacao`
- Enums: `TipoCanal` (geral, projeto, disciplina, dm, grupo), `ChatStatus`
- Campos notáveis: `Mensagem.excluidaEm`, `Mensagem.respostaAId`, `CanalMembro.silenciado`,
  `Canal.criadoPorId`

**Migrações criadas:**
- `20260621125258_chat_c2` — excluidaEm + respostaAId + MensagemReacao
- `20260621131024_chat_canal_mute` — CanalMembro.silenciado
- `20260621142951_chat_grupo` — TipoCanal.grupo + Canal.criadoPorId

**Testes:**
- `src/modules/chat/mencoes.test.ts` (C0-4)
- `src/lib/chat-badge-store.test.ts` (C1-2)

**Preferências:** `src/modules/usuarios/preferencias/queries.ts` (`somChat`, `mostrarRecibos`)
</content>
</invoke>
