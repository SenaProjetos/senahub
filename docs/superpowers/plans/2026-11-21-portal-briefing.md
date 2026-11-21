# Briefing no portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A equipe pede o briefing ao cliente pelo portal; o cliente preenche dentro do portal; encerrar trava portal e link.

**Architecture:** Estado do pedido em colunas novas de `BriefingProjeto`; uma função pura decide quem grava (equipe, link,
portal) e o serviço a consulta com a linha travada dentro da MESMA transação que grava. O portal reaproveita `BriefingForm`
e um formulário de perguntas extras genérico, salvando por Server Actions; o link continua nas rotas de token.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Prisma 7 / PostgreSQL 17, Vitest (node), tsx smokes.

**Spec:** `docs/superpowers/specs/2026-11-21-portal-briefing-design.md`

## Global Constraints

- Toda gravação do briefing passa por `gravarRespostasBriefing` (`src/modules/inputs/briefing-service.ts`); perguntas extras só em pergunta ATIVA do projeto (`removidoEm: null`).
- Leituras do formulário: `resolverModeloDoProjeto` + `secoesDoProjeto` + `respostasVisiveis` (+ `prePopularRespostas`), como `src/app/p/inputs/[token]/page.tsx`. Nunca importar `BRIEFING_SCHEMA` direto num leitor.
- Portal grava por Server Action (sem rota REST nova). Ações do cliente: `defineAction` sem `recurso`/`permissao`; o serviço confere `user.tipo === "externo"` e `acessoDoUsuarioAoProjetoDoPortal(user, projetoId)`.
- Ações da equipe: `recurso: "projetos", permissao: "gerir"` + `exigirProjetoVisivel(user, projetoId)`.
- Mudança de estado do pedido = `updateMany` condicionado ao estado lido; e-mail/sino só quando `count === 1`.
- Dentro de `$transaction`: nada de `Promise.all` com `tx` (guarda `lib/promise-all-em-transacao.test.ts`).
- Encerrado: nem portal nem link gravam; equipe (`salvarBriefing`, `responderInputs`) grava sempre. Projeto sem pedido pelo portal: link igual a hoje.
- Frases fixas (servidor = tela): `"A equipe encerrou o preenchimento deste formulário."`, `"A equipe ainda não pediu este formulário pelo portal."`, `"O projeto não tem cliente."`, `"O cliente está inativo."`, `"O cliente não tem conta ativa no portal. Use o link."`, `"Não há nada para o cliente preencher neste projeto."`, `"Já foi pedido."`, `"O pedido não está aberto."`.
- Conta ativa do cliente = `User { tipo: "externo", ativo: true, clienteId: projeto.clienteId }`. Sem categoria de notificação no pedido ao cliente.
- E-mail ao cliente: slug `portal-briefing-pedido`, grupo `"Projetos"`, editável em Configurações → E-mails; sem SMTP só o sino; falha de e-mail não desfaz o pedido.
- Migração por `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` + arquivo em `prisma/migrations/<ts>_<nome>/migration.sql` + `npx prisma migrate deploy` + `npm run db:generate`. Nada de `migrate dev` nem `prisma format`.
- UI e textos pt-BR; página nova abre com `CabecalhoPagina`; 390×844 sem rolagem lateral.
- Vitest só pelo PowerShell (`npx vitest run <arquivo>`); Git Bash quebra o vitest.
- Arquivos com mudanças do dono sem commit (`CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `src/app/(dashboard)/layout.tsx`, `src/lib/permissao-efetiva*.ts`, `src/lib/permissions.ts`, `src/lib/session.ts`, `src/lib/so-interno*.ts`): nunca `git add` nesses arquivos; trecho deste trabalho só por `git update-index --cacheinfo 100644,$(git hash-object -w <arquivo-temporário-com-só-o-trecho>),<caminho>`. Nunca `git add -A`/`.`.
- Commits semânticos em pt-BR terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Encerramento simultâneo a um salvamento (link ou portal): a gravação que chega depois do encerrar é recusada, nunca entra — pin: smoke Task 6 ("salvar depois de encerrar recusa" e regra lida com a linha travada, Task 2).
2. Cliente com duas contas, uma de outro cliente com o mesmo `projetoId` na URL, ou cliente inativo chamando a Server Action direto: recusa sem gravar — pin: smoke Task 6 (escopo).
3. Campo oculto pela equipe ou seção de disciplina que o projeto não tem: não aparece na página do portal nem volta na resposta da action — pin: smoke Task 6 ("campo oculto não sai").
4. Dois cliques em "Pedir" (ou Pedir + Reabrir quase juntos): um e-mail por conta, não dois — pin: smoke Task 6 ("dois pedidos = um aviso").
5. Pergunta extra removida pela equipe enquanto o cliente responde no portal: não grava e a tela diz quantas ficaram de fora, como o link — pin: teste do serviço de extras na Task 2 (smoke) e mensagem na Task 5.

---

### Task 1: Regras puras do pedido no portal

**Files:**
- Create: `src/modules/inputs/portal-pedido.ts`
- Test: `src/modules/inputs/portal-pedido.test.ts`

**Interfaces:**
- Produces:
  - `type SituacaoPortalBriefing = "nao_pedido" | "aberto" | "encerrado"`
  - `type CanalBriefing = "equipe" | "link" | "portal"`
  - `situacaoPortal(b: { portalPedidoEm: Date | null; portalEncerradoEm: Date | null } | null): SituacaoPortalBriefing` — `null` ou `portalPedidoEm` nulo = `nao_pedido`; `portalEncerradoEm` preenchido = `encerrado`; senão `aberto`.
  - `motivoParaNaoGravar(situacao: SituacaoPortalBriefing, canal: CanalBriefing): string | null` — equipe sempre `null`; link: `encerrado` → `MOTIVO_ENCERRADO`; portal: `nao_pedido` → `MOTIVO_NAO_PEDIDO`, `encerrado` → `MOTIVO_ENCERRADO`.
  - `motivoParaNaoPedir(e: { temCliente: boolean; clienteAtivo: boolean; contasAtivas: number; temAlgoAPreencher: boolean; situacao: SituacaoPortalBriefing }): string | null` — ordem: sem cliente, inativo, já aberto (`MOTIVO_JA_PEDIDO`), sem conta, nada a preencher.
  - `motivoParaNaoEncerrar(situacao: SituacaoPortalBriefing): string | null` — só `aberto` passa.
  - `textoPedidoBriefing(p: { projetoNome: string; projetoCodigo: string; reaberto: boolean }): { titulo: string; corpo: string }`
  - `textoPreenchimento(p: { motivo: "parcial" | "completo"; canal: "link" | "portal"; projetoNome: string; codigo: string }): { titulo: string; corpo: string }`
  - Constantes exportadas: `MOTIVO_ENCERRADO`, `MOTIVO_NAO_PEDIDO`, `MOTIVO_SEM_CLIENTE`, `MOTIVO_CLIENTE_INATIVO`, `MOTIVO_SEM_CONTA_PORTAL`, `MOTIVO_NADA_A_PREENCHER`, `MOTIVO_JA_PEDIDO`, `MOTIVO_PEDIDO_NAO_ABERTO` (frases das Global Constraints, na ordem listada lá).

- [ ] **Step 1: Write the failing tests** (`portal-pedido.test.ts`)

```ts
describe("situacaoPortal", () => {
  it("sem linha ou sem pedido = nao_pedido", () => {
    expect(situacaoPortal(null)).toBe("nao_pedido");
    expect(situacaoPortal({ portalPedidoEm: null, portalEncerradoEm: null })).toBe("nao_pedido");
  });
  it("pedido aberto e encerrado", () => {
    const d = new Date("2026-11-21T12:00:00Z");
    expect(situacaoPortal({ portalPedidoEm: d, portalEncerradoEm: null })).toBe("aberto");
    expect(situacaoPortal({ portalPedidoEm: d, portalEncerradoEm: d })).toBe("encerrado");
  });
});
describe("motivoParaNaoGravar", () => {
  it("equipe grava sempre", () => {
    for (const s of ["nao_pedido", "aberto", "encerrado"] as const) expect(motivoParaNaoGravar(s, "equipe")).toBeNull();
  });
  it("link: só o encerrado recusa (sem pedido = como hoje)", () => {
    expect(motivoParaNaoGravar("nao_pedido", "link")).toBeNull();
    expect(motivoParaNaoGravar("aberto", "link")).toBeNull();
    expect(motivoParaNaoGravar("encerrado", "link")).toBe("A equipe encerrou o preenchimento deste formulário.");
  });
  it("portal: só o aberto grava", () => {
    expect(motivoParaNaoGravar("nao_pedido", "portal")).toBe("A equipe ainda não pediu este formulário pelo portal.");
    expect(motivoParaNaoGravar("aberto", "portal")).toBeNull();
    expect(motivoParaNaoGravar("encerrado", "portal")).toBe(MOTIVO_ENCERRADO);
  });
});
describe("motivoParaNaoPedir", () => {
  const ok = { temCliente: true, clienteAtivo: true, contasAtivas: 2, temAlgoAPreencher: true, situacao: "nao_pedido" as const };
  it("pode pedir e reabrir", () => {
    expect(motivoParaNaoPedir(ok)).toBeNull();
    expect(motivoParaNaoPedir({ ...ok, situacao: "encerrado" })).toBeNull();
  });
  it("cada recusa com a sua frase, na ordem", () => {
    expect(motivoParaNaoPedir({ ...ok, temCliente: false, clienteAtivo: false })).toBe("O projeto não tem cliente.");
    expect(motivoParaNaoPedir({ ...ok, clienteAtivo: false, contasAtivas: 0 })).toBe("O cliente está inativo.");
    expect(motivoParaNaoPedir({ ...ok, situacao: "aberto", contasAtivas: 0 })).toBe("Já foi pedido.");
    expect(motivoParaNaoPedir({ ...ok, contasAtivas: 0 })).toBe("O cliente não tem conta ativa no portal. Use o link.");
    expect(motivoParaNaoPedir({ ...ok, temAlgoAPreencher: false })).toBe("Não há nada para o cliente preencher neste projeto.");
  });
});
describe("motivoParaNaoEncerrar", () => {
  it("só o aberto encerra", () => {
    expect(motivoParaNaoEncerrar("aberto")).toBeNull();
    expect(motivoParaNaoEncerrar("encerrado")).toBe("O pedido não está aberto.");
    expect(motivoParaNaoEncerrar("nao_pedido")).toBe(MOTIVO_PEDIDO_NAO_ABERTO);
  });
});
describe("textos", () => {
  it("pedido e reabertura ao cliente", () => {
    expect(textoPedidoBriefing({ projetoNome: "Villa Verde", projetoCodigo: "260507", reaberto: false })).toEqual({
      titulo: "A equipe pediu o briefing do projeto",
      corpo: "260507 — Villa Verde: preencha as informações para iniciarmos os projetos.",
    });
    expect(textoPedidoBriefing({ projetoNome: "Villa Verde", projetoCodigo: "260507", reaberto: true }).titulo).toBe(
      "A equipe reabriu o briefing do projeto",
    );
  });
  it("aviso à equipe diz o canal", () => {
    expect(textoPreenchimento({ motivo: "completo", canal: "portal", projetoNome: "Villa Verde", codigo: "260507" })).toEqual({
      titulo: "Formulário do cliente concluído",
      corpo: "Villa Verde (260507) — briefing completo pelo portal.",
    });
    expect(textoPreenchimento({ motivo: "parcial", canal: "link", projetoNome: "Villa Verde", codigo: "260507" }).corpo).toBe(
      "Villa Verde (260507) — novas respostas pelo link público.",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/modules/inputs/portal-pedido.test.ts` (PowerShell). Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/modules/inputs/portal-pedido.ts`** — pure (no Prisma, no `server-only`); titles of `textoPreenchimento`: `"Formulário do cliente concluído"` / `"Cliente preencheu o formulário"` (os de hoje em `notificar-preenchimento.ts`).
- [ ] **Step 4: Run to verify it passes** — same command. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/modules/inputs/portal-pedido.ts src/modules/inputs/portal-pedido.test.ts` + `git commit -m "feat(inputs): regras do pedido do briefing pelo portal"`.

---

### Task 2: Colunas, trava única de aviso e gravação com a regra do canal

**Files:**
- Modify: `prisma/schema.prisma` (model `BriefingProjeto`, ~linha 1410)
- Create: `prisma/migrations/20261121090000_briefing_portal/migration.sql`
- Create: `src/modules/inputs/inputs-padrao-service.ts` (recebe `aplicarInputsPadraoCore` movida de `actions.ts:49`)
- Create: `src/modules/inputs/extras-service.ts`
- Modify: `src/modules/inputs/briefing-service.ts`, `src/modules/inputs/notificar-preenchimento.ts`, `src/modules/inputs/actions.ts` (importa as duas funções movidas/novas; `responderInputs` passa a usar `gravarRespostasExtras` com canal `equipe`)
- Modify: `src/app/api/p/inputs/[token]/route.ts`, `src/app/api/p/inputs/[token]/briefing/route.ts`
- Test: `src/modules/inputs/portal-pedido.test.ts` (sem mudança) + smoke da Task 6

**Interfaces:**
- Consumes: Task 1 (`situacaoPortal`, `motivoParaNaoGravar`, `CanalBriefing`, `textoPreenchimento`).
- Produces:
  - Colunas em `BriefingProjeto`: `portalPedidoEm DateTime?`, `portalPedidoPorId String?`, `portalEncerradoEm DateTime?`, `portalEncerradoPorId String?`, `avisoEquipeEm DateTime?` (doc `///` em pt-BR em cada uma; `LinkPublicoInput.notificadoEm` fica no schema com `/// Obsoleto: a trava agora é BriefingProjeto.avisoEquipeEm`).
  - `travarBriefingNoTx(tx: Prisma.TransactionClient, projetoId: string): Promise<{ situacao: SituacaoPortalBriefing }>` em `briefing-service.ts` — `createMany skipDuplicates` + `SELECT … FOR UPDATE` + leitura das colunas do portal. Exportada.
  - `gravarRespostasBriefing(projetoId: string, enviadas: Record<string, unknown>, preenchidoPor: string, canal: CanalBriefing = "equipe")` — mesmo `Resultado`; com `motivoParaNaoGravar(...)` não nulo devolve `{ ok: false, erro: motivo, campos: {} }` sem gravar.
  - `gravarRespostasExtras(projetoId: string, respostas: { id: string; resposta: string }[], canal: CanalBriefing): Promise<{ ok: true; salvas: number; ignoradas: number } | { ok: false; erro: string }>` em `extras-service.ts` — uma transação: `travarBriefingNoTx`, regra do canal, `updateMany({ where: { id, projetoId, removidoEm: null }, data: { resposta: r.resposta || null } })` um por um.
  - `aplicarInputsPadraoCore(projetoId: string): Promise<number>` exportada de `inputs-padrao-service.ts` (corpo inalterado).
  - `notificarPreenchimentoInput(projetoId: string, motivo: "parcial" | "completo", canal: "link" | "portal" = "link"): Promise<void>` — trava em `BriefingProjeto.avisoEquipeEm` (linha garantida por `createMany skipDuplicates`), texto por `textoPreenchimento`; resto igual (janela 6 h, `forcar` no completo, nunca lança).

- [ ] **Step 1: Schema + migração.** Adicionar as colunas; gerar o SQL com `migrate diff` e acrescentar no mesmo `migration.sql` a cópia da trava:

```sql
INSERT INTO "briefing_projeto" ("id", "projetoId", "avisoEquipeEm", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, l."projetoId", l."notificadoEm", now(), now()
FROM "link_publico_input" l WHERE l."notificadoEm" IS NOT NULL
ON CONFLICT ("projetoId") DO UPDATE SET "avisoEquipeEm" = EXCLUDED."avisoEquipeEm";
```

  Run: `npx prisma migrate deploy` e `npm run db:generate`. Expected: migração aplicada, client gerado.
- [ ] **Step 2: Mover `aplicarInputsPadraoCore`** para `inputs-padrao-service.ts` (`import "server-only"`), importar em `actions.ts`. Nenhuma mudança de comportamento.
- [ ] **Step 3: Implementar `travarBriefingNoTx`, o parâmetro `canal` de `gravarRespostasBriefing` e `gravarRespostasExtras`**; a regra é lida DEPOIS do `FOR UPDATE`, dentro da transação que grava. `responderInputs` passa a chamar `gravarRespostasExtras(..., "equipe")` mantendo o retorno `{ projetoId, salvas, ignoradas }`.
- [ ] **Step 4: Rotas do link.** `/briefing` chama `gravarRespostasBriefing(projeto.id, …, "Cliente (link público)", "link")`; recusa por regra → status 409 com `{ error }`. `/api/p/inputs/[token]` PUT usa `gravarRespostasExtras(projeto.id, validas, "link")` (409 na recusa) e só notifica com `salvas > 0`. Ambas passam `canal: "link"` ao `notificarPreenchimentoInput`.
- [ ] **Step 5: Trava de aviso em `notificar-preenchimento.ts`** conforme Interfaces.
- [ ] **Step 6: Verify** — `npx vitest run src/modules/inputs` (PowerShell) Expected: PASS; `npm run lint` Expected: 0 erros; `$env:NODE_OPTIONS='--max-old-space-size=8192'; npx tsc --noEmit -p tsconfig.json` Expected: sem erro novo; `npx vitest run src/lib/promise-all-em-transacao.test.ts` Expected: PASS.
- [ ] **Step 7: Commit** — schema, migração, os arquivos de `src/modules/inputs/` e as duas rotas: `git commit -m "feat(inputs): pedido do portal no briefing, regra do canal na gravação e trava de aviso por projeto"`.

---

### Task 3: Pedir, encerrar e o e-mail ao cliente (serviço + ações da equipe)

**Files:**
- Create: `src/modules/inputs/portal-pedido-service.ts`
- Modify: `src/modules/inputs/actions.ts` (ações novas), `src/modules/inputs/queries.ts` (leitura para a tela), `src/lib/email-templates-meta.ts` (modelo novo)

**Interfaces:**
- Consumes: Task 1 (motivos, `textoPedidoBriefing`, `situacaoPortal`), Task 2 (colunas, `aplicarInputsPadraoCore`).
- Produces:
  - `type AvisarPedido = { notificar: (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>; enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null }`
  - `pedirBriefingNoPortal(projetoId: string, porId: string, deps?: AvisarPedido): Promise<{ ok: true; reaberto: boolean; avisadas: number; emails: number } | { ok: false; erro: string }>` — lê projeto/cliente/contas; roda `aplicarInputsPadraoCore`; `temAlgoAPreencher` = seções visíveis (`secoesDoProjeto` do modelo resolvido) > 0 OU pergunta extra ativa > 0; `motivoParaNaoPedir`; `updateMany` condicionado (`portalPedidoEm: null` OU `portalEncerradoEm: { not: null }`) gravando `portalPedidoEm=now`, `portalPedidoPorId`, limpando o encerramento; `count === 0` → `MOTIVO_JA_PEDIDO`; depois do commit, sino + e-mail a cada conta ativa (`href = /portal/<projetoId>/briefing`, vars `nome` = primeiro nome, `projeto`, `url` = `APP_URL` + href). Padrão de `deps` igual a `avisarResposta` (`src/modules/portal/pedido-revisao/service.ts:815`).
  - `encerrarBriefingNoPortal(projetoId: string, porId: string): Promise<{ ok: true } | { ok: false; erro: string }>` — `updateMany` em `{ portalPedidoEm: { not: null }, portalEncerradoEm: null }`; `count === 0` → `MOTIVO_PEDIDO_NAO_ABERTO`.
  - `resumoPortalBriefing(projetoId: string): Promise<{ situacao: SituacaoPortalBriefing; pedidoEm: Date | null; pedidoPor: string | null; encerradoEm: Date | null; encerradoPor: string | null; contasAtivas: number; motivoPedir: string | null; motivoEncerrar: string | null }>` em `queries.ts` (nomes por `user.findMany` dos dois ids).
  - Ações em `actions.ts`: `pedirBriefingPortal` e `encerrarBriefingPortal`, schema `z.object({ projetoId: z.string().min(1) })`, `modulo: "projetos"`, `acao: "pedir-briefing-portal" | "encerrar-briefing-portal"`, `entidade: "BriefingProjeto"`, `capturarAntes` = linha do briefing; recusa → `ActionError(erro)`; `revalidatePath("/projetos/<id>/inputs")`.
  - Modelo de e-mail `slug: "portal-briefing-pedido"`, `grupo: "Projetos"`, `label: "Pedido do briefing pelo portal (cliente)"`, variáveis `nome`, `projeto`, `url`, `assuntoPadrao: "A equipe pediu o briefing do projeto {{projeto}}"`, corpo no tom do `pedido-revisao-respondido` com botão `[Preencher no portal]({{url}})` e a frase de que não há opção de desligar na `descricao`.

- [ ] **Step 1: Write failing test for the template meta** — em `src/lib/email-templates-meta.test.ts` (criar se não existir): `it("modelo do pedido do briefing existe com as variáveis do serviço")` conferindo o slug `portal-briefing-pedido` e as variáveis `["nome","projeto","url"]`.
- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/email-templates-meta.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** meta, serviço, leitura e ações conforme Interfaces.
- [ ] **Step 4: Verify** — `npx vitest run src/lib/email-templates-meta.test.ts src/modules/inputs` Expected: PASS; lint + tsc como na Task 2.
- [ ] **Step 5: Commit** — `git commit -m "feat(inputs): pedir e encerrar o briefing pelo portal, com e-mail ao cliente"`.

---

### Task 4: Telas da equipe e do link

**Files:**
- Create: `src/components/inputs/portal-briefing-card.tsx` (client)
- Create: `src/components/inputs/perguntas-extras-form.tsx` (client, genérico)
- Modify: `src/app/(dashboard)/projetos/[id]/inputs/page.tsx`, `src/components/inputs/inputs-public-form.tsx`, `src/components/inputs/briefing-public.tsx`, `src/app/p/inputs/[token]/page.tsx`

**Interfaces:**
- Consumes: Task 3 (`resumoPortalBriefing`, `pedirBriefingPortal`, `encerrarBriefingPortal`), Task 2 (`situacaoPortal`), Task 1 (`MOTIVO_ENCERRADO`).
- Produces:
  - `PerguntasExtrasForm({ itens, salvar, somenteLeitura }: { itens: { id: string; disciplina: string | null; pergunta: string; resposta: string }[]; salvar: (id: string, resposta: string) => Promise<{ ok: true; ignoradas: number } | { ok: false; erro: string }>; somenteLeitura?: boolean })` — o corpo de hoje do `InputsPublicForm` (grupos por disciplina, salvar no blur, "Salvo"); `ignoradas > 0` → toast `"Esta pergunta foi removida pela equipe e não foi salva."`; recusa → toast com `erro`.
  - `InputsPublicForm({ token, itens, somenteLeitura })` vira invólucro de `PerguntasExtrasForm` com o `fetch` atual (409/400 → `error` do corpo).
  - `BriefingPublico` ganha `somenteLeitura?: boolean` → `BriefingForm canEdit={!somenteLeitura}`; 409 devolve o `error` do corpo.
  - `PortalBriefingCard({ projetoId, resumo })` — título "Portal do cliente"; linha de situação (`"Ainda não pedido."` / `"Pedido em dd/mm/aaaa por Fulano."` / `"Encerrado em dd/mm/aaaa por Fulano."`) + `"N conta(s) ativa(s) do cliente no portal."`; botões "Pedir ao cliente pelo portal" (ou "Reabrir" quando encerrado) e "Encerrar"; desabilitado → motivo visível na tela (texto abaixo do botão, não só tooltip); "Encerrar" com `await confirm()` antes do `startTransition`, texto do confirmar: `"O cliente não poderá mais responder, nem pelo portal nem pelo link. Você pode reabrir depois."`.
- Página da equipe: `PortalBriefingCard` primeiro (só para `podeGerir`); o card atual vira título `"Link para quem não tem conta no portal"`, logo abaixo; com situação `encerrado`, a descrição do link acrescenta `" Encerrado no portal: o link também não aceita respostas."`.
- Página do link: lê `situacaoPortal` da linha do briefing (incluir as colunas em `inputsPorToken`); `encerrado` → aviso no topo com `MOTIVO_ENCERRADO` e os dois formulários `somenteLeitura`.

- [ ] **Step 1: Implementar** os componentes e as duas páginas conforme Interfaces (sem regra nova: a decisão já está nas Tasks 1–3).
- [ ] **Step 2: Verify** — lint + tsc; `npx vitest run src/lib/campos/guarda-campos.test.ts src/components` Expected: PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(inputs): bloco Portal do cliente na aba Inputs e link só leitura quando encerrado"`.

---

### Task 5: Briefing no portal do cliente

**Files:**
- Create: `src/modules/portal/briefing-queries.ts`, `src/modules/portal/briefing-actions.ts`
- Create: `src/components/portal/briefing-card.tsx` (server), `src/components/portal/briefing-do-portal.tsx` (client)
- Create: `src/app/(dashboard)/portal/[projetoId]/briefing/page.tsx`
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx` (card logo depois do bloco de endereço/prazo, antes das Entregas)

**Interfaces:**
- Consumes: Task 2 (`gravarRespostasBriefing` com canal `portal`, `gravarRespostasExtras`, `notificarPreenchimentoInput` com canal `portal`), Task 1, Task 4 (`PerguntasExtrasForm`), `BriefingForm`, `acessoDoUsuarioAoProjetoDoPortal`.
- Produces:
  - `briefingDoPortal(projetoId: string): Promise<null | { situacao: "aberto" | "encerrado"; status: StatusBriefing; progresso: { preenchidos: number; total: number }; secoes: SecaoBriefing[]; respostas: Record<string, unknown>; extras: { id: string; disciplina: string | null; pergunta: string; resposta: string }[]; encerradoEm: Date | null }>` — `null` em `nao_pedido`; seções/respostas exatamente como `src/app/p/inputs/[token]/page.tsx` (modelo resolvido, ocultos, `respostasVisiveis(prePopularRespostas(...))`); status e progresso por `calcularStatusBriefing`/`progressoObrigatorios` sobre as seções visíveis. Quem chama já validou o projeto do cliente.
  - `salvarBriefingDoPortal` (schema `{ projetoId: string, respostas: z.record(z.string().max(64), z.unknown()).refine(≤500 chaves) }`) e `responderPerguntasDoPortal` (schema `{ projetoId, respostas: z.array({ id: z.string().max(64), resposta: z.string().max(LIMITE_TEXTO_RESPOSTA) }).max(200) }`), `modulo: "portal"`, `acao: "briefing-salvar" | "briefing-responder-extras"`, `entidade: "BriefingProjeto" | "InputProjeto"`. Ordem: `user.tipo !== "externo"` → `ActionError("Só o cliente responde pelo portal.")`; `acessoDoUsuarioAoProjetoDoPortal(user, projetoId)` não ok → `ActionError("Projeto não encontrado.")`; grava com `preenchidoPor = user.name`, canal `portal`; erro de formato → `ActionError(erro, campos)`; aviso à equipe como a rota do link (transição para completo fura a janela). Retornos: `{ status, descartados }` e `{ salvas, ignoradas }`.
  - `BriefingCard({ projetoId, resumo })` — só quando `briefingDoPortal` ≠ null: título "Briefing do projeto", badge do status (rótulos de `STATUS_LABEL` da equipe: "Não iniciado" / "Em preenchimento" / "Completo"), `"{preenchidos} de {total} obrigatórias respondidas"` (omitir quando `total === 0`), botão "Preencher" (aberto) ou "Ver respostas" + `"Encerrado pela equipe em dd/mm/aaaa."` (encerrado), link para `/portal/<id>/briefing`.
  - Página `/portal/[projetoId]/briefing`: mesmas guardas da página do modelo (`requireUser`, interno → `/`, cliente inativo → `/portal`, `projetoDoCliente` → `notFound`); `briefingDoPortal` null → `notFound`; `CabecalhoPagina` título `"Briefing do projeto"`, trilha Meus projetos › projeto › Briefing; encerrado → aviso `MOTIVO_ENCERRADO` no topo e formulários só leitura; senão `BriefingDoPortal` (client) com `BriefingForm` (`onSalvar` → `salvarBriefingDoPortal`, mapeando `fieldErrors` como `BriefingSection` faz) e `PerguntasExtrasForm` (`salvar` → `responderPerguntasDoPortal`).

- [ ] **Step 1: Implementar** queries, actions, card, página e componente client conforme Interfaces.
- [ ] **Step 2: Verify** — lint + tsc; `npx vitest run src/modules/portal src/modules/inputs` Expected: PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(portal): cliente preenche o briefing do projeto no portal"`.

---

### Task 6: Smoke, manual e CLAUDE.md

**Files:**
- Create: `scripts/smoke-portal-briefing.ts`
- Modify: `package.json` (script `"smoke:portal-briefing": "tsx --tsconfig tsconfig.server.json scripts/smoke-portal-briefing.ts"`, logo depois de `smoke:pedido-revisao-cliente`)
- Modify (staging parcial): `CLAUDE.md` (linha do smoke na lista de comandos, depois de `smoke:pedido-revisao-cliente`), `docs/manual/inicio/portal-cliente.md` (seção "Briefing do projeto")
- Modify: `docs/manual/projetos/projetos.md` (aba Inputs: bloco Portal do cliente, link secundário, encerrar), `docs/manual/novidades.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–5 (serviço chamado direto, `deps` falsos como em `scripts/smoke-portal-resumo.ts`; ações do cliente exercitadas pelo serviço + `acessoDoUsuarioAoProjetoDoPortal`).

- [ ] **Step 1: Escrever o smoke** — projeto/cliente/contas throwaway com tag `SMKBRIEFING_<ts>`, apaga tudo no fim. Checks (cada um um `check(nome, cond)`):
  1. pedir sem conta ativa recusa com `MOTIVO_SEM_CONTA_PORTAL`; com cliente inativo recusa com `MOTIVO_CLIENTE_INATIVO`;
  2. pedir com 2 contas ativas + 1 inativa + 1 de outro cliente: 2 sinos e 2 e-mails, slug `portal-briefing-pedido`, url termina em `/portal/<id>/briefing`;
  3. dois pedidos simultâneos (`Promise.all` fora de transação): um ok, um `MOTIVO_JA_PEDIDO`, ainda 2 e-mails no total;
  4. `gravarRespostasBriefing(…, "Fulano Cliente", "portal")` grava e `preenchidoPor === "Fulano Cliente"`;
  5. `acessoDoUsuarioAoProjetoDoPortal` da conta de outro cliente e da conta do cliente inativo → `ok: false`;
  6. campo oculto pela equipe (`camposOcultos`) com resposta gravada não aparece em `briefingDoPortal(...).respostas`;
  7. aviso à equipe: dois salvamentos parciais pelo portal = 1 aviso na janela; a passagem para completo avisa de novo;
  8. encerrar; salvar briefing pelo portal e pelo link recusa com `MOTIVO_ENCERRADO`; `gravarRespostasExtras(…, "link")` recusa; equipe (`"equipe"`) grava;
  9. reabrir: e-mail de novo (título "A equipe reabriu…"), link e portal voltam a gravar;
  10. projeto SEM pedido: link grava (como hoje) e portal recusa com `MOTIVO_NAO_PEDIDO`;
  11. pergunta extra removida: `gravarRespostasExtras` pelo portal devolve `ignoradas: 1`.
- [ ] **Step 2: Run** — `npm run smoke:portal-briefing`. Expected: todas as linhas `[OK]`, exit 0.
- [ ] **Step 3: Manual e CLAUDE.md** — texto curto em pt-BR; `CLAUDE.md` e `portal-cliente.md` só por staging parcial (Global Constraints).
- [ ] **Step 4: Verify** — `npm test` (PowerShell) Expected: todos passam.
- [ ] **Step 5: Commit** — `git commit -m "test(portal): smoke do briefing no portal e manual"` e conferir `git show --stat` (nenhum arquivo do dono inteiro).
