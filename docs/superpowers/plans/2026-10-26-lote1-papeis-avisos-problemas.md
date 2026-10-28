# Lote 1 — Papéis, Avisos no topo, Problemas por projeto — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar Analista e Gerente como papéis de membro, pôr um atalho de Avisos ao lado do sino e criar a aba "Problemas" em cada projeto (lista de apontamentos por disciplina, com resposta e mudança de estado).

**Architecture:** Três mudanças independentes. Papéis: duas chaves novas numa lista pura. Avisos: regra pura de "aviso recente não visto" + action de leitura + ícone no `Header`. Problemas: nova aba sobre as `Pendencia` e actions que já existem; regras novas ficam em arquivos puros testados (`problemas.ts`, `acoes-problema.ts`), a leitura em `problemasDoProjeto`, a tela em dois componentes client. Nenhuma tabela nova, nenhuma migração.

**Tech Stack:** Next.js 15 / React 19, Server Actions via `defineAction`, Prisma 7 (`@/generated/prisma/client`), vitest (ambiente node, `src/**/*.test.ts`), shadcn sobre base-ui (triggers com `render={…}`, não `asChild`).

**Spec:** [2026-10-26-lote1-papeis-avisos-problemas-design.md](../specs/2026-10-26-lote1-papeis-avisos-problemas-design.md) (roadmap: [2026-10-26-reuniao-hub-roadmap.md](../specs/2026-10-26-reuniao-hub-roadmap.md))

## Global Constraints

- Código e identificadores em inglês técnico já usado no módulo (o módulo `pendencias` é em português: siga-o); **toda string de tela e todo commit em pt-BR**.
- Branch `dev-vscode`, porta 3001, banco `senahub_remake_vscode`. Stage de arquivos específicos (nunca `git add -A`/`.`); conferir `git show --stat` após cada commit.
- Sem migração e sem tabela nova. `ProjetoMembro.papel` é `String?`.
- `Pendencia` e `ApontamentoCoordenacao` seguem listas separadas; a página `/pendencias` (menu "Apontamentos") não muda.
- Analista e Gerente **não** ganham poderes de Coordenador (`ehCoordenador` não muda).
- A aba Problemas é **só para `tipo = interno`**, gate `arquivos:ver` + escopo do projeto; mostra só apontamentos **publicados** (`publicadoEm != null`) e não excluídos (`excluidoEm = null`).
- Nenhuma regra de permissão nova: as mudanças de estado saem de `transicoesPossiveis` e as actions existentes continuam sendo a autoridade (a tela só reflete).
- Estado proibido por regra de estado → item **desabilitado com a mesma frase do `ActionError`**; proibido por perfil → **omitido** (ADR-0002). `await confirm()` antes de `startTransition` se houver confirmação.
- Nunca escrever handler `contextmenu` à mão: só `LinhaComMenu` (`components/ui/linha-com-menu.tsx`).
- Sem `Promise.all` em cliente de transação. Arquivos puros (`problemas.ts`, `acoes-problema.ts`, `recentes.ts`) não importam Prisma, `server-only` nem Next.
- Atalho de Avisos só no computador (`hidden … md:grid`); a aba Problemas precisa fechar a 390×844 com `document.documentElement.scrollWidth === 390` e a 1366×768 com o menu aberto.
- Antes de declarar pronto: ler e rodar `docs/PROTOCOLO_AUDITORIA_FINAL.md` (Task 9).

## Review Focus

Entradas que a spec implica e nenhuma tarefa trivialmente cobre; cada uma tem teste na tarefa dona:

