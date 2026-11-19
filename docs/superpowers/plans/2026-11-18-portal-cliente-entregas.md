# Entregas no portal do cliente — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o cliente logado vê, baixa e abre no navegador as pranchas das pastas "Compartilhado" e "Liberado para obra" (e as ARTs) na página do projeto no portal, com as MESMAS regras do link público.

**Architecture:** o núcleo de `modules/projetos/arquivos/link-publico.ts` passa a operar sobre um `AlcanceArquivos` (os campos do link que as regras leem) em vez de um token; as funções por token viram "resolver token → alcance → núcleo". O portal monta um alcance fixo (projeto todo, por situação) e chama o mesmo núcleo, por três rotas autenticadas que espelham as do link. A árvore da tela (`arquivos-publico-view.tsx`) recebe a base das URLs em vez do token e é usada pelos dois canais.

**Tech Stack:** Next.js 15 (RSC + route handlers), Prisma 7, vitest (env node), tsx smokes.

**Spec:** [docs/superpowers/specs/2026-11-18-portal-cliente-entregas-design.md](../specs/2026-11-18-portal-cliente-entregas-design.md)

## Global Constraints

- UI, mensagens e commits em pt-BR; identificadores em inglês ou no vocabulário já usado no módulo.
- REST só para download/streaming; a página é RSC, sem Server Action nova.
- Arquivo lido só por `lerArquivo` / `resolverCaminho` (como as rotas do link).
- O portal NUNCA passa `incluirCompartilhadosDoGeral` a `recebidosDoProjeto`.
- Página do portal tocada migra para `CabecalhoPagina` (primeiro elemento da página).
- Tela pronta só com `document.documentElement.scrollWidth === 390` a 390×844.
- Nenhum `Promise.all` sobre cliente de transação (guarda `promise-all-em-transacao.test.ts`).
- Vitest roda pelo PowerShell (`npx vitest run …`), não pelo Git Bash.
- Commits: arquivos específicos no `git add`, conferir `git show --stat` depois.

## Review Focus

1. **Cliente A troca o `projetoId` da URL pelo de um projeto do cliente B** → 404 "Arquivo indisponível." em página e nas três rotas (Task 4, teste `decidirAcessoPortal` + smoke).
2. **Upload de OUTRO projeto do mesmo cliente na URL do projeto certo** (`/api/portal/projetos/P1/arquivos/<upload de P2>`) → 404: o alcance é do projeto da URL (Task 1 smoke + Task 6).
3. **Termo do cliente com `versao` nova ainda não aceita** → rotas 403 "Aceite o termo de uso para continuar." (Task 4).
4. **Revisão com bloqueio de download** → listada com `bloqueado: true`, sem botões; rota 404; fora do .zip (Tasks 2 e 6).
5. **Refator muda o link público sem querer** → `smoke:pastas-cliente` e `smoke:historico-documento` continuam verdes sem editar uma linha deles (Task 1).

---

### Task 1: Núcleo do link por alcance

**Files:**
- Modify: `src/modules/projetos/arquivos/link-publico.ts`
- Modify: `src/modules/projetos/arquivos/link-publico-regras.ts` (tipo + `alcanceDoPortal`, puro)
- Test: `src/modules/projetos/arquivos/link-publico-regras.test.ts`

**Interfaces:**
- Produces (em `link-publico-regras.ts`, puro):
  ```ts
  export type AlcanceArquivos = {
    projetoId: string;
    projeto: { codigo: string; nome: string };
    escopo: "disciplinas" | "projeto_todo" | "selecao";
    disciplinaIds: string[];
    uploadIds: string[];
    porSituacao: boolean;
    faseIds: string[];
    incluirSemFase: boolean;
    agruparPorFase: boolean;
    titulo: string | null;
    /** Link de onde veio; null = portal. Vai para o histórico de acessos. */
    linkId: string | null;
  };
  export function alcanceDoPortal(projeto: { id: string; codigo: string; nome: string }): AlcanceArquivos;
  ```
