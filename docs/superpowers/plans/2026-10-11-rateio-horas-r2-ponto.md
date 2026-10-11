# Rateio de horas — R2: ponto com disciplina, reunião em projeto e quem pode marcar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (sessões 2 a 4 do roteiro). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda sessão de trabalho grava a disciplina (pela tarefa ou automática), reunião pode ser ligada a um projeto, e o servidor recusa horas em projeto de que a pessoa não participa.

**Architecture:** Duas regras puras novas em `src/modules/ponto/disciplina-sessao.ts` (qual disciplina; pode marcar?) e a extensão da codificação de alocação em `alocacao.ts` (`__reuniao_interna:<projetoId>`). Um resolvedor com I/O (`resolverDestinoDaSessao`) é chamado por TODO caminho que cria sessão. O rateio passa a agrupar por disciplina e a margem separa "Reuniões".

**Tech Stack:** Next.js 15, Prisma 7, Zod, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md](../specs/2026-09-15-rateio-horas-decisoes.md) — decisões 10, 11, 12. Roteiro e sessões: [plano da R1, seção "Execução de R2 a R5"](2026-10-11-rateio-horas-r1-custo-da-hora.md).

**Schema:** já aplicado na sessão 1 (migração `20261011150000_rateio_r2_r5`): `Batida.tipoAlocacao`, `SessaoTrabalho.disciplinaId`, `RateioHora.disciplinaId`, índice único `rateio_hora_linha_key` com disciplina.

## Global Constraints

- Mesmas da R1 (pt-BR na tela, `defineAction`, `ActionError`, sem `Promise.all` em transação, Prisma de `@/generated/prisma`).
- A escolha da tarefa continua **opcional**, exceto para quem é responsável por **duas ou mais** disciplinas no projeto (decisão 12/44a).
- Correção de ponto (edição do dia) **nunca falha** por causa de disciplina: sem tarefa e com 2+ disciplinas, a sessão fica sem disciplina.
- A regra "quem pode marcar" vale para marcação ao vivo (`aplicarBatida`, `trocarProjeto`, apontamento) e para a edição do PRÓPRIO dia; a edição feita pelo RH (`ajustarPontoEquipe`) não é bloqueada por ela.
- Reunião sem projeto continua valendo exatamente como hoje.

## Review Focus

1. **Edição do dia com reunião:** a batida que abre uma reunião ligada ao projeto X, depois de editar o horário do dia, continua reunião em X (não vira "sem projeto").
2. **Pessoa com card no projeto, fora da equipe:** consegue marcar; a disciplina vem do card.
3. **Pessoa removida da equipe com jornada aberta no projeto:** a sessão aberta não some nem trava a saída — só a próxima troca é recusada.
4. **Duas disciplinas e tarefa sem disciplina (card manual):** aceita, sessão sem disciplina.
5. **Rateio de um mês antigo (cálculo legado):** as linhas continuam sem disciplina e o fechamento não quebra no índice único novo.

---

### Task R2.1: Regras puras — disciplina da sessão e quem pode marcar (sessão 2, Sonnet high)

**Files:**
- Create: `src/modules/ponto/disciplina-sessao.ts`
- Test: `src/modules/ponto/disciplina-sessao.test.ts`
- Modify: `src/modules/ponto/alocacao.ts` (+ teste existente `alocacao.test.ts`)

**Interfaces — Produces:**
- `motivoParaNaoMarcarNoProjeto(p: { membro: boolean; responsavelDeDisciplina: boolean; temCardAberto: boolean }): string | null`
- `disciplinaDaSessao(p: { disciplinaDaTarefa: string | null | undefined; tarefaEscolhida: boolean; disciplinasDaPessoa: string[]; exigirTarefa: boolean }): { disciplinaId: string | null } | { erro: string }`
- `normalizarAlocacaoPonto(selecao)` passa a aceitar `__reuniao_interna:<projetoId>` / `__reuniao_externa:<projetoId>` e devolve `{ projetoId, tipoAlocacao }` com o projeto
- `selecaoDaAlocacaoPonto(projetoId, tipoAlocacao)` devolve a forma com `:` quando é reunião com projeto
- `MSG_SEM_ACESSO_PROJETO`, `MSG_TAREFA_OBRIGATORIA` (strings exportadas)