1. Projeto sem nenhum apontamento publicado → aba mostra estado vazio, não quebra (Task 4, `agruparPorDisciplina([])`; Task 7, `EmptyState`).
2. Rascunho (`publicadoEm = null`) de outra pessoa **nunca** aparece na aba (Task 5, filtro da query; teste da regra pura `ehPublicada`).
3. Usuário externo com `arquivos:ver` recebe 404 na página e não vê a aba (Task 6).
4. Apontamento sem `documentoId` (legado) ou cujo arquivo está na lixeira → linha aparece, link cai no upload de origem ou vira texto "Arquivo indisponível", nunca 404 (Task 4, `hrefDaPrancha`).
5. Aviso: `localStorage` indisponível/relógio adiantado/aviso exatamente na borda de 3 dias não acendem o ponto errado (Task 2, `avisoRecenteNaoVisto`).
6. Resposta/transição concorrente ou recusada pelo servidor → a tela mostra a frase do `ActionError`, não "Erro ao processar" (Task 8).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/projetos/papeis.ts` (+ `.test.ts`) | Lista e rótulos dos papéis (modificar) |
| `src/modules/notificacoes/avisos/recentes.ts` (+ `.test.ts`) | Regra pura do ponto do atalho (criar) |
| `src/modules/notificacoes/avisos/actions.ts` | `ultimoAvisoRecebidoEm()` (modificar) |
| `src/components/notificacoes/avisos-atalho.tsx` | Ícone + ponto, client (criar) |
| `src/components/shell/header.tsx` | Monta o atalho (modificar) |
| `src/modules/projetos/pendencias/problemas.ts` (+ `.test.ts`) | Regras puras da aba: situação, filtro, agrupamento, dias, link, participação (criar) |
| `src/modules/projetos/pendencias/acoes-problema.ts` (+ `.test.ts`) | Descritor da aba, composto sobre `itensDoApontamento` (criar) |
| `src/modules/projetos/pendencias/papeis-pendencia.ts` | `papeisSobre` extraído de `actions.ts` + versão em lote por disciplina (criar) |
| `src/modules/projetos/pendencias/actions.ts` | Usa o extraído e a regra pura; revalida a aba (modificar) |
| `src/modules/projetos/pendencias/queries.ts` | `problemasDoProjeto` (modificar) |
| `src/modules/projetos/abas.ts`, `queries.ts`, `app/(dashboard)/projetos/[id]/layout.tsx` | Registro da aba (modificar) |
| `src/app/(dashboard)/projetos/[id]/problemas/page.tsx` | Página (criar) |
| `src/components/projetos/problemas-view.tsx`, `problema-conversa.tsx` | Tela e conversa, client (criar) |

---

### Task 1: Papéis Analista e Gerente

**Files:**
- Modify: `src/modules/projetos/papeis.ts:2-11`
- Test: `src/modules/projetos/papeis.test.ts`

**Interfaces:**
- Produces: `PAPEIS_PROJETO` passa a ser `["coordenador","gerente","analista","projetista","apoio","estagiario","consultor_externo"]`; `ROTULO_PAPEL.gerente = "Gerente"`, `ROTULO_PAPEL.analista = "Analista"`. `equipe-manager.tsx`, `projetos/schemas.ts` e `projeto-visao-geral.tsx` já leem essa lista: sem outra mudança.

- [ ] **Step 1: Atualizar o teste.** Em `papeis.test.ts`: a lista esperada vira a de cima; `rotuloPapel("gerente") === "Gerente"`, `rotuloPapel("analista") === "Analista"`, `rotuloPapel("x") === "Sem papel"`; `ehCoordenador({ papelNoProjeto: "gerente", perfilChave: null })` e o mesmo com `"analista"` são `false` (anti-meta: sem poderes).
- [ ] **Step 2: Rodar** `npx vitest run src/modules/projetos/papeis.test.ts` — esperado: FAIL na lista.
- [ ] **Step 3: Implementar** as duas chaves em `PAPEIS_PROJETO` (na ordem acima) e em `ROTULO_PAPEL`. Não mexer em `ehCoordenador`. Não confundir com `planejamento/recursos.ts` (tem `Papel`/`ROTULO_PAPEL` próprios).
- [ ] **Step 4: Rodar** o mesmo comando — esperado: PASS. Rodar também `npx tsc --noEmit -p tsconfig.json` filtrando `papeis`/`equipe-manager` (o `Record<PapelProjeto,string>` tem de estar completo).
- [ ] **Step 5: Commit** — `git add src/modules/projetos/papeis.ts src/modules/projetos/papeis.test.ts` ; `feat(projetos): papéis Gerente e Analista para membros do projeto`.

---

### Task 2: Atalho de Avisos ao lado do sino

**Files:**
- Create: `src/modules/notificacoes/avisos/recentes.ts`, `recentes.test.ts`, `src/components/notificacoes/avisos-atalho.tsx`
- Modify: `src/modules/notificacoes/avisos/actions.ts`, `src/components/shell/header.tsx:45-47,138-140`

**Interfaces:**
- Produces (`recentes.ts`, puro):
  - `export const JANELA_AVISO_RECENTE_DIAS = 3`
  - `export function avisoRecenteNaoVisto(recebidoEm: string | Date | null, ultimaVisitaMs: number | null, agora: Date): boolean` — `true` só se `recebidoEm` existe, está dentro dos últimos 3 dias (`agora - recebidoEm <= 3 dias`, inclusive) **e** (`ultimaVisitaMs` é `null` **ou** `recebidoEm > ultimaVisitaMs`). Data inválida ou no futuro distante (> `agora` + 1 dia) → `false`.
- Produces (`actions.ts`, sem `defineAction`, como `buscarAvisosPendentes`): `export async function ultimoAvisoRecebidoEm(): Promise<string | null>` — ISO do maior `AvisoDestinatario.criadoEm` do usuário da sessão dentro da janela; sem sessão ou erro → `null`.
- Produces (`avisos-atalho.tsx`): `export function AvisosAtalho({ chaveUsuario }: { chaveUsuario: string })`.

- [ ] **Step 1: Testes de `avisoRecenteNaoVisto`** (nomes e asserts): `"acende com aviso de ontem e sem visita registrada"`; `"apaga quando a última visita é depois do aviso"`; `"acende quando o aviso é depois da última visita"`; `"borda: aviso de exatamente 3 dias acende, de 3 dias e 1 min não"`; `"sem aviso → false"`; `"data inválida → false"`; `"aviso no futuro distante → false"`.
- [ ] **Step 2: Rodar** `npx vitest run src/modules/notificacoes/avisos/recentes.test.ts` — esperado: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `recentes.ts` (puro).
- [ ] **Step 4: Rodar** — esperado: PASS.
- [ ] **Step 5: Action** `ultimoAvisoRecebidoEm` em `avisos/actions.ts` (`"use server"`, `getSession()`, `prisma.avisoDestinatario.findFirst({ where: { userId, criadoEm: { gte: <agora − 3 dias> } }, orderBy: { criadoEm: "desc" }, select: { criadoEm: true } })`). Se o aviso do destinatário for de um `Aviso` cancelado (`canceladoEm != null`), ignorar (`where: { aviso: { canceladoEm: null } }`).
- [ ] **Step 6: Componente** `AvisosAtalho`: `Link` para `/avisos` (`aria-label="Avisos"`, `title="Avisos"`, ícone `Megaphone`, mesmas classes do atalho de Chat: `relative hidden size-8 place-items-center rounded-sm text-muted-foreground … md:grid`; ativo em `/avisos*` usa `bg-muted text-foreground`). Ponto: `span` de `size-2 rounded-full bg-destructive` em `absolute right-1 top-1`, **sem número**. Estado: `recebidoEm` (da action, chamada ao montar e a cada mudança de `usePathname()`); `ultimaVisitaMs` lido de `localStorage[`senahub.avisos-visto.${chaveUsuario}`]` em `try/catch` (falha = `null`). Quando o pathname começa com `/avisos`, gravar `Date.now()` nessa chave (em `try/catch`) e apagar o ponto. Falha da action = sem ponto.
- [ ] **Step 7: Header.** Em `header.tsx` junto de `temChat`: `const temAvisos = itensDoMenu.some((i) => i.href === "/avisos");`. Renderizar `{temAvisos && <AvisosAtalho chaveUsuario={user.email} />}` imediatamente antes de `<span data-tour="notificacoes">`.
- [ ] **Step 8: Verificar** `npm run lint` e `npx vitest run src/modules/notificacoes` — sem erro; (a tela é verificada na Task 9).
- [ ] **Step 9: Commit** — `git add` dos 6 arquivos acima ; `feat(avisos): atalho de Avisos ao lado do sino, com ponto de aviso recente`.

---

### Task 3: Extrair regras de participação e de papéis da pendência (refactor sem mudar comportamento)

**Files:**
- Create: `src/modules/projetos/pendencias/papeis-pendencia.ts`, `src/modules/projetos/pendencias/problemas.ts` (só o trecho de participação nesta tarefa), `problemas.test.ts` (idem)
- Modify: `src/modules/projetos/pendencias/actions.ts:225-229,308-321,727-740`

**Interfaces:**
- Produces (`problemas.ts`, puro):
  - `export const MOTIVO_NAO_PARTICIPA = "Só um responsável da disciplina pode alterar esta pendência."` (a frase exata que `exigirResponsavelOuGlobal` já lança)
  - `export function podeParticiparDaConversa(a: { autorId: string; usuarioId: string; ehResponsavel: boolean; ehGlobal: boolean }): boolean` — `true` se `autorId === usuarioId`, ou `ehResponsavel`, ou `ehGlobal`.
- Produces (`papeis-pendencia.ts`, servidor):
  - `export async function papeisSobre(p: { disciplinaId: string }, user: SessionUser): Promise<PapeisPendencia>` — o corpo atual de `papeisSobre` em `actions.ts`, movido sem alteração.
  - `export async function papeisPorDisciplina(disciplinaIds: string[], user: SessionUser): Promise<Map<string, PapeisPendencia>>` — **mesma semântica** de `papeisSobre`, mas calcula `can(user,"uploads","validar")` e `podeAtuarEmDisciplinaAlheia(user)` **uma vez** e busca os `DisciplinaResponsavel` do usuário numa única query `where: { userId, disciplinaId: { in } }`.
- Consumes: `PapeisPendencia` de `./helpers`.

- [ ] **Step 1: Testes** em `problemas.test.ts`: `"autor participa mesmo sem ser responsável"`, `"responsável participa"`, `"global participa"`, `"nenhum dos três não participa"`, `"MOTIVO_NAO_PARTICIPA é a frase do servidor"` (comparar com a string literal).
- [ ] **Step 2: Rodar** `npx vitest run src/modules/projetos/pendencias/problemas.test.ts` — esperado: FAIL.
- [ ] **Step 3: Implementar** o trecho puro de `problemas.ts`.
- [ ] **Step 4: Extrair** `papeisSobre` para `papeis-pendencia.ts` e adicionar `papeisPorDisciplina`; em `actions.ts` importar `papeisSobre` de lá e apagar a definição local; `exigirParticipante` passa a decidir com `podeParticiparDaConversa` e lançar `ActionError(MOTIVO_NAO_PARTICIPA)` (buscar `ehResponsavel`/`ehGlobal` como `exigirResponsavelOuGlobal` faz hoje; o resultado para qualquer usuário não pode mudar).
- [ ] **Step 5: Revalidação.** Em `revalidarViewer(projetoId, uploadId)` (`actions.ts:225`) acrescentar `revalidatePath(`/projetos/${projetoId}/problemas`)`.
- [ ] **Step 6: Rodar** `npx vitest run src/modules/projetos` (todos os testes do módulo, em especial os de pendência) e `npm run lint` — esperado: PASS, sem regressão.
- [ ] **Step 7: Commit** — `git add` dos 5 arquivos ; `refactor(pendencias): extrai papeisSobre e a regra de participação da conversa`.

---

### Task 4: Regras puras da aba e descritor de ações

**Files:**
- Modify: `src/modules/projetos/pendencias/problemas.ts`, `problemas.test.ts`
- Create: `src/modules/projetos/pendencias/acoes-problema.ts`, `acoes-problema.test.ts`

**Interfaces:**
- Consumes: `STATUS_ABERTOS`, `StatusPendencia`, `PapeisPendencia` (`./helpers`); `itensDoApontamento`, `ACAO_*`, `PREFIXO_ESTADO`, `ApontamentoParaAcoes`, `ContextoAcoesApontamento` (`./acoes-apontamento`); `limparSeparadores`, `AcaoItem` (`@/components/ui/acoes`).
- Produces (`problemas.ts`):
  - `export type SituacaoProblema = "em_aberto" | "aguardando" | "encerrados"`
  - `export function situacaoDoStatus(status: string): SituacaoProblema | null` — `aberta`,`em_correcao` → `em_aberto`; `resolvida` → `aguardando`; `fechada`,`descartada`,`adiado` → `encerrados`; outro → `null`.
  - `export type ProblemaLinha` — DTO serializável: `{ id; numero; texto; pagina; status; severidade: string|null; tipo: string|null; prazo: string|null; createdAt: string; fechadoEm: string|null; autorId: string; autor: string; tarefaId: string|null; disciplinaId; disciplinaNome; arquivo: string; uploadIdOrigem: string; uploadIdVigente: string|null; arquivoDisponivel: boolean; deOutraRevisao: boolean; revisaoOrigemId: string|null; revisaoVigenteId: string|null; revisaoVigenteNumero: number; respostas: { id; autor; autorId; texto; createdAt: string }[]; papeis: PapeisPendencia }`
  - `export function filtrarProblemas(linhas: ProblemaLinha[], f: { situacao: SituacaoProblema; severidade: string | "todas" | "sem"; tipo: string | "todos" }): ProblemaLinha[]`
  - `export function contarPorSituacao(linhas: ProblemaLinha[]): Record<SituacaoProblema, number>`
  - `export function agruparPorDisciplina(linhas: ProblemaLinha[]): { disciplinaId: string; disciplinaNome: string; linhas: ProblemaLinha[] }[]` — ordenado por nome da disciplina, linhas por `numero`; lista vazia → `[]`.
  - `export function diasEmAberto(createdAt: string | Date, fechadoEm: string | Date | null, agora: Date): number` — dias inteiros (≥ 0) de `createdAt` até `fechadoEm ?? agora`.
  - `export function hrefDaPrancha(l: { arquivoDisponivel: boolean; uploadIdVigente: string | null; uploadIdOrigem: string; numero: number }, projetoId: string): string | null` — `null` se `!arquivoDisponivel`; senão `/projetos/${projetoId}/arquivos/${uploadIdVigente ?? uploadIdOrigem}/visualizar?pin=${numero}`.
- Produces (`acoes-problema.ts`, puro):
  - `export const ACAO_ABRIR_PRANCHA = "abrir-prancha"`
  - `export function itensDoProblema(l: ProblemaLinha, ctx: { usuarioId: string; ehAdmin: boolean; podeValidar: boolean; projetoId: string }): AcaoItem[]` — chama `itensDoApontamento` com `temPranchaParaReplicar: false`, `revisaoAtualId: l.revisaoVigenteId`, `revisaoAtualNumero: l.revisaoVigenteNumero`, `papeis: l.papeis`; **remove** `ACAO_EDITAR`, `ACAO_EXCLUIR`, `ACAO_CLASSIFICAR`, `ACAO_REPLICAR` (ficam no visualizador) e passa por `limparSeparadores`; se `!podeParticiparDaConversa(...)`, o item `ACAO_RESPONDER` vem com `desabilitado: MOTIVO_NAO_PARTICIPA`; acrescenta no início um `AcaoItemLink` `{ tipo: "link", id: ACAO_ABRIR_PRANCHA, rotulo: "Abrir na prancha", href }` quando `hrefDaPrancha` não é `null`, e um item de ação **desabilitado** com o texto "Arquivo indisponível" quando é `null`.

- [ ] **Step 1: Testes de `problemas.ts`:** `situacaoDoStatus` para os 6 status e um desconhecido; `filtrarProblemas` por situação, severidade `"sem"` (nula) e tipo; `contarPorSituacao`; `agruparPorDisciplina([]) → []` e ordenação; `diasEmAberto` aberto (usa `agora`) e encerrado (para em `fechadoEm`, não cresce com `agora`); `hrefDaPrancha`: vigente, sem vigente (cai no de origem), `arquivoDisponivel:false → null`.
- [ ] **Step 2: Testes de `acoes-problema.ts`:** papéis de projetista (`ehResponsavel`) em `aberta` → itens `Responder`, `Assumir`, sem `Fechar`; validador em `resolvida` → `Fechar`, `Não procede`, `Reabrir`; **nenhum** id `editar|excluir|classificar|replicar` em qualquer combinação; usuário não participante → `Responder` com `desabilitado === MOTIVO_NAO_PARTICIPA`; apontamento herdado (`deOutraRevisao`, `revisaoOrigemId` ≠ `revisaoVigenteId`) com papel de projetista → aparece `ACAO_RESOLVER_NA_REVISAO` e não `estado:resolvida`; arquivo indisponível → item "Arquivo indisponível" desabilitado e nenhum link.
- [ ] **Step 3: Rodar** `npx vitest run src/modules/projetos/pendencias/problemas.test.ts src/modules/projetos/pendencias/acoes-problema.test.ts` — esperado: FAIL.
- [ ] **Step 4: Implementar** `problemas.ts` (resto) e `acoes-problema.ts`. `ApontamentoParaAcoes.totalRespostas` = `l.respostas.length`.
- [ ] **Step 5: Rodar** os mesmos testes — esperado: PASS.
- [ ] **Step 6: Commit** — `git add` dos 4 arquivos ; `feat(pendencias): regras puras e descritor de ações da aba Problemas`.

---

### Task 5: Leitura `problemasDoProjeto`

**Files:**
- Modify: `src/modules/projetos/pendencias/queries.ts` (acrescentar ao final das leituras de projeto, perto de `visaoConsolidadaPendencias`)
- Test: `src/modules/projetos/pendencias/problemas.test.ts` (regra `ehPublicada`)

**Interfaces:**
- Consumes: `ProblemaLinha` (`./problemas`), `papeisPorDisciplina` (`./papeis-pendencia`), `SessionUser` (`@/lib/session`).
- Produces: `export async function problemasDoProjeto(projetoId: string, viewer: SessionUser): Promise<ProblemaLinha[]>`. `ehPublicada(p: { publicadoEm: Date | string | null; excluidoEm: Date | string | null }): boolean` em `problemas.ts` (puro) para o teste do Review Focus 2.

- [ ] **Step 1: Teste** `ehPublicada`: rascunho (`publicadoEm: null`) → `false`; excluída → `false`; publicada e não excluída → `true`.
- [ ] **Step 2: Rodar** — FAIL. **Step 3:** implementar `ehPublicada`. **Step 4:** PASS.
- [ ] **Step 5: Implementar a query** com **uma** leitura de `prisma.pendencia.findMany({ where: { projetoId, publicadoEm: { not: null }, excluidoEm: null }, include: { respostas: { orderBy: { createdAt: "asc" } } , upload: { select: { id: true, nomeArquivo: true, excluidoEm: true } }, revisaoOrigem: …} })` (lembrar: leitura aninhada não passa pela extensão de soft delete, então checar `upload.excluidoEm` à mão; `Pendencia` não tem relação com `Projeto`, só a coluna `projetoId`). Depois, em lote (sem N+1): nomes de autor (`user.findMany`), disciplinas (`disciplina.findMany` → `disciplinaTextoLegado`), **upload vigente por `documentoId`** (último `upload` não excluído por `versao desc`, `documentoId in (…)` — lembrar do filtro `substituidoPorId: null` em leituras aninhadas/SQL), **revisão vigente por documento** (`documentoRevisao` de maior `numero`), e `papeisPorDisciplina`. `arquivoDisponivel` = existe upload vigente não excluído, ou (sem `documentoId`) o upload de origem não está excluído. Ordenar por `numero`. Datas viram ISO.
- [ ] **Step 6: Verificar** `npx tsc --noEmit -p tsconfig.json` sem erro nos arquivos tocados e `npm run lint`.
- [ ] **Step 7: Commit** — `git add` dos 3 arquivos ; `feat(pendencias): leitura dos problemas de um projeto`.

---

### Task 6: Registrar a aba e a página (acesso)

**Files:**
- Modify: `src/modules/projetos/abas.ts`, `abas.test.ts`, `src/modules/projetos/queries.ts:649-673`, `src/app/(dashboard)/projetos/[id]/layout.tsx:44-92,223-238`
- Create: `src/app/(dashboard)/projetos/[id]/problemas/page.tsx`

**Interfaces:**
- Produces: sufixo `"/problemas"` em `ABAS_CONFIGURAVEIS` (logo depois de `"/arquivos"`), `ABA_LABEL["/problemas"] = "Problemas"`; `abasComConteudo(projetoId)` devolve também `"/problemas": boolean` (existe `Pendencia` publicada e não excluída no projeto); a página renderiza `<ProblemasView …/>` (Task 7).

- [ ] **Step 1: Teste** em `abas.test.ts`: `"/problemas" vem logo depois de "/arquivos" na ordem padrão`; `abasParaEdicao(null)` continua com `length === ABAS_CONFIGURAVEIS.length` (os testes genéricos existentes já cobrem).
- [ ] **Step 2: Rodar** `npx vitest run src/modules/projetos/abas.test.ts` — FAIL. **Step 3:** editar `abas.ts`. **Step 4:** PASS.
- [ ] **Step 5: `abasComConteudo`:** adicionar `prisma.pendencia.count({ where: { projetoId, publicadoEm: { not: null }, excluidoEm: null } })` ao `Promise.all` e `"/problemas": problemas > 0`.
- [ ] **Step 6: Layout.** Em `layout.tsx` acrescentar `can(user, "arquivos", "ver")` ao `Promise.all` (`podeProblemas`) e, em `abasVisiveis`, `...(podeProblemas && user.tipo === "interno" ? ["/problemas"] : [])` logo após `"/arquivos"`.
- [ ] **Step 7: Página** `problemas/page.tsx`: `const user = await requireInterno();` depois `await requirePermission("arquivos", "ver")`; `projetoVisivel(user, id)` (de `@/modules/planejamento/queries`, como `diario/page.tsx`) → `notFound()` se nulo; `const linhas = await problemasDoProjeto(id, user);` renderizar `<ProblemasView projetoId={id} linhas={linhas} usuarioId={user.id} ehAdmin={acessoGlobal(user)} podeValidar={await can(user, "uploads", "validar")} />`. `metadata: { title: "Problemas — projeto" }`. Sem `CabecalhoPagina` próprio (o layout do projeto já traz cabeçalho e abas).
- [ ] **Step 8: Verificar** `npm run lint`; abrir `/projetos/<id>/problemas` com usuário **externo** → 404 (verificação final na Task 9).
- [ ] **Step 9: Commit** — `git add` dos 6 arquivos (a página só compila depois da Task 7: se necessário, commitar junto) ; `feat(projetos): aba Problemas no projeto (acesso e registro)`.

---

### Task 7: Tela `ProblemasView` (lista, filtros, menu)

**Files:**
- Create: `src/components/projetos/problemas-view.tsx`

**Interfaces:**
- Consumes: tudo de `problemas.ts` e `acoes-problema.ts` (Task 4); actions `assumirCorrecaoPendencia`, `resolverPendencia`, `reabrirPendencia`, `fecharPendencia`, `descartarPendencia`, `adiarPendencia` (`pendencias/actions.ts`, todas `{ id }`, `descartarPendencia` com `{ id, justificativa }` mín. 3 caracteres); `LinhaComMenu`, `BotaoAcoes`, `EmptyState`, `Select`, `Badge`, `CollapsibleSection`; `destinoDoItem`, `ACAO_RESPONDER`, `ACAO_RESOLVER_NA_REVISAO` (`acoes-apontamento.ts`); `STATUS_LABEL`, `SEVERIDADE_LABEL`, `TIPO_PENDENCIA_LABEL` (`helpers.ts`); `<ProblemaConversa/>` (Task 8).
- Produces: `export function ProblemasView(props: { projetoId: string; linhas: ProblemaLinha[]; usuarioId: string; ehAdmin: boolean; podeValidar: boolean })`.

- [ ] **Step 1: Estrutura.** Filtro de situação (`em_aberto` padrão, `aguardando`, `encerrados`, com a contagem de `contarPorSituacao` no rótulo), severidade, tipo; `flex-wrap`. Abaixo, uma seção por disciplina (`agruparPorDisciplina(filtrarProblemas(...))`, com contagem, aberta por padrão). Linha = nº, texto (2 linhas, `title` com o texto inteiro), prancha (`arquivo` · pág.), badges de severidade/tipo (cores de `SEVERIDADE_CLS` — copiar o mapa de `pendencias-consolidado-view.tsx`), situação (`STATUS_LABEL`), prazo, `diasEmAberto`. **Linha definida fora do componente pai** (função de topo com `key`) para o menu de contexto não fechar a cada render.
- [ ] **Step 2: Menu.** `itens = itensDoProblema(linha, { usuarioId, ehAdmin, podeValidar, projetoId })` alimenta `LinhaComMenu` (botão direito/toque longo) **e** `BotaoAcoes` (rótulo `Ações do problema #N`); linha com um único item ativo fica sem menu (regra 4 do ADR-0002).
- [ ] **Step 3: Ações.** `onSelect(item)`: `ACAO_RESPONDER` expande a conversa da linha; `ACAO_RESOLVER_NA_REVISAO` navega para `hrefDaPrancha` (a escolha da revisão acontece no visualizador); `destinoDoItem(item.id)` → action correspondente em `startTransition` + `router.refresh()`; `descartada` abre uma janela local de justificativa (`Dialog` próprio, textarea, mín. 3 caracteres) que chama `descartarPendencia`. Erro devolvido pela action vira toast com **a frase do servidor** (`result.error`), nunca texto genérico (Review Focus 6).
- [ ] **Step 4: Estados.** Sem nenhuma linha no projeto: `EmptyState` "Nenhum problema neste projeto." (descrição: "Os apontamentos enviados pela coordenação aparecem aqui."); filtro sem resultado: "Nenhum problema com esses filtros." Lista que rola dentro da área (`min-h-0 overflow-y-auto`), sem rolagem horizontal da página.
- [ ] **Step 5: Verificar** `npm run lint` e `npx tsc --noEmit -p tsconfig.json` sem erros novos.
- [ ] **Step 6: Commit** — `git add src/components/projetos/problemas-view.tsx` ; `feat(projetos): tela da aba Problemas`.