- Produces (em `link-publico.ts`):
  ```ts
  export async function conteudoDoAlcance(alcance: AlcanceArquivos): Promise<ConteudoPublico | null>;
  export async function uploadLiberadoNoAlcance(alcance: AlcanceArquivos, uploadId: string):
    Promise<{ id: string; nomeArquivo: string; caminho: string; mimeType: string | null } | null>;
  export async function artLiberadaNoAlcance(alcance: AlcanceArquivos, id: string): Promise<{ caminho: string; nome: string } | null>;
  export async function uploadsDoAlcanceParaZip(alcance: AlcanceArquivos, recorte?: RecorteZip):
    Promise<{ linkId: string | null; codigo: string; entradas: { uploadId: string; caminho: string; nome: string }[] } | null>;
  ```
  As quatro funções por token (`conteudoPublicoPorToken`, `uploadLiberadoNoLink`, `artLiberadaNoLink`, `uploadsDoLinkParaZip`) mantêm assinatura e comportamento; cada uma resolve o link (vigente) por uma `alcanceDoToken(token)` interna e delega.

- [ ] **Step 1: Teste de `alcanceDoPortal`** em `link-publico-regras.test.ts`, `it("alcance do portal = link de projeto todo por situação, todas as fases")`:
  `expect(alcanceDoPortal({ id: "p1", codigo: "2026-001", nome: "Ed. X" })).toEqual({ projetoId: "p1", projeto: { codigo: "2026-001", nome: "Ed. X" }, escopo: "projeto_todo", disciplinaIds: [], uploadIds: [], porSituacao: true, faseIds: [], incluirSemFase: false, agruparPorFase: true, titulo: null, linkId: null })`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/projetos/arquivos/link-publico-regras.test.ts` → FAIL (`alcanceDoPortal` não existe).
- [ ] **Step 3: Implementar** o tipo e `alcanceDoPortal`; em `link-publico.ts`, trocar o parâmetro `link` das funções internas (`disciplinasDoLink`, `filtrarPorFases(…, link)`, `faseLiberada(…, link)`, `link.agruparPorFase`) pelo alcance e extrair as quatro funções `…DoAlcance`. Nenhuma regra muda: é mover o "achar o link pelo token + `linkVigente`" para fora do núcleo.
- [ ] **Step 4: Rodar** `npx vitest run src/modules/projetos/arquivos` → PASS; `npm run smoke:pastas-cliente` e `npm run smoke:historico-documento` → todos `[OK]`, sem editar os smokes.
- [ ] **Step 5: Commit** — `refactor(arquivos): núcleo do link público por alcance, sem token`.

### Task 2: Descrição da revisão e "Download bloqueado" na árvore

**Files:**
- Modify: `src/modules/projetos/arquivos/link-publico.ts` (`ArquivoPublico`, `REVISAO_COM_MARCA`, `paraArquivoPublico`, `emPastas`, `conteudoDoAlcance`)
- Modify: `src/components/arquivos/arquivos-publico-view.tsx` (`LinhaArquivo`)
- Test: `scripts/smoke-portal-entregas.ts` (criado aqui, completado na Task 6) + `package.json` script `smoke:portal-entregas`

**Interfaces:**
- Consumes: `conteudoDoAlcance`, `alcanceDoPortal` (Task 1); `uploadsComBloqueioDeDownload(db, ids): Promise<Set<string>>` (`modules/uploads/ciclo/service.ts`).
- Produces: `ArquivoPublico` (e `ArquivoPublicoEmPasta`) ganham `descricaoRevisao: string | null` (de `DocumentoRevisao.descricao` da revisão do upload) e `bloqueado: boolean`.

- [ ] **Step 1: Smoke inicial** `scripts/smoke-portal-entregas.ts`, no molde de `smoke-pastas-cliente.ts` (cliente + projeto + disciplina "Estrutural" + documento com fase, throwaway com `tag`, apaga tudo no `finally`). Montar: doc A com revisão `numero: 2`, `descricao: "Ajuste das cotas"`, upload validado, marcado em Compartilhado (`revisaoCompartilhadaId`); doc B idem sem descrição, com `ControleRevisao { tipo: "bloqueio", escopos: ["download"], motivo: "smoke" }` ativo. Checks:
  - `"descrição da revisão chega ao arquivo"` — arquivo de A em `conteudoDoAlcance(alcanceDoPortal(p)).situacoes[0]` tem `descricaoRevisao === "Ajuste das cotas"` e `bloqueado === false`;
  - `"revisão bloqueada continua listada, marcada"` — arquivo de B presente com `bloqueado === true`;
  - `"bloqueada fora do .zip"` — `uploadsComBloqueioDeDownload` sobre `uploadsDoAlcanceParaZip(...).entradas` contém o upload de B.
- [ ] **Step 2: Rodar e ver falhar** — `npm run smoke:portal-entregas` → `[FALHA]` nos dois primeiros (campos não existem / `undefined`).
- [ ] **Step 3: Implementar** — `descricao: true` no select da revisão; em `conteudoDoAlcance`, UMA chamada de `uploadsComBloqueioDeDownload` com todos os ids do conteúdo (situações + disciplinas + seleção), passada a `paraArquivoPublico`. Na `LinhaArquivo`: descrição em texto pequeno abaixo do nome (`truncate`, inteiro no `title`), selo "Download bloqueado" com `classeDoStatus(COR_CONTROLE.bloqueio)` no mesmo lugar do selo "Em revisão", e os links de visualizar/baixar omitidos quando `bloqueado`.
- [ ] **Step 4: Rodar** `npm run smoke:portal-entregas` → todos `[OK]`; `npm run smoke:pastas-cliente` → `[OK]`.
- [ ] **Step 5: Commit** — `feat(arquivos): descrição da revisão e selo de download bloqueado na árvore do cliente`.

### Task 3: Árvore da tela por base de URL

**Files:**
- Modify: `src/components/arquivos/arquivos-publico-view.tsx`
- Modify: `src/app/p/arquivos/[token]/page.tsx` (só se a assinatura de `ArquivosPublicoView` mudar — preferir não mudar)

**Interfaces:**
- Produces: `export function ArvoreEntregas({ base, conteudo }: { base: string; conteudo: ConteudoPublico })` — o conteúdo do `Card` de hoje (situações, disciplinas, ARTs). `base` sem barra final; URLs: `${base}/${id}`, `${base}/${id}?disposition=inline`, `${base}/zip?…`, `${base}/art/${id}`. `ArquivosPublicoView({ token, conteudo })` continua com a mesma assinatura e passa `base={`/api/p/arquivos/${token}`}`.

- [ ] **Step 1: Trocar a prop `token` por `base`** em todos os subcomponentes (`BaixarPasta`, `LinhaArquivo`, `PastasDeFormato`, `Disciplina`, `PastaSituacao`, `ArtsPublicas`) e extrair `ArvoreEntregas`.
- [ ] **Step 2: Verificar** — `npx tsc --noEmit -p tsconfig.json` sem erro novo; `rg "/api/p/arquivos/\\$\\{token\\}" src/components/arquivos/arquivos-publico-view.tsx` só acha a linha do `ArquivosPublicoView` (base e "Baixar tudo").
- [ ] **Step 3: Conferir em tela** um link público existente do banco de dev (`npm run dev`): pastas, PDF inline, download e .zip funcionam como antes.
- [ ] **Step 4: Commit** — `refactor(arquivos): árvore de entregas recebe a base das URLs`.

### Task 4: Acesso do portal, rotas e origem "portal" no histórico

**Files:**
- Create: `src/modules/portal/acesso-regras.ts` (puro) + `src/modules/portal/acesso-regras.test.ts`
- Create: `src/modules/portal/acesso.ts` (server-only, I/O)
- Create: `src/app/api/portal/projetos/[projetoId]/arquivos/[uploadId]/route.ts`
- Create: `src/app/api/portal/projetos/[projetoId]/arquivos/zip/route.ts`
- Create: `src/app/api/portal/projetos/[projetoId]/arquivos/art/[id]/route.ts`
- Modify: `src/modules/uploads/historico/eventos.ts` (`OrigemEvento` + `"portal"`), `src/modules/uploads/historico/queries.ts:92` (mapear `portal`), `src/components/projetos/arquivos/historico-documento.tsx:107-108` (ícone/rótulo)

**Interfaces:**
- Produces (puro):
  ```ts
  export type EntradaAcessoPortal = {
    temSessao: boolean; tipo: "interno" | "externo" | null; clienteId: string | null;
    mustChangePassword: boolean; termoPendente: boolean; projetoClienteId: string | null; // null = projeto não existe
  };
  export type DecisaoAcessoPortal = { ok: true } | { ok: false; status: 401 | 403 | 404; erro: string };
  export function decidirAcessoPortal(e: EntradaAcessoPortal): DecisaoAcessoPortal;
  export const MSG_PORTAL = { semSessao: "Não autenticado.", indisponivel: "Arquivo indisponível.",
    termo: "Aceite o termo de uso para continuar.", senha: "Troque a senha para continuar." } as const;
  ```
- Produces (I/O): `export async function acessoAoProjetoDoPortal(projetoId: string): Promise<{ ok: true; userId: string; alcance: AlcanceArquivos } | { ok: false; status: 401 | 403 | 404; erro: string }>` — lê sessão (`getSession`), `User.clienteId`, `precisaAceitarTermo(user)`, o projeto (`id, codigo, nome, clienteId`) e devolve `alcanceDoPortal(projeto)`.
- Consumes: Task 1 (`…DoAlcance`, `alcanceDoPortal`).

- [ ] **Step 1: Testes** em `acesso-regras.test.ts`, um `it` por linha (base = `{ temSessao: true, tipo: "externo", clienteId: "c1", mustChangePassword: false, termoPendente: false, projetoClienteId: "c1" }`):
  - sem sessão → `{ ok: false, status: 401, erro: "Não autenticado." }`;
  - `tipo: "interno"` → `{ ok: false, status: 404, erro: "Arquivo indisponível." }`;
  - `clienteId: null` → 404;
  - `projetoClienteId: "c2"` (outro cliente) → 404; `projetoClienteId: null` → 404 (mesma resposta: não revela se existe);
  - `mustChangePassword: true` → 403 `"Troque a senha para continuar."`;
  - `termoPendente: true` → 403 `"Aceite o termo de uso para continuar."`;
  - ordem: senha antes de termo; ambos só depois de passar sessão/tipo/cliente/projeto (com `projetoClienteId: "c2"` e `termoPendente: true` → 404);
  - base → `{ ok: true }`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/portal/acesso-regras.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `decidirAcessoPortal` e `acessoAoProjetoDoPortal`.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Rotas** — cada uma copia a rota irmã de `src/app/api/p/arquivos/[token]/…` trocando: o gate por `acessoAoProjetoDoPortal(projetoId)` (falha → `NextResponse.json({ error }, { status })`); a leitura por `…DoAlcance(acesso.alcance, …)`; `logAudit` com `acao` `download-portal` / `download-portal-zip` / `download-art-portal`, `detalhe: { projetoId }` (nunca token); `registrarAcessoUploads({ …, origem: "portal", userId: acesso.userId, linkId: null })` (arquivo e zip; ART não registra, como no link). Bloqueio do ciclo e 410 iguais às irmãs.
- [ ] **Step 6: Histórico** — `OrigemEvento = "interno" | "link_publico" | "portal"`; `queries.ts` mapeia `r.origem === "portal"`; na tela, origem `portal` usa o ícone `Globe` e `quem` = `${e.autor ?? "Cliente"} (portal do cliente)`.
- [ ] **Step 7: Verificar** — `npx vitest run src/modules/uploads/historico src/modules/portal` → PASS; `npm run lint` sem erro novo.
- [ ] **Step 8: Commit** — `feat(portal): rotas autenticadas de download das entregas do cliente`.

### Task 5: Seção de entregas na página do projeto + manual

**Files:**
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx`
- Modify: `docs/manual/inicio/portal-cliente.md`

