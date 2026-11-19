# Portal — andamento por fase e linha do tempo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No portal do cliente, trocar o card "Disciplinas" por "Andamento" (fases EP/BS/EX com situação para o cliente) e criar o card "Linha do tempo" (o que já aconteceu), tudo derivado do mesmo conteúdo das Entregas.

**Architecture:** Uma função pura (`portal/andamento.ts`) recebe as fases das disciplinas e as "marcas" (documento × situação × data) tiradas do `ConteudoPublico` das Entregas e devolve andamento + linha do tempo. Uma camada `server-only` (`portal/andamento-queries.ts`) lê fases, documento de cada upload e data de cada marcação. Nada é gravado; nenhuma migração.

**Tech Stack:** Next.js 15 RSC, React 19 (`cache`, `Suspense`), Prisma 7, Vitest (node), tsx para o smoke.

**Spec:** `docs/superpowers/specs/2026-11-19-portal-andamento-linha-do-tempo-design.md`

## Global Constraints

- Sem datas futuras no portal: o "Prazo" por disciplina sai; o prazo do contrato no topo fica.
- Fase "Concluída" = `status = aprovado` **e** ≥ 1 documento da mesma fase da mesma disciplina nas Entregas (qualquer situação). Basta um.
- Linha do tempo = só o que está nas Entregas hoje; marcação sem data fica fora (nunca inventar data).
- Contagem por **documento** (prancha), não por arquivo.
- Dia = `diaDeSaoPaulo(data)` de `src/lib/data.ts`; exibir com `formatarData`.
- `andamento.ts` é puro: só `import type` de Prisma/`link-publico`; nada de `server-only`, `prisma`, Next.
- UI em pt-BR; situação com texto + ícone, nunca só cor; `flex-wrap`; a 390×844 `scrollWidth` = 390.
- Nenhuma escrita no banco, nenhuma migração, nenhuma mudança no fluxo interno.
- Commits semânticos em pt-BR, arquivos adicionados um a um, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Vitest pelo PowerShell (Git Bash quebra o vitest).

## Review Focus

1. Fase aprovada cuja prancha foi **retirada** da pasta do cliente depois → volta a "Em andamento" e some da linha do tempo (teste na Task 1 e no smoke da Task 2).
2. Plano de percentuais em rascunho (soma ≠ 100, ou tudo 0) → percentual não passa de 100 nem divide por zero (Task 1).
3. Mesma prancha em "Compartilhado" **e** "Liberado para obra" → conta 1 em cada grupo, e a fase usa a data mais antiga das duas (Task 1).
4. Marcação às 22h30 BRT → cai no dia de São Paulo, não no seguinte (Task 1).
5. Projeto sem nenhuma entrega (conteúdo `null`) → Andamento renderiza com fases em andamento/não iniciadas e Linha do tempo vazia, sem quebrar (Task 1 + tela na Task 3).

---

### Task 1: Regra pura do andamento e da linha do tempo

**Files:**
- Create: `src/modules/portal/andamento.ts`
- Test: `src/modules/portal/andamento.test.ts`

**Interfaces:**
- Consumes: `type StatusDisciplina` (`@/generated/prisma/client`), `type ConteudoPublico` (`@/modules/projetos/arquivos/link-publico`), `type Situacao` (`@/modules/uploads/revisao-marcada`), `FASE_SEM` (`@/modules/uploads/arvore-navegacao`), `diaDeSaoPaulo` (`@/lib/data`).
- Produces:

