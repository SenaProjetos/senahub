# Rateio de horas — R5: papel fixo, histórico de responsáveis, horas por disciplina e quem vê o quê

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (sessões 2 a 4 do roteiro). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O papel do membro do projeto vira lista fixa; toda troca de responsável de disciplina fica registrada com data e a correção de ponto usa a disciplina daquela data; o projeto mostra horas orçadas × planejadas × realizadas por disciplina; horas e custo aparecem só para quem pode vê-los.

**Architecture:** Três módulos puros: `src/modules/projetos/papeis.ts` (lista e rótulos), `src/modules/projetos/responsaveis.ts` (diferença entre a lista antiga e a nova → linhas do histórico) e `src/modules/projetos/horas-disciplina.ts` (junta orçado/planejado/realizado e filtra pelo que a pessoa pode ver). Um serviço único `substituirResponsaveis` troca os responsáveis E grava o histórico — todos os caminhos que hoje fazem `deleteMany` + `createMany` em `DisciplinaResponsavel` passam por ele.

**Tech Stack:** Next.js 15, Prisma 7, Zod, Vitest.

**Spec:** [docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md](../specs/2026-09-15-rateio-horas-decisoes.md) — decisões 13, 16, 19, 25, 26. Roteiro: [plano da R1](2026-10-11-rateio-horas-r1-custo-da-hora.md). Depende de R2 (disciplina na sessão) e de R3.2 (`podeVerCusto`).

**Schema:** já aplicado (migração `20261011150000_rateio_r2_r5`): papel normalizado em `projeto_membro` (texto: `coordenador | projetista | apoio | estagiario | consultor_externo` ou nulo), model `DisciplinaResponsavelHistorico` com carga inicial (responsáveis atuais desde a criação da disciplina).

## Global Constraints

- Mesmas da R1. Papel continua `String?` no banco; a lista é validada em Zod (`z.enum(PAPEIS_PROJETO).nullable()`).
- **Coordenador** (decisão 18/35): papel `coordenador` NO projeto OU perfil de acesso `coordenador` (`user.perfilChave === "coordenador"`).
- **Horas** (decisão 19): coordenador vê por pessoa; os demais membros veem só as próprias e o total por disciplina. **Custo em reais**: só `podeVerCusto` (decisão 26: admin e sócios), sempre filtrado no SERVIDOR — o cliente nunca recebe reais que não pode ver.
- Orçado = horas da **primeira** linha de base do projeto (menor `numero`), só linhas-folha (`resumo = false`), por `tarefa.disciplinaId`. Planejado = soma de `EapAtribuicao.horasPrevistas` das linhas-folha atuais. Realizado = minutos de `SessaoTrabalho` com `disciplinaId` (de todos os tempos).

## Review Focus

1. **Responsável trocado e depois corrigido o ponto de um dia antigo:** a sessão do dia antigo fica com a disciplina de quem era responsável NAQUELE dia.
2. **Duplicar projeto:** o histórico da cópia começa na data da duplicação, não herda o do original.
3. **Projetista que não é coordenador:** vê só as próprias horas por pessoa; os totais por disciplina somam todo mundo; nenhum valor em reais.
4. **Coordenação (perfil coordenador, sem ser sócio):** vê horas de todos, nunca reais — inclusive no card do Ponto (hoje mostra).
5. **Linha de base apagada ou projeto sem linha de base:** orçado aparece "—", sem erro.

---

### Task R5.1: Regras puras (sessão 2, Sonnet high)

**Files:**
- Create: `src/modules/projetos/papeis.ts` + `papeis.test.ts`
- Create: `src/modules/projetos/responsaveis.ts` + `responsaveis.test.ts`
- Create: `src/modules/projetos/horas-disciplina.ts` + `horas-disciplina.test.ts`

**Interfaces — Produces:**
```ts
// papeis.ts
export const PAPEIS_PROJETO = ["coordenador", "projetista", "apoio", "estagiario", "consultor_externo"] as const;
export type PapelProjeto = (typeof PAPEIS_PROJETO)[number];
export const ROTULO_PAPEL: Record<PapelProjeto, string>; // Coordenador, Projetista, Apoio, Estagiário, Consultor externo
export function rotuloPapel(p: string | null): string; // "Sem papel" quando nulo ou fora da lista
export function ehCoordenador(p: { papelNoProjeto: string | null; perfilChave: string | null }): boolean;

// responsaveis.ts
export function diffResponsaveis(atuais: string[], novos: string[]): { entram: string[]; saem: string[] };
export function disciplinasNaData(historico: { disciplinaId: string; inicio: Date; fim: Date | null }[], quando: Date): string[];

// horas-disciplina.ts
export type LinhaHoras = { disciplinaId: string; nome: string; orcadoMin: number | null; planejadoMin: number; realizadoMin: number; porPessoa: { userId: string; nome: string; minutos: number }[]; custoCent: number | null };
export function montarHorasPorDisciplina(p: {
  disciplinas: { id: string; nome: string }[];
  orcado: { disciplinaId: string; horas: number }[] | null;   // null = sem linha de base
  planejado: { disciplinaId: string; horas: number }[];
  realizado: { disciplinaId: string; userId: string; nome: string; minutos: number }[];
  custo: { disciplinaId: string; cent: number }[];
  viewer: { userId: string; coordenador: boolean; podeVerCusto: boolean };
}): LinhaHoras[];
```