- [ ] **Step 1: Testes que falham**

```ts
// src/modules/ponto/disciplina-sessao.test.ts
import { describe, expect, it } from "vitest";
import { disciplinaDaSessao, motivoParaNaoMarcarNoProjeto, MSG_SEM_ACESSO_PROJETO, MSG_TAREFA_OBRIGATORIA } from "./disciplina-sessao";

describe("motivoParaNaoMarcarNoProjeto (decisão 11 e 44b)", () => {
  it("equipe, responsável de disciplina ou card aberto podem marcar", () => {
    expect(motivoParaNaoMarcarNoProjeto({ membro: true, responsavelDeDisciplina: false, temCardAberto: false })).toBeNull();
    expect(motivoParaNaoMarcarNoProjeto({ membro: false, responsavelDeDisciplina: true, temCardAberto: false })).toBeNull();
    expect(motivoParaNaoMarcarNoProjeto({ membro: false, responsavelDeDisciplina: false, temCardAberto: true })).toBeNull();
  });
  it("quem não tem nenhum dos três é recusado", () => {
    expect(motivoParaNaoMarcarNoProjeto({ membro: false, responsavelDeDisciplina: false, temCardAberto: false })).toBe(MSG_SEM_ACESSO_PROJETO);
  });
});

describe("disciplinaDaSessao (decisões 8, 12 e 44a)", () => {
  it("a tarefa escolhida manda", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: "d2", tarefaEscolhida: true, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: true })).toEqual({ disciplinaId: "d2" });
  });
  it("tarefa sem disciplina (card manual) deixa a sessão sem disciplina", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: null, tarefaEscolhida: true, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: true })).toEqual({ disciplinaId: null });
  });
  it("uma disciplina só: automática, tarefa opcional", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1"], exigirTarefa: true })).toEqual({ disciplinaId: "d1" });
  });
  it("nenhuma disciplina: coordenação/apoio, sem disciplina", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: [], exigirTarefa: true })).toEqual({ disciplinaId: null });
  });
  it("duas ou mais sem tarefa: ao vivo exige a tarefa", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: true })).toEqual({ erro: MSG_TAREFA_OBRIGATORIA });
  });
  it("duas ou mais sem tarefa na correção do dia: fica sem disciplina, nunca falha", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: false })).toEqual({ disciplinaId: null });
  });
});
```

Em `src/modules/ponto/alocacao.test.ts`, acrescentar:

```ts
describe("reunião ligada a projeto (decisão 10)", () => {
  it("codifica e decodifica o projeto da reunião", () => {
    expect(normalizarAlocacaoPonto("__reuniao_externa:p1")).toEqual({ projetoId: "p1", tipoAlocacao: "reuniao_externa" });
    expect(normalizarAlocacaoPonto("__reuniao_interna:p2")).toEqual({ projetoId: "p2", tipoAlocacao: "reuniao_interna" });
    expect(selecaoDaAlocacaoPonto("p1", "reuniao_externa")).toBe("__reuniao_externa:p1");
    expect(selecaoDaAlocacaoPonto(null, "reuniao_interna")).toBe("__reuniao_interna");
  });
  it("reunião com projeto não é 'projeto' para a escolha de tarefa", () => {
    expect(selecaoEhProjeto("__reuniao_externa:p1")).toBe(false);
  });
});
```