```ts
export type SituacaoCliente = "nao_iniciada" | "em_andamento" | "concluida";
export type FaseEntrada = { faseId: string; sigla: string; status: StatusDisciplina; entregueEm: Date | null; percentual: number; ordem: number };
export type DisciplinaEntrada = { id: string; nome: string; status: StatusDisciplina; entregueEm: Date | null; fases: FaseEntrada[] }; // já na ordem do projeto
export type MarcaEntrada = { documentoId: string; disciplinaId: string; faseId: string | null; situacao: Situacao; marcadaEm: Date | null };
export type FaseAndamento = { faseId: string | null; sigla: string | null; situacao: SituacaoCliente; concluidaEm: string | null }; // YYYY-MM-DD (SP)
export type DisciplinaAndamento = { id: string; nome: string; percentual: number; fases: FaseAndamento[] }; // sem fase = 1 item com faseId/sigla null
export type Andamento = { percentual: number; disciplinas: DisciplinaAndamento[] };
export type TipoItemLinha = "liberado_obra" | "compartilhado" | "fase_concluida";
export type ItemLinhaDoTempo = { dia: string; disciplinaId: string; disciplina: string; tipo: TipoItemLinha; quantidade: number; faseSigla: string | null; texto: string };

export function marcasDoConteudo(
  conteudo: ConteudoPublico | null,
  documentoDoUpload: ReadonlyMap<string, string>,              // uploadId → documentoId
  dataDaMarca: ReadonlyMap<string, Date>,                      // chaveMarca(documentoId, situacao) → data
): MarcaEntrada[];
export function chaveMarca(documentoId: string, situacao: Situacao): string; // `${documentoId}:${situacao}`
export function andamentoDoProjeto(disciplinas: DisciplinaEntrada[], marcas: MarcaEntrada[]): Andamento;
export function linhaDoTempo(disciplinas: DisciplinaEntrada[], marcas: MarcaEntrada[], andamento: Andamento): ItemLinhaDoTempo[];
```

- [ ] **Step 1: Escrever os testes que falham**

Montar entradas com um helper `fase(sigla, status, extra?)` / `disc(id, fases, extra?)` / `marca(doc, disc, fase, situacao, iso|null)`. Datas como `new Date("2026-10-02T15:00:00Z")`. Casos e asserções:

```ts
// marcasDoConteudo
it("tira uma marca por documento e situação, com a fase da pasta", ...)
//   conteúdo com situação "compartilhado" → disciplina d1 → pasta chave "f-ep" → arquivos u1 (pdf) e u2 (dwg), ambos do doc1
//   → [{ documentoId: "doc1", disciplinaId: "d1", faseId: "f-ep", situacao: "compartilhado", marcadaEm: <data do mapa> }] (length 1)
it("pasta Sem fase vira faseId null", ...)              // chave FASE_SEM → faseId: null
it("upload sem documento no mapa fica fora", ...)
it("conteúdo null devolve lista vazia", ...)

// andamentoDoProjeto
it("aguardando é Não iniciada", ...)                    // situacao "nao_iniciada", concluidaEm null
it("aprovada sem prancha nas Entregas segue Em andamento", ...)
it("prancha compartilhada antes da aprovação não conclui", ...) // status em_andamento + marca da fase → "em_andamento"
it("em_revisao e entregue são Em andamento", ...)
it("aprovada com uma prancha da fase conclui, data = a mais recente entre aprovação e primeira marcação", ...)
//   entregueEm 2026-10-05, marcas 2026-10-02 e 2026-10-08 → concluidaEm "2026-10-05"
//   entregueEm 2026-09-30, marca 2026-10-02 → "2026-10-02"
it("mesma prancha compartilhada e liberada: vale a marcação mais antiga", ...)
it("concluída sem nenhuma data tem concluidaEm null", ...)
it("prancha de outra fase ou Sem fase não conclui a fase", ...)
it("disciplina sem fase usa o próprio status e qualquer prancha dela", ...) // fases: [{ faseId: null, sigla: null, situacao: "concluida" }]
it("percentual soma os percentuais das concluídas sobre o total do plano", ...)
//   fases 30/30/40, só a primeira concluída → 30; plano em rascunho 20/20 (soma 40), uma concluída → 50
it("plano com percentuais zerados conta fases", ...)     // 0/0/0, uma concluída → 33
it("disciplina sem fase vale 0 ou 100; projeto é a média arredondada", ...) // [100, 33] → 67; sem disciplina → 0
it("fase concluída volta a Em andamento quando a prancha sai das Entregas", ...) // mesma entrada sem a marca

// linhaDoTempo
it("agrupa por dia, disciplina e tipo contando documentos", ...)
//   3 docs compartilhados no mesmo dia em d1 → 1 item { tipo: "compartilhado", quantidade: 3, texto: "3 pranchas compartilhadas com você" }
it("singular para uma prancha", ...)                    // "1 prancha compartilhada com você" / "1 prancha liberada para obra"
it("fase concluída vira item próprio", ...)              // { tipo: "fase_concluida", faseSigla: "EP", texto: "Fase EP concluída", quantidade: 1 }
it("marca sem data e fase concluída sem data ficam fora", ...)
it("ordena do mais novo; no mesmo dia: liberadas, compartilhadas, fases; depois a ordem das disciplinas", ...)
it("22h30 de Brasília fica no dia de São Paulo", ...)   // new Date("2026-10-03T01:30:00Z") → dia "2026-10-02"
```