- [ ] **Step 1: Testes que falham** (resumo dos casos — escrever cada um com valores concretos):
  - `papeis`: `rotuloPapel("consultor_externo")` = "Consultor externo"; `rotuloPapel("xyz")` = "Sem papel"; `ehCoordenador({ papelNoProjeto: null, perfilChave: "coordenador" })` = true; `({ papelNoProjeto: "projetista", perfilChave: "projetista" })` = false.
  - `diffResponsaveis(["a","b"], ["b","c"])` = `{ entram: ["c"], saem: ["a"] }`; listas iguais = nada.
  - `disciplinasNaData`: período `[01/09, 30/09)` conta em 15/09 e não em 30/09 (fim exclusivo); `fim` nulo conta sempre depois do início.
  - `montarHorasPorDisciplina`: viewer não coordenador recebe `porPessoa` só com ele mesmo, mas `realizadoMin` com o total de todos; `custoCent` nulo sem `podeVerCusto`; `orcadoMin` nulo quando `orcado` é null; horas → minutos (`Math.round(h * 60)`); disciplina sem nada fica com zeros (não some).
- [ ] **Step 2:** Ver falhar. **Step 3:** Implementar (sem I/O). **Step 4:** Ver passar. **Step 5:** Commit `feat(projetos): papel fixo, histórico de responsáveis e horas por disciplina (puro)`.

---

### Task R5.2: `substituirResponsaveis` e disciplina na data (sessão 3, Opus high)

**Files:**
- Create: `src/modules/projetos/responsaveis-service.ts` → `substituirResponsaveis(tx, disciplinaId, novos: string[], quando = new Date())`: lê os atuais, `diffResponsaveis`, `deleteMany`/`createMany` em `DisciplinaResponsavel` só da diferença, fecha (`fim = quando`) o histórico aberto de quem sai e abre linha para quem entra. Tudo sequencial dentro do `tx`.
- Create: `disciplinasDaPessoaNaData(db, userId, projetoId, quando)` (mesmo arquivo) — lê o histórico e usa `disciplinasNaData`.
- Modify: `src/modules/projetos/actions.ts` (os 4 pontos: linhas ~528, ~736, ~802, ~933) e `src/modules/projetos/duplicar-service.ts:166` para chamar o serviço; `src/modules/ponto/destino-sessao.ts` (R2.2) troca a leitura das disciplinas atuais por `disciplinasDaPessoaNaData(..., quando)`.
- Test: guarda nova `src/modules/projetos/responsaveis-guarda.test.ts` que varre `src/` e falha se `disciplinaResponsavel.(create|createMany|delete|deleteMany)` aparecer fora de `responsaveis-service.ts` (mesmo padrão das guardas existentes, ex.: `src/lib/promise-all-em-transacao.test.ts`).
- Smoke: em `scripts/smoke-ponto-disciplina.ts` (R2.2), caso novo — trocar o responsável, corrigir o dia antigo pelo RH, conferir a disciplina da data.

- [ ] Steps: guarda que falha (os 5 pontos atuais) → serviço → ligar os pontos → guarda passa → smoke → commit `feat(projetos): histórico de responsáveis por disciplina e correção de ponto pela data`.

---

### Task R5.3: Horas por disciplina e custo só para quem vê custo (sessão 3, Opus high)

**Files:**
- Create: `src/modules/projetos/horas-disciplina-queries.ts` → `horasPorDisciplina(viewer, projetoId)`: orçado (linha de base de menor número, linhas-folha, `tarefa.disciplinaId`), planejado (`EapAtribuicao` das linhas-folha), realizado (`SessaoTrabalho` agrupado por disciplina e pessoa), custo (`RateioHora` fechado por disciplina — só se `podeVerCusto`), `ehCoordenador` pelo papel do viewer no projeto e pelo perfil; chama `montarHorasPorDisciplina`.
- Modify: `src/modules/rh/rateio/queries.ts` (`rateioMesGestor(ano, mes, podeVerCusto)`: sem permissão, devolve horas e zera/omite `custo*` — os campos de reais ficam `null` e o tipo do card aceita `null`), `src/app/(dashboard)/ponto/page.tsx` (passa `podeVerCusto`), `src/modules/projetos/actions.ts` (`definirMembros`: `papel: z.enum(PAPEIS_PROJETO).nullable()`), `src/modules/comercial/service.ts:847` (continua gravando `"coordenador"` — conferir).

- [ ] Steps: smoke de leitura em `scripts/smoke-horas-disciplina.ts` (projeto do `ensaio:eap`: orçado da BL-00, planejado da EAP, realizado das sessões; viewer projetista não recebe `porPessoa` de outros nem reais) → implementação → `npx vitest run src/modules/projetos src/modules/rh`, tsc, smokes → commit `feat(projetos): horas orçadas × planejadas × realizadas por disciplina, com custo só para quem vê`.

---

### Task R5.4: Telas (sessão 4, Sonnet medium)

**Files:**
- Modify: `src/components/projetos/equipe-manager.tsx` (papel vira `Select` com `PAPEIS_PROJETO` e "Sem papel"; rótulos por `rotuloPapel`), `src/components/projetos/projeto-visao-geral.tsx` (card "Horas por disciplina": tabela disciplina × orçado × planejado × realizado, barra de consumo realizado/orçado, expandir "por pessoa" quando houver; coluna de custo só se vier), `src/components/ponto/ponto-view.tsx` (card do rateio esconde reais quando vierem `null`)
- Create: `src/components/projetos/horas-disciplina-card.tsx`

- [ ] Steps: implementar; navegador com três usuários do `ensaio:eap` (coordenador, projetista, sócio/admin) em 1366 e 390; prints da sessão 5; commit `feat(projetos): horas por disciplina no projeto e papel em lista fixa`.