(importar `selecaoEhProjeto` e `selecaoDaAlocacaoPonto` se o arquivo de teste ainda não importa.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/ponto/disciplina-sessao.test.ts src/modules/ponto/alocacao.test.ts` → falha de import / asserção.

- [ ] **Step 3: Implementação**

```ts
// src/modules/ponto/disciplina-sessao.ts
/**
 * Regras da disciplina da sessão e de quem pode marcar horas num projeto (R2 do rateio,
 * decisões 8, 11, 12 e 44 do spec 2026-09-15-rateio-horas-decisoes.md). PURO.
 */
export const MSG_SEM_ACESSO_PROJETO =
  "Você não faz parte deste projeto: só a equipe, os responsáveis pelas disciplinas e quem tem card no projeto marcam horas nele.";
export const MSG_TAREFA_OBRIGATORIA =
  "Você é responsável por mais de uma disciplina neste projeto: escolha a tarefa em que vai trabalhar.";

export function motivoParaNaoMarcarNoProjeto(p: { membro: boolean; responsavelDeDisciplina: boolean; temCardAberto: boolean }): string | null {
  return p.membro || p.responsavelDeDisciplina || p.temCardAberto ? null : MSG_SEM_ACESSO_PROJETO;
}

/**
 * Disciplina da sessão: a da tarefa escolhida; sem tarefa, a única de que a pessoa é responsável no
 * projeto; nenhuma = coordenação/apoio (null). Com 2+ e sem tarefa, a marcação AO VIVO exige a
 * tarefa (`exigirTarefa`); a correção do dia nunca falha e deixa sem disciplina.
 */
export function disciplinaDaSessao(p: {
  disciplinaDaTarefa: string | null | undefined;
  tarefaEscolhida: boolean;
  disciplinasDaPessoa: string[];
  exigirTarefa: boolean;
}): { disciplinaId: string | null } | { erro: string } {
  if (p.tarefaEscolhida) return { disciplinaId: p.disciplinaDaTarefa ?? null };
  const unicas = [...new Set(p.disciplinasDaPessoa)];
  if (unicas.length === 1) return { disciplinaId: unicas[0] };
  if (unicas.length === 0) return { disciplinaId: null };
  return p.exigirTarefa ? { erro: MSG_TAREFA_OBRIGATORIA } : { disciplinaId: null };
}
```

Em `alocacao.ts`:

```ts
const PREFIXOS_REUNIAO = {
  [ALOCACAO_REUNIAO_INTERNA]: "reuniao_interna",
  [ALOCACAO_REUNIAO_EXTERNA]: "reuniao_externa",
} as const;

export function normalizarAlocacaoPonto(selecao?: string | null): { projetoId: string | null; tipoAlocacao: TipoAlocacaoPonto } {
  if (selecao) {
    // Reunião ligada a projeto (decisão 10): "__reuniao_externa:<projetoId>".
    const [base, projeto] = selecao.split(":");
    if (projeto && base in PREFIXOS_REUNIAO) {
      return { projetoId: projeto, tipoAlocacao: PREFIXOS_REUNIAO[base as keyof typeof PREFIXOS_REUNIAO] };
    }
  }
  switch (selecao) { /* ...o switch atual, sem mudança... */ }
}

export function selecaoDaAlocacaoPonto(projetoId: string | null, tipoAlocacao: TipoAlocacaoPonto): string {
  if (projetoId && tipoAlocacao === "reuniao_interna") return `${ALOCACAO_REUNIAO_INTERNA}:${projetoId}`;
  if (projetoId && tipoAlocacao === "reuniao_externa") return `${ALOCACAO_REUNIAO_EXTERNA}:${projetoId}`;
  /* ...corpo atual... */
}
```

`selecaoEhProjeto` continua `normalizarAlocacaoPonto(selecao).tipoAlocacao === "projeto"` (reunião com projeto devolve `false`, sem tarefa).

Atenção: `motivoTarefaInvalida` (`tarefa-ponto.ts:160`) já recusa tarefa quando `tipoAlocacao !== "projeto"` — não muda.

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(ponto): regras da disciplina da sessão e de quem marca horas no projeto (puro)`.

---

### Task R2.2: Resolver o destino em todo caminho que cria sessão (sessão 3, Opus high)

**Files:**
- Create: `src/modules/ponto/destino-sessao.ts` (I/O)
- Modify: `src/modules/ponto/service.ts` (`aplicarBatida`, `reconciliarSessoesDoDia`, `editarDia` e quem lê batidas para editar), `src/modules/ponto/apontamento.ts` (`abrirApontamento`, `trocarApontamento`), `src/modules/ponto/actions.ts` (`trocarProjeto`), `src/modules/ponto/queries.ts` (onde as batidas viram itens de edição)
- Test: `scripts/smoke-ponto-disciplina.ts` + `package.json` (`smoke:ponto-disciplina`)

**Interfaces:**
- Consumes: `disciplinaDaSessao`, `motivoParaNaoMarcarNoProjeto` (R2.1), `resolverTarefaDoPonto` (existente).
- Produces: `resolverDestinoDaSessao(db, p: { userId: string; alocacao: { projetoId: string | null; tipoAlocacao: TipoAlocacaoPonto }; tarefaId?: string | null; quando: Date; aoVivo: boolean; checarAcesso: boolean }): Promise<{ tarefaId: string | null; disciplinaId: string | null }>` — lança `ActionError` com as frases de R2.1.

- [ ] **Step 1:** Escrever `destino-sessao.ts`:
  - `tarefaId = await resolverTarefaDoPonto(db, userId, alocacao, p.tarefaId)` (inalterado).
  - Sem projeto (`alocacao.projetoId == null`) → `{ tarefaId, disciplinaId: null }`.
  - Com projeto e `checarAcesso`: ler em paralelo **fora** de transação (ou em série se `db` for um `tx`) `projetoMembro` (projetoId+userId), `disciplinaResponsavel` (disciplina do projeto + userId) e `tarefa` aberta atribuída (`arquivada: false, status.concluido: false, responsaveis.some(userId)`) → `motivoParaNaoMarcarNoProjeto`. Recusar com `ActionError`.
  - Reunião com projeto (`tipoAlocacao` reunião) → `disciplinaId: null` sempre (decisão 15: reunião sem disciplina).
  - Projeto: disciplinas da pessoa no projeto **na data `quando`** — enquanto R5.2 não existir, as atuais (`disciplinaResponsavel`); a R5.2 troca esta leitura pelo histórico. `disciplinaDaTarefa` = `tarefa.disciplinaId` quando `tarefaId`. Aplicar `disciplinaDaSessao({ ..., exigirTarefa: aoVivo })`; `erro` → `ActionError`.
  - Toda leitura com `db` de transação deve ser **sequencial** (guarda `promise-all-em-transacao`).
- [ ] **Step 2:** Ligar nos caminhos (gravar `disciplinaId` na sessão e `tipoAlocacao` na batida):
  - `aplicarBatida` (abre sessão): `resolverDestinoDaSessao(tx, { ..., quando: horario, aoVivo: true, checarAcesso: true })`; `batida.create` grava `tipoAlocacao: alocacao.tipoAlocacao`.
  - `trocarProjeto` e `trocarApontamento`: ao vivo, checando acesso, ANTES de fechar a sessão atual.
  - `abrirApontamento`: ao vivo, checando acesso.
  - `reconciliarSessoesDoDia`: para cada intervalo, `resolverDestinoDaSessao(tx, { ..., quando: it.inicio, aoVivo: false, checarAcesso: false })` — nunca falha por disciplina.
  - `editarDia` (próprio): validar acesso dos projetos das batidas novas com `checarAcesso: true` antes da transação; edição de terceiros (`proprio: false`) não checa.
  - Onde o editor recebe as batidas do banco (procure `herdarTarefasNaEdicao` e a montagem de `ItemEdicaoBatida` em `queries.ts`/`registro-view.tsx`): o `projetoId` do item passa a ser `selecaoDaAlocacaoPonto(batida.projetoId, batida.tipoAlocacao ?? (batida.projetoId ? "projeto" : "sem_projeto"))`, para a reunião sobreviver à edição.
- [ ] **Step 3:** Smoke `scripts/smoke-ponto-disciplina.ts` (banco de dev; cria e apaga os próprios dados, como `smoke-ponto-tarefa.ts`): (a) pessoa com 1 disciplina → sessão com ela; (b) 2 disciplinas sem tarefa → recusa com `MSG_TAREFA_OBRIGATORIA`; com tarefa → disciplina da tarefa; (c) fora da equipe e sem card → `MSG_SEM_ACESSO_PROJETO`; com card → aceita; (d) reunião externa no projeto → sessão `reuniao_externa` com projeto e sem disciplina; editar o dia mantém a reunião; (e) edição do RH com 2 disciplinas sem tarefa → sessão sem disciplina, sem erro.
- [ ] **Step 4:** `npx vitest run src/modules/ponto`, `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`, `npm run smoke:ponto-disciplina`, `npm run smoke:ponto-tarefa` (regressão).
- [ ] **Step 5: Commit** — `feat(ponto): disciplina na sessão, reunião em projeto e acesso conferido no servidor`.

---

### Task R2.3: Rateio por disciplina e "Reuniões" na margem (sessão 3, Opus high)

**Files:**
- Modify: `src/modules/rh/rateio/custo-hora/distribuicao.ts` (`SessaoNoMes` ganha `disciplinaId`; `linhasDaPessoa` agrupa por natureza × projeto × disciplina; `LinhaDaPessoa` ganha `disciplinaId`) + `auditoria.test.ts`
- Modify: `src/modules/rh/rateio/queries.ts` (`calcularRateioV2` lê `disciplinaId`; `LinhaRateio.disciplinaId`; legado = `null`), `src/modules/rh/rateio/actions.ts` (grava `disciplinaId`)
- Modify: `src/modules/projetos/rateio-composicao.ts` + teste (separa `reunioes`), `src/modules/projetos/queries.ts` (`margemProjeto` lê `natureza`), `src/components/projetos/margem-donut.tsx` (linha "Reuniões")

- [ ] **Step 1: Testes que falham** em `auditoria.test.ts`: duas sessões no mesmo projeto em disciplinas diferentes viram duas linhas; reunião com projeto fica `natureza: "reuniao"`, `disciplinaId: null`; a soma continua igual ao custo do mês. Em `rateio-composicao.test.ts`: linha `natureza: "reuniao"` soma em `reunioes`, não em `cltEstagiarios`.
- [ ] **Step 2:** Ver falhar; implementar (chave do grupo `${natureza}|${projetoId ?? ""}|${disciplinaId ?? ""}`); reunião nunca carrega disciplina.
- [ ] **Step 3:** `margemProjeto`: `separarRateioPorVinculo` recebe `natureza`; devolve `{ cltEstagiarios, demaisColaboradores, reunioes, total }`; `MargemDonut` mostra "Reuniões" (só se > 0).
- [ ] **Step 4:** `npx vitest run src/modules/rh src/modules/projetos`, tsc, `npm run smoke:rateio-custo-hora`.
- [ ] **Step 5: Commit** — `feat(rateio): linha por disciplina e reuniões separadas no custo do projeto`.

---

### Task R2.4: Seletor do ponto — reunião com projeto e tarefa obrigatória (sessão 4, Sonnet medium)

**Files:**
- Modify: `src/components/ponto/jornada-header.tsx`, `src/components/ponto/registro-view.tsx`, `src/components/ponto/apontamento-view.tsx`, `src/components/ponto/use-jornada.ts`
- Modify: `src/modules/ponto/queries.ts` (`projetosDoUsuario` passa a devolver `disciplinasDaPessoa: number` por projeto, para a tela saber quando a tarefa é obrigatória)

- [ ] **Step 1:** Quando a alocação escolhida é "Reunião interna" ou "Reunião externa", mostrar um segundo `Select` "Projeto da reunião (opcional)" com os mesmos projetos; o valor enviado à ação é `__reuniao_interna:<projetoId>` (ou só `__reuniao_interna` sem projeto). Rótulo da sessão em andamento: "Reunião externa · <código> <nome>".
- [ ] **Step 2:** Projeto com `disciplinasDaPessoa >= 2`: o seletor de tarefa ganha o rótulo "Tarefa (obrigatória)" e o botão de confirmar fica desabilitado sem tarefa, com a frase `MSG_TAREFA_OBRIGATORIA` ao lado (o servidor recusa igual).
- [ ] **Step 3:** Erros do servidor (`MSG_SEM_ACESSO_PROJETO`) aparecem no toast já existente.
- [ ] **Step 4:** Conferir no navegador (porta 3001): computador e 390×844; reunião com e sem projeto; pessoa de 2 disciplinas. Prints da sessão 5.
- [ ] **Step 5: Commit** — `feat(ponto): reunião ligada a projeto e tarefa obrigatória no seletor`.