---

### Task 8: Conversa do problema

**Files:**
- Create: `src/components/projetos/problema-conversa.tsx`
- Modify: `src/components/projetos/problemas-view.tsx` (renderiza a conversa na linha expandida)

**Interfaces:**
- Consumes: `responderPendencia({ id, texto })` (texto 1–2000); `ProblemaLinha.respostas`, `podeParticiparDaConversa`, `MOTIVO_NAO_PARTICIPA`.
- Produces: `export function ProblemaConversa(props: { linha: ProblemaLinha; podeResponder: boolean })`.

- [ ] **Step 1: Implementar** lista das respostas (autor, data relativa com `formatarDataHora`, texto, da mais antiga para a mais nova) e, abaixo, `Textarea` + botão "Responder". `podeResponder = false` → textarea e botão desabilitados com `title={MOTIVO_NAO_PARTICIPA}` e a frase visível abaixo. Envio: `startTransition` → `responderPendencia`; sucesso limpa o campo e dá `router.refresh()`; erro mostra a frase do servidor (`result.error`). Botão desabilitado enquanto envia (sem duplo envio) e com campo vazio. Menções (`@nome`), anexos e ligações ficam no visualizador (link "Abrir na prancha" já está no menu).
- [ ] **Step 2: Ligar** em `problemas-view.tsx`: `podeResponder = podeParticiparDaConversa({ autorId: linha.autorId, usuarioId, ehResponsavel: linha.papeis.ehResponsavel, ehGlobal: linha.papeis.ehGlobal })` — a **mesma** função que o servidor usa (Task 3).
- [ ] **Step 3: Verificar** `npm run lint` e `tsc` sem erros novos.
- [ ] **Step 4: Commit** — `git add` dos 2 arquivos ; `feat(projetos): conversa do problema na aba Problemas`.