- [ ] **Step 2: Rodar e ver falhar**

Run (PowerShell): `npx vitest run src/modules/portal/andamento.test.ts`
Expected: FAIL — módulo `./andamento` não existe.

- [ ] **Step 3: Implementar `src/modules/portal/andamento.ts`**

Cabeçalho com comentário curto apontando a spec e as decisões D2/D3/D5. `marcasDoConteudo` percorre `conteudo.situacoes[].disciplinas[].pastas[].extensoes[].arquivos[]`, deduplica por `chaveMarca` e lê `marcadaEm` do mapa (ausente = `null`). Datas comparadas por `getTime()`; `concluidaEm`/`dia` por `diaDeSaoPaulo`. Percentual: `Math.round`. Ordem das disciplinas = ordem do array de entrada.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/portal/andamento.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal/andamento.ts src/modules/portal/andamento.test.ts
git commit -m "feat(portal): regra do andamento por fase e da linha do tempo do cliente"
```

---

### Task 2: Leitura no banco, lista do portal e smoke

**Files:**
- Create: `src/modules/portal/andamento-queries.ts`
- Modify: `src/modules/portal/queries.ts` (sai `PESO`/`progresso`; `projetosDoCliente` usa o andamento; `projetoDoCliente` perde `progresso` e `disciplinas`)
- Create: `scripts/smoke-portal-andamento.ts`
- Modify: `package.json` (script `smoke:portal-andamento`), `CLAUDE.md` (linha do smoke na lista de comandos, depois de `smoke:portal-financeiro`)

**Interfaces:**
- Consumes: Task 1 inteira; `conteudoDoAlcance` (`link-publico.ts`), `alcanceDoPortal` (`link-publico-regras.ts`), `ROTULO_SITUACAO`, `SITUACOES`.
- Produces:

```ts
// andamento-queries.ts ("server-only")
export const conteudoDoPortal: (projetoId: string, codigo: string, nome: string) => Promise<ConteudoPublico | null>; // React cache()
export async function entradaDoAndamento(projetoId: string, conteudo: ConteudoPublico | null): Promise<{ disciplinas: DisciplinaEntrada[]; marcas: MarcaEntrada[] }>;
export async function andamentoDoPortal(projeto: { id: string; codigo: string; nome: string }): Promise<{ andamento: Andamento; linha: ItemLinhaDoTempo[]; conteudo: ConteudoPublico | null }>;
// queries.ts
projetosDoCliente(clienteId) → itens com `progresso: number` = andamento.percentual (mesmo shape de hoje)
projetoDoCliente(clienteId, projetoId) → { id, codigo, nome, situacao, endereco, prazoContrato }
```

- [ ] **Step 1: Implementar `entradaDoAndamento`**

Consultas (em sequência, sem transação):
1. `disciplina.findMany({ where: { projetoId }, orderBy: { ordem: "asc" }, select: { id, disciplinaTextoLegado, status, entregueEm, etapas: { orderBy: { ordem: "asc" }, select: { etapaId, status, entregueEm, percentual, ordem, etapa: { select: { sigla: true } } } } } })`; `percentual` via `Number()`; sigla nula cai no `nome` da fase.
2. Uploads do conteúdo: `upload.findMany({ where: { id: { in } }, select: { id, documentoId, revisaoId, revisao: { select: { numero: true } } } })`.
3. Controles ativos: `controleRevisao.findMany({ where: { revisaoId: { in }, removidoEm: null, tipo: { in: ["enviado_cliente", "liberado_obra"] } }, select: { revisaoId, tipo, aplicadoEm } })` — `enviado_cliente` ↔ `compartilhado`.
4. Eventos fora do ciclo: `documentoEvento.findMany({ where: { documentoId: { in }, tipo: "situacao_marcada" }, orderBy: { createdAt: "desc" }, select: { documentoId, detalhe, createdAt } })`; vale o primeiro (mais recente) com `detalhe.pasta === ROTULO_SITUACAO[situacao]` e `detalhe.revisao === numero` da revisão marcada.
Controle ganha do evento; nenhum = sem data. Monta os dois mapas e chama `marcasDoConteudo`.

- [ ] **Step 2: `conteudoDoPortal` e `andamentoDoPortal`**

`conteudoDoPortal = cache((id, codigo, nome) => conteudoDoAlcance(alcanceDoPortal({ id, codigo, nome })))` — argumentos primitivos para o cache acertar. `andamentoDoPortal` chama os dois e as funções puras.

- [ ] **Step 3: Ajustar `queries.ts`**

`projetosDoCliente`: depois do `findMany` (sem `disciplinas` no select), `for … of` sequencial chamando `andamentoDoPortal(p)` e preenchendo `progresso`. `projetoDoCliente`: tirar `disciplinas` e `progresso`. Remover `PESO`, `progresso()` e o import de `StatusDisciplina`.

- [ ] **Step 4: Escrever o smoke `scripts/smoke-portal-andamento.ts`**

Modelo: `scripts/smoke-portal-entregas.ts` (mesmo `check`, cliente/projeto throwaway, limpeza em `finally`). Cenário: projeto com disciplina "Estrutural" com fases EP (aprovada, `entregueEm` 2026-10-05) e BS (em_andamento) do catálogo global; documento EP fora do ciclo marcado como compartilhado via `revisaoCompartilhadaId` + `DocumentoEvento situacao_marcada` com `createdAt` 2026-10-02 e arquivo validado no disco (como o smoke de entregas cria). Checks:
- `[OK] fase EP concluída em 2026-10-05`, `[OK] fase BS em andamento`
- `[OK] linha do tempo tem "1 prancha compartilhada com você" em 2026-10-02 e "Fase EP concluída" em 2026-10-05`
- `[OK] percentual da lista igual ao do detalhe` (`projetosDoCliente` × `andamentoDoPortal`)
- documento dentro do ciclo: `ControleRevisao enviado_cliente` com `aplicadoEm` conhecido → `[OK] data vem do controle`
- `revisaoCompartilhadaId = null` → `[OK] prancha retirada sai da linha do tempo e EP volta a em andamento`
- `[OK] projeto de outro cliente não aparece em projetosDoCliente`

- [ ] **Step 5: Script e CLAUDE.md**

`package.json`: `"smoke:portal-andamento": "tsx --tsconfig tsconfig.server.json scripts/smoke-portal-andamento.ts"`. CLAUDE.md: `npm run smoke:portal-andamento       # andamento e linha do tempo do portal: fase concluída só com prancha nas Entregas, data do controle × do evento, prancha retirada sai, lista = detalhe`.