**Interfaces:**
- Consumes: `conteudoDoAlcance`, `alcanceDoPortal` (Task 1); `ArvoreEntregas` (Task 3).

- [ ] **Step 1: Página** — trocar o bloco de título antigo por `CabecalhoPagina` (`titulo` = nome do projeto, `descricao` = código + situação, `trilha` = Meus projetos → projeto) como primeiro elemento; prazo e endereço na linha logo depois. Abaixo do card de disciplinas, `Card` "Entregas" com "Baixar tudo (.zip)" no cabeçalho (link para `/api/portal/projetos/${id}/arquivos/zip`, só com conteúdo) e `ArvoreEntregas base={`/api/portal/projetos/${id}/arquivos`}`. `conteudoDoAlcance` retornando `null` ou total 0 (situações + ARTs) → `EmptyState` com título "Nenhuma prancha compartilhada ainda.". O bloco `PortalDocumentos` (envio do cliente) continua, depois das entregas.
- [ ] **Step 2: Manual** — em `portal-cliente.md`, seção "Pranchas e entregas": as duas pastas, o que é "Em revisão", "Download bloqueado", baixar pasta/tudo, abrir PDF.
- [ ] **Step 3: Conferir em tela** com usuário externo de dev (`npm run dev`), projeto com arquivos nas duas pastas: 1366×768 com menu aberto (cabeçalho não sobrepõe a barra), 390×844 com `document.documentElement.scrollWidth === 390`, PDF abre inline, .zip baixa.
- [ ] **Step 4: Commit** — `feat(portal): entregas do projeto na página do cliente`.