---

### Task 9: Verificação, manual e auditoria final

**Files:**
- Modify: `docs/manual/` (a seção que cita papéis do projeto e apontamentos, se houver) e `docs/manual/novidades.md`
- Output (gitignored): `prints-auditoria/2026-10-26_lote1-papeis-avisos-problemas/` com `LEIAME.md`

- [ ] **Step 1: Suíte completa.** `npm run lint` e `npm test` — esperado: sem erro novo (anotar qualquer falha pré-existente com a saída).
- [ ] **Step 2: Subir** `npm run dev -- -p 3001` (nunca `next build` com o dev ativo nesta pasta). Dados: `npm run ensaio:eap` já cria um usuário por perfil (senha `Demo@2026`); criar 2–3 apontamentos publicados de duas disciplinas pelo visualizador, com a coordenação, e um rascunho de outra pessoa.
- [ ] **Step 3: Conferir em tela, com capturas:**
  - Papéis: Equipe do projeto → o select lista Gerente e Analista; salvar e ver o rótulo na Visão Geral.
  - Atalho: ícone ao lado do sino a 1366×768; ponto aparece com aviso recente e some ao abrir `/avisos`; a 390×844 o ícone não aparece e `scrollWidth === 390`.
  - Problemas: projetista da disciplina (assume → resolve), validador (fecha, "não procede" com justificativa), usuário sem acesso ao projeto (não vê a aba), externo (404); rascunho de outra pessoa **não** aparece; botão direito e `⋯` mostram os mesmos itens; link "Abrir na prancha" abre na versão vigente; a 1366×768 com o menu **aberto** o cabeçalho não se sobrepõe; a 390×844 `scrollWidth === 390`.
- [ ] **Step 4: Manual.** Atualizar o texto de papéis do projeto e acrescentar a aba Problemas e o atalho de Avisos em `docs/manual/novidades.md` (linguagem de usuário).
- [ ] **Step 5: Auditoria final.** Ler e executar `docs/PROTOCOLO_AUDITORIA_FINAL.md` (reler, ele muda), escolher o nível pelo risco real (mexe em permissão e em action existente → pelo menos nível 3, com os subagentes revisores da seção 13), corrigir o que estiver no escopo e entregar o relatório em pt-BR.
- [ ] **Step 6: Commit** — `git add docs/manual/…` ; `docs(manual): papéis, aba Problemas e atalho de Avisos`.