- [ ] **Step 6: Verificar**

Run: `npm run smoke:portal-andamento` → todas `[OK]`, exit 0.
Run: `npm run smoke:portal-entregas` → continua todo `[OK]`.
Run (PowerShell): `npx vitest run src/modules/portal` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/portal/andamento-queries.ts src/modules/portal/queries.ts scripts/smoke-portal-andamento.ts package.json CLAUDE.md
git commit -m "feat(portal): andamento lido das entregas, também na lista de projetos"
```

---

### Task 3: Tela — cards Andamento e Linha do tempo

**Files:**
- Create: `src/components/portal/andamento-card.tsx` (server component, sem `"use client"`)
- Create: `src/components/portal/linha-do-tempo-card.tsx` (`"use client"`, só pelo "Mostrar tudo")
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx`
- Modify: `docs/manual/inicio/portal-cliente.md` + `docs/manual/search-index.json`

**Interfaces:**
- Consumes: `andamentoDoPortal`, `conteudoDoPortal` (Task 2); tipos `Andamento`, `ItemLinhaDoTempo` (Task 1).
- Produces: `AndamentoCard({ andamento }: { andamento: Andamento })`, `LinhaDoTempoCard({ itens }: { itens: ItemLinhaDoTempo[] })`.

- [ ] **Step 1: `AndamentoCard`**