### Task 6: Smoke ponta a ponta do portal

**Files:**
- Modify: `scripts/smoke-portal-entregas.ts`
- Modify: `CLAUDE.md` (linha do `smoke:portal-entregas` na lista de comandos)

**Interfaces:**
- Consumes: Tasks 1, 2, 4.

- [ ] **Step 1: Acrescentar checks** ao smoke da Task 2 (mesmos dados + um 2º projeto P2 do MESMO cliente e um projeto P3 de OUTRO cliente, cada um com um upload em Compartilhado):
  - `"portal = link projeto todo por situação"` — `conteudoDoAlcance(alcanceDoPortal(P1))` é `toEqual`-igual (via `JSON.stringify`) a `conteudoPublicoPorToken(token)` de um `LinkPublicoArquivos { escopo: "projeto_todo", porSituacao: true }` criado para P1, exceto `titulo`;
  - `"upload de outro projeto do mesmo cliente não sai"` — `uploadLiberadoNoAlcance(alcanceDoPortal(P1), uploadDeP2)` é `null`;
  - `"upload de outro cliente não sai"` — idem com o upload de P3;
  - `"revisão em andamento não aparece"` — doc C com revisão `estado: "em_andamento"`, sem marca de pasta: ausente do conteúdo e `uploadLiberadoNoAlcance` → `null`;
  - `"ART do projeto aparece"` — `Art` com `arquivoPath` em P1 aparece em `conteudo.arts` e `artLiberadaNoAlcance` resolve.
- [ ] **Step 2: Rodar** `npm run smoke:portal-entregas` → todos `[OK]`.
- [ ] **Step 3: Verificação final** — `npm test`, `npm run lint`, `npm run build` (sem `next dev` ativo nesta pasta), `npm run smoke:pastas-cliente`, `npm run smoke:historico-documento`; depois `docs/PROTOCOLO_AUDITORIA_FINAL.md` (nível 3: muda rota de download com dado de cliente) com prints em `prints-auditoria/2026-11-18_portal-entregas/`.
- [ ] **Step 4: Commit** — `test(portal): smoke das entregas no portal do cliente`.