Título "Andamento (X% concluído)". Uma `<li>` por disciplina: nome + `div.flex.flex-wrap.gap-1.5` de chips. Chip = `Badge variant="outline"` com ícone lucide + texto: concluída `CheckCircle2` + `text-success-text` + "EP Concluída 02/10" (data com `formatarData`); em andamento `CircleDot` + "BS Em andamento"; não iniciada `Circle` + `text-muted-foreground` + "EX Não iniciada". Disciplina sem fase: chip sem sigla ("Concluída 02/10"). Vazio: `EmptyState icon={FolderOpen} title="Nenhuma disciplina cadastrada."`.

- [ ] **Step 2: `LinhaDoTempoCard`**

`<ol>` com `formatarData(dia)` em `font-mono text-xs`, disciplina em `font-medium`, `texto`. Estado `mostrarTudo` (10 primeiros; botão `Button variant="ghost" size="sm"` "Mostrar tudo (N)" só se `itens.length > 10`). Vazio: `EmptyState icon={History} title="Ainda não há entregas neste projeto."`.

- [ ] **Step 3: Página**

Tirar o card "Disciplinas", `STATUS_CHIP`/`STATUS_LABEL`/`Badge` se ficarem sem uso. Um componente async `AndamentoEEntregas({ projeto })` dentro do `LimiteErroEntregas` + `Suspense` atual: chama `andamentoDoPortal(projeto)` e rende `AndamentoCard`, `LinhaDoTempoCard` e o card Entregas (o `EntregasDoProjeto` passa a receber `entregas` em vez de ler — a leitura é a do `conteudoDoPortal`, cacheada). Fallback: o esqueleto atual mais dois cards esqueleto (Andamento, Linha do tempo) com `aria-busy` e `role="status"` como `EntregasCarregando`. O topo (prazo do contrato, endereço) fica fora do Suspense.

- [ ] **Step 4: Manual**

Em `docs/manual/inicio/portal-cliente.md`: seção curta "Andamento e linha do tempo" — o que cada situação quer dizer (concluída = já recebeu pranchas da fase), que o portal não mostra datas previstas, que a linha do tempo mostra o que está nas Entregas. Atualizar `docs/manual/search-index.json` como no commit `9d29cb68`.

- [ ] **Step 5: Verificar**

Run: `npm run lint` → sem erro. Run (PowerShell): `npx vitest run` → PASS (inclui guardas). `npx tsc --noEmit` (com `NODE_OPTIONS=--max-old-space-size=8192`) → sem erro em `src/`.

- [ ] **Step 6: Commit**

```bash
git add src/components/portal/andamento-card.tsx src/components/portal/linha-do-tempo-card.tsx "src/app/(dashboard)/portal/[projetoId]/page.tsx" docs/manual/inicio/portal-cliente.md docs/manual/search-index.json
git commit -m "feat(portal): cards de andamento por fase e linha do tempo no projeto do cliente"
```

---

### Task 4: Auditoria final

- [ ] Reler e seguir `docs/PROTOCOLO_AUDITORIA_FINAL.md` (nível 2; subir se aparecer risco de escopo).
- [ ] Tela pelo agente: usuário externo de demo com termo aceito, projeto com fases e entregas; 1366×768 (menu aberto) e 390×844, claro e escuro; `document.documentElement.scrollWidth === 390`; prints + `LEIAME.md` em `prints-auditoria/2026-11-19_<hora>_portal-andamento/`.
- [ ] Revisores: `design-system-guardian` e `a11y-auditor` no diff da Task 3.
- [ ] Corrigir o que estiver no escopo, rodar de novo os checks e entregar o relatório em pt-BR.
