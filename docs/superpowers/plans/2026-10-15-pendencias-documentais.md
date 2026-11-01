# Pendências documentais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar aos administradores uma tela `/arquivos/pendencias` com todas as pendências do ciclo documental (lixeira, análise parada, duas publicadas, correções automáticas), com orientação do que fazer e dispensa com motivo, e fazer o aviso diário do job virar um resumo que leva à tela.

**Architecture:** A tela calcula as pendências ao vivo com a mesma varredura do job (`encontrarViolacoes`), sem gravar. Uma tabela nova (`DispensaPendenciaCiclo`) guarda as dispensas por assinatura do estado: se o estado mudar, a pendência reaparece. A escrita passa por `defineAction` + serviço transacional que revalida a assinatura e grava `DocumentoEvento`. `ciclo/service.ts` (máquina de estados) não é tocado.

**Tech Stack:** Next.js 15 / React 19, Prisma 7 (PostgreSQL), Zod, Vitest (env node), base-ui via shadcn, `tsx` para smokes.

**Spec:** [docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md](../specs/2026-10-15-pendencias-documentais-design.md) · Mockup aprovado: https://claude.ai/artifact/BvaZxC8DL8qckLhtDAuKwk (versão 2)

## Global Constraints

- UI e commits em **pt-BR**; identificadores seguem o padrão do módulo (`modules/uploads/ciclo/` já usa nomes em português).
- Toda mutação por `defineAction` (`lib/with-action.ts`): auditoria automática. Gate das ações e da tela: `notificacoes:gestao` (par que já existe — **não criar permissão, não mexer no seed**).
- Arquivo `"use server"` exporta **só funções async** (constantes/schemas ficam em arquivo à parte). Quebra em runtime, não em tsc.
- Sem `Promise.all` em cliente de transação (`$transaction`): `await` um a um. Há teste-guarda que varre `src/`.
- Módulos puros (`pendencias.ts`, `pendencias-filtro.ts`, `acoes-pendencia.ts`, `guia-pendencia.ts`, `pendencias-schemas.ts`) **não importam** Prisma, `server-only` nem Next.
- `CabecalhoPagina` é o **primeiro elemento** da página; descrição sem link/botão.
- Menu de contexto, `...` e barra de lote saem do **mesmo** `AcaoItem[]` (ADR-0002). Nunca escrever `contextmenu` à mão. `await confirm()` antes de `startTransition`.
- Tela pronta só quando, a 390×844, `document.documentElement.scrollWidth === 390` e, a 1366×768 com o menu **aberto**, o cabeçalho não sobrepõe a barra do topo.
- Commits: `git add <arquivos específicos>` (nunca `-A`/`.`), conferir com `git show --stat`. **Sem push.** Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Este worktree: pasta `SENAHub-remake-vscode`, branch `dev-vscode`, porta 3001, banco `senahub_remake_vscode`. Não tocar no outro worktree.
- Rodar `npx eslint` **sem** `--quiet` (avisos já denunciaram UI faltando).

## Review Focus

Entradas/condições que o spec implica mas nenhuma tarefa óbvia testaria; cada linha tem o teste na tarefa dona:

1. **Dispensa velha herdada por ocorrência nova** (dispensou com 1 arquivo na lixeira; chega a 2; volta a 1 → a assinatura volta a ser igual e a dispensa antiga voltaria a valer calada). Esperado: dispensa sem assinatura correspondente é **encerrada** pelo job. → Task 1 (`dispensasObsoletas`), Task 4 (`encerrarDispensasObsoletasNoBanco`), Task 9 (job), Task 10 (smoke).
2. **Dois administradores dispensando a mesma pendência ao mesmo tempo.** Esperado: uma passa, a outra recebe a frase "já está dispensada", sem 500. → Task 4 (P2002) e Task 10 (smoke com `Promise.allSettled`).
3. **Motivo só com espaços ou curto.** Esperado: recusado com a mensagem de campo, nos dois lados (tela e servidor usam o mesmo schema). → Task 5.
4. **Pendência que deixou de existir entre abrir a tela e clicar** (revisão republicada, arquivo restaurado, documento apagado). Esperado: `MOTIVO_JA_RESOLVIDA`, nada gravado. → Task 4 e Task 10.
5. **Usuário sem `notificacoes:gestao` abrindo a URL ou chamando a ação.** Esperado: `/sem-permissao` na tela, "Sem permissão." na ação. → Task 8 (verificação em tela com perfil sem o par).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/modules/uploads/ciclo/integridade.ts` | classifica violações (puro); passa a carregar dados que a assinatura precisa | modificar |
| `src/modules/uploads/ciclo/integridade.test.ts` | | modificar |
| `src/modules/uploads/ciclo/pendencias.ts` | assinatura, dispensa, texto, resumo do aviso (puro) | criar |
| `src/modules/uploads/ciclo/pendencias.test.ts` | | criar |
| `src/modules/uploads/ciclo/pendencias-schemas.ts` | schemas Zod das ações (puro) | criar |
| `src/modules/uploads/ciclo/pendencias-schemas.test.ts` | | criar |
| `src/modules/uploads/ciclo/pendencias-filtro.ts` | filtro e contagem da lista (puro) | criar |
| `src/modules/uploads/ciclo/pendencias-filtro.test.ts` | | criar |
| `src/modules/uploads/ciclo/acoes-pendencia.ts` | descritor `AcaoItem[]` (puro) | criar |
| `src/modules/uploads/ciclo/acoes-pendencia.test.ts` | | criar |
| `src/modules/uploads/ciclo/guia-pendencia.ts` | textos "o que fazer" (puro) | criar |
| `src/modules/uploads/ciclo/guia-pendencia.test.ts` | | criar |
| `src/modules/uploads/ciclo/varredura.ts` | carrega revisões varridas + dispensas ativas (server-only) | criar |
| `src/modules/uploads/ciclo/integridade-service.ts` | job A7 usa `varredura.ts`; aviso vira resumo | modificar |
| `src/modules/uploads/ciclo/pendencias-service.ts` | dispensar, desfazer, encerrar obsoletas (transação + evento) | criar |
| `src/modules/uploads/ciclo/pendencias-actions.ts` | `"use server"`: `dispensarPendencia`, `desfazerDispensaPendencia` | criar |
| `src/modules/uploads/ciclo/pendencias-queries.ts` | DTO da tela | criar |
| `src/modules/uploads/historico/eventos.ts` | 2 tipos de evento + complemento | modificar |
| `src/modules/uploads/historico/eventos.test.ts` | | modificar |
| `prisma/schema.prisma` + `prisma/migrations/20261015120000_dispensa_pendencia_ciclo/migration.sql` | tabela + índice parcial | modificar/criar |
| `src/app/(dashboard)/arquivos/pendencias/{page,loading}.tsx` | rota | criar |
| `src/components/arquivos/pendencias-view.tsx` | tela (cliente) | criar |
| `src/lib/nav-config.ts` + `nav-config.test.ts` | item de menu | modificar |
| `scripts/smoke-pendencias-ciclo.ts` + `package.json` | smoke | criar/modificar |
| `CLAUDE.md`, `docs/manual/novidades.md` | documentação | modificar |

---

### Task 1: Núcleo puro — violações com dados para assinatura, `pendencias.ts`

**Files:**
- Modify: `src/modules/uploads/ciclo/integridade.ts` (substituir do `import` até o fim da `encontrarViolacoes`; manter `MOTIVO_CORRECAO_INTEGRIDADE`)
- Modify: `src/modules/uploads/ciclo/integridade.test.ts`
- Modify: `src/modules/uploads/ciclo/integridade-service.ts:34-47` (só o `select` e o mapeamento, para o código seguir compilando)
- Create: `src/modules/uploads/ciclo/pendencias.ts`
- Test: `src/modules/uploads/ciclo/pendencias.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces (todos exportados de `pendencias.ts`):
  - `TIPOS_PENDENCIA`, `type TipoPendencia`, `type ViolacaoDispensavel`
  - `ROTULO_PENDENCIA: Record<TipoPendencia | "corrigida", string>`
  - `MOTIVO_NAO_DISPENSAVEL`, `MOTIVO_JA_RESOLVIDA`, `MOTIVO_JA_DISPENSADA`, `MOTIVO_DISPENSA_ENCERRADA` (strings)
  - `type DispensaAtiva = { id: string; alvoId: string; tipo: TipoPendencia; chave: string; motivo: string; criadaPorId: string; criadaEm: Date }`
  - `type ItemPendencia = { violacao: ViolacaoDispensavel; alvoId: string; chave: string; dispensa: DispensaAtiva | null }`
  - `ehDispensavel(v: Violacao): v is ViolacaoDispensavel`
  - `alvoDaViolacao(v: ViolacaoDispensavel): string`
  - `assinaturaDaViolacao(v: ViolacaoDispensavel): string`
  - `detalheDaViolacao(v: ViolacaoDispensavel): { detalhe: string; complemento: string | null }`
  - `aplicarDispensas(violacoes: readonly Violacao[], dispensas: readonly DispensaAtiva[]): { abertas: ItemPendencia[]; dispensadas: ItemPendencia[] }`
  - `dispensasObsoletas(violacoes: readonly Violacao[], dispensas: readonly DispensaAtiva[]): DispensaAtiva[]`
  - `resumoDoAviso(p: { abertas: readonly ItemPendencia[]; corrigidas: number }): string | null`
- `integridade.ts` passa a exportar `RevisaoVarrida.qtdNaLixeira: number` (substitui `arquivoNaLixeira: boolean`) e `Violacao` com os campos novos (ver código).

- [ ] **Step 1: Atualizar o teste de `integridade.test.ts` para o contrato novo (falha primeiro)**

Em `src/modules/uploads/ciclo/integridade.test.ts`:

1. No helper `r(...)` (linha ~15) trocar `arquivoNaLixeira: false,` por `qtdNaLixeira: 0,`.
2. Trocar o teste "I6" (linhas ~35-38) por:

```ts
  it("I6: publicada ou arquivada com arquivo na lixeira, com a contagem", () => {
    const v = encontrarViolacoes([r({ estado: "publicado", qtdNaLixeira: 2 })], opts);
    expect(v).toEqual([
      expect.objectContaining({ tipo: "publicada_com_lixeira", revisaoId: "r1", documentoId: "d1", numero: 1, estado: "publicado", qtdNaLixeira: 2 }),
    ]);
    expect(encontrarViolacoes([r({ estado: "em_andamento", qtdNaLixeira: 1 })], opts)).toEqual([]);
  });
```
3. No teste "análise parada" acrescentar, depois do primeiro `expect`, a conferência dos campos novos — substituir o bloco inteiro por:

```ts
  it("análise parada além do prazo do projeto, com data de entrada e limite", () => {
    const antiga = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(encontrarViolacoes([r({ estado: "compartilhado", estadoEm: antiga })], opts)).toEqual([
      expect.objectContaining({ tipo: "analise_parada", dias: 10, limiteDias: 7, estadoEm: antiga, documentoId: "d1", numero: 1 }),
    ]);
    expect(encontrarViolacoes([r({ estado: "compartilhado", estadoEm: antiga })], { agora, diasAlertaPorProjeto: () => 15 })).toEqual([]);
  });
```
4. No teste I4 trocar a última linha por:

```ts
    expect(v.map((x) => x.tipo)).toEqual(["duas_publicadas"]);
    expect(v[0]).toMatchObject({ documentoId: "d1", revisaoIds: ["a", "b"] });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/uploads/ciclo/integridade.test.ts`
Expected: FAIL (propriedades `qtdNaLixeira`/`revisaoIds`/`limiteDias` inexistentes; tsc-level mismatch aparece como falha de asserção).

- [ ] **Step 3: Implementar `integridade.ts`**

Substituir o conteúdo de `src/modules/uploads/ciclo/integridade.ts` por (o comentário de cabeçalho é o mesmo de hoje):

```ts
/**
 * Verificação de integridade do ciclo documental (A7). PURO: classifica o que a varredura leu.
 *
 * Só a violação de I5 (controle de pasta — liberado para obra / enviado ao cliente — numa revisão que
 * não está publicada) é corrigida sozinha: revogar é seguro, e deixar a obra vendo uma revisão não
 * publicada é o pior caso. O resto só é relatado aos administradores — corrigir sozinho exigiria
 * escolher qual revisão vale, e essa decisão é de gente.
 */
import type { EstadoRevisao } from "./estados";

export type RevisaoVarrida = {
  id: string;
  documentoId: string;
  projetoId: string;
  documentoNome: string;
  numero: number;
  estado: EstadoRevisao;
  estadoEm: Date;
  /** Controles de pasta ativos (liberado_obra / enviado_cliente), com id para revogar. */
  controlesDePasta: { id: string; tipo: string }[];
  /** Quantos arquivos da revisão estão na lixeira (I6 — o arquivo de uma publicada/arquivada não devia ter ido). */
  qtdNaLixeira: number;
};

export type Violacao =
  | { tipo: "duas_publicadas"; documentoId: string; projetoId: string; revisaoIds: string[]; texto: string }
  | { tipo: "controle_fora_de_publicada"; revisaoId: string; controleId: string; projetoId: string; texto: string }
  | {
      tipo: "publicada_com_lixeira";
      revisaoId: string;
      documentoId: string;
      projetoId: string;
      numero: number;
      estado: EstadoRevisao;
      qtdNaLixeira: number;
      texto: string;
    }
  | {
      tipo: "analise_parada";
      revisaoId: string;
      documentoId: string;
      projetoId: string;
      numero: number;
      dias: number;
      limiteDias: number;
      estadoEm: Date;
      texto: string;
    };

const DIA_MS = 24 * 60 * 60 * 1000;
const rev = (n: number) => `R${String(Math.max(0, n - 1)).padStart(2, "0")}`;

export function encontrarViolacoes(
  revisoes: readonly RevisaoVarrida[],
  opts: { agora: Date; diasAlertaPorProjeto: (projetoId: string) => number },
): Violacao[] {
  const out: Violacao[] = [];

  // I4 — o índice do banco já impede; a varredura confere mesmo assim (índice removido à mão, restore antigo).
  const publicadasPorDoc = new Map<string, RevisaoVarrida[]>();
  for (const r of revisoes.filter((r) => r.estado === "publicado")) {
    publicadasPorDoc.set(r.documentoId, [...(publicadasPorDoc.get(r.documentoId) ?? []), r]);
  }
  for (const [documentoId, lista] of publicadasPorDoc) {
    if (lista.length > 1) {
      out.push({
        tipo: "duas_publicadas",
        documentoId,
        projetoId: lista[0].projetoId,
        revisaoIds: lista.map((r) => r.id),
        texto: `${lista[0].documentoNome}: ${lista.length} revisões publicadas (${lista.map((r) => rev(r.numero)).join(", ")}).`,
      });
    }
  }

  for (const r of revisoes) {
    // I5 — corrigida sozinha (o job revoga o controle).
    if (r.estado !== "publicado") {
      for (const c of r.controlesDePasta) {
        out.push({
          tipo: "controle_fora_de_publicada",
          revisaoId: r.id,
          controleId: c.id,
          projetoId: r.projetoId,
          texto: `${r.documentoNome} ${rev(r.numero)}: ${c.tipo === "liberado_obra" ? "liberada para obra" : "enviada ao cliente"} sem estar publicada.`,
        });
      }
    }
    // I6 — só relata.
    if ((r.estado === "publicado" || r.estado === "arquivado") && r.qtdNaLixeira > 0) {
      out.push({
        tipo: "publicada_com_lixeira",
        revisaoId: r.id,
        documentoId: r.documentoId,
        projetoId: r.projetoId,
        numero: r.numero,
        estado: r.estado,
        qtdNaLixeira: r.qtdNaLixeira,
        texto: `${r.documentoNome} ${rev(r.numero)} (${r.estado === "publicado" ? "publicada" : "arquivada"}) tem arquivo na lixeira.`,
      });
    }
    // Análise parada há mais de X dias (por projeto).
    if (r.estado === "compartilhado") {
      const dias = Math.floor((opts.agora.getTime() - r.estadoEm.getTime()) / DIA_MS);
      const limiteDias = opts.diasAlertaPorProjeto(r.projetoId);
      if (dias > limiteDias) {
        out.push({
          tipo: "analise_parada",
          revisaoId: r.id,
          documentoId: r.documentoId,
          projetoId: r.projetoId,
          numero: r.numero,
          dias,
          limiteDias,
          estadoEm: r.estadoEm,
          texto: `${r.documentoNome} ${rev(r.numero)} está em análise há ${dias} dias.`,
        });
      }
    }
  }
  return out;
}

export const MOTIVO_CORRECAO_INTEGRIDADE = "Correção automática de integridade";
```

- [ ] **Step 4: Manter `integridade-service.ts` compilando (ajuste mínimo, é refeito na Task 4)**

Em `src/modules/uploads/ciclo/integridade-service.ts`:
- no `select`, trocar a linha `uploads: { where: { excluidoEm: { not: null } }, select: { id: true }, take: 1 },` por `_count: { select: { uploads: { where: { excluidoEm: { not: null } } } } },`
- no `map`, trocar `arquivoNaLixeira: l.uploads.length > 0,` por `qtdNaLixeira: l._count.uploads,`

- [ ] **Step 5: Rodar `integridade.test.ts` e ver passar**

Run: `npx vitest run src/modules/uploads/ciclo/integridade.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Escrever o teste de `pendencias.ts` (falha primeiro)**

Criar `src/modules/uploads/ciclo/pendencias.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Violacao } from "./integridade";
import {
  aplicarDispensas,
  alvoDaViolacao,
  assinaturaDaViolacao,
  detalheDaViolacao,
  dispensasObsoletas,
  ehDispensavel,
  resumoDoAviso,
  type DispensaAtiva,
  type ItemPendencia,
  type ViolacaoDispensavel,
} from "./pendencias";

type Lix = Extract<Violacao, { tipo: "publicada_com_lixeira" }>;
type Par = Extract<Violacao, { tipo: "analise_parada" }>;
type Dup = Extract<Violacao, { tipo: "duas_publicadas" }>;

const lixeira = (p: Partial<Lix> = {}): Lix => ({
  tipo: "publicada_com_lixeira", revisaoId: "r1", documentoId: "d1", projetoId: "p1", numero: 1, estado: "arquivado", qtdNaLixeira: 1, texto: "x", ...p,
});
const parada = (p: Partial<Par> = {}): Par => ({
  tipo: "analise_parada", revisaoId: "r2", documentoId: "d2", projetoId: "p1", numero: 2, dias: 14, limiteDias: 7, estadoEm: new Date("2026-10-01T10:00:00Z"), texto: "x", ...p,
});
const dupla = (p: Partial<Dup> = {}): Dup => ({
  tipo: "duas_publicadas", documentoId: "d3", projetoId: "p1", revisaoIds: ["b", "a"], texto: "x", ...p,
});
const dispensa = (v: ViolacaoDispensavel, p: Partial<DispensaAtiva> = {}): DispensaAtiva => ({
  id: "x1", alvoId: alvoDaViolacao(v), tipo: v.tipo, chave: assinaturaDaViolacao(v), motivo: "Limpeza", criadaPorId: "u1", criadaEm: new Date("2026-10-15T09:00:00Z"), ...p,
});

describe("alvo e assinatura", () => {
  it("o alvo é a revisão, ou o documento nas duas publicadas", () => {
    expect(alvoDaViolacao(lixeira())).toBe("r1");
    expect(alvoDaViolacao(parada())).toBe("r2");
    expect(alvoDaViolacao(dupla())).toBe("d3");
  });

  it("lixeira: muda com a quantidade de arquivos e com o estado", () => {
    expect(assinaturaDaViolacao(lixeira())).toBe("lix:1:arquivado");
    expect(assinaturaDaViolacao(lixeira({ qtdNaLixeira: 2 }))).toBe("lix:2:arquivado");
    expect(assinaturaDaViolacao(lixeira({ estado: "publicado" }))).toBe("lix:1:publicado");
  });

  it("análise parada: muda quando a revisão entra em análise de novo", () => {
    expect(assinaturaDaViolacao(parada())).toBe("par:2026-10-01T10:00:00.000Z");
    expect(assinaturaDaViolacao(parada({ estadoEm: new Date("2026-10-09T10:00:00Z") }))).not.toBe(assinaturaDaViolacao(parada()));
  });

  it("duas publicadas: não depende da ordem das revisões", () => {
    expect(assinaturaDaViolacao(dupla())).toBe("dup:a,b");
    expect(assinaturaDaViolacao(dupla({ revisaoIds: ["a", "b"] }))).toBe("dup:a,b");
  });

  it("I5 (controle fora de publicada) nunca é dispensável", () => {
    const i5: Violacao = { tipo: "controle_fora_de_publicada", revisaoId: "r", controleId: "c", projetoId: "p", texto: "x" };
    expect(ehDispensavel(i5)).toBe(false);
    expect(ehDispensavel(lixeira())).toBe(true);
    expect(ehDispensavel(parada())).toBe(true);
    expect(ehDispensavel(dupla())).toBe(true);
  });
});

describe("detalheDaViolacao", () => {
  it("lixeira no singular e no plural; revisão vigente é dita", () => {
    expect(detalheDaViolacao(lixeira())).toEqual({ detalhe: "1 arquivo na lixeira", complemento: null });
    expect(detalheDaViolacao(lixeira({ qtdNaLixeira: 3, estado: "publicado" }))).toEqual({ detalhe: "3 arquivos na lixeira", complemento: "revisão vigente" });
  });
  it("análise parada traz dias e limite; duas publicadas traz a contagem", () => {
    expect(detalheDaViolacao(parada())).toEqual({ detalhe: "Em análise há 14 dias", complemento: "limite do projeto: 7 dias" });
    expect(detalheDaViolacao(dupla())).toEqual({ detalhe: "2 revisões publicadas", complemento: "o índice do banco devia impedir" });
  });
});

describe("aplicarDispensas", () => {
  it("sem dispensa: tudo aberto; I5 fica de fora", () => {
    const i5: Violacao = { tipo: "controle_fora_de_publicada", revisaoId: "r", controleId: "c", projetoId: "p", texto: "x" };
    const r = aplicarDispensas([lixeira(), parada(), i5], []);
    expect(r.abertas.map((i) => i.violacao.tipo)).toEqual(["publicada_com_lixeira", "analise_parada"]);
    expect(r.dispensadas).toEqual([]);
  });

  it("dispensa com a mesma assinatura esconde a pendência", () => {
    const v = lixeira();
    const r = aplicarDispensas([v, parada()], [dispensa(v)]);
    expect(r.abertas.map((i) => i.alvoId)).toEqual(["r2"]);
    expect(r.dispensadas).toHaveLength(1);
    expect(r.dispensadas[0]).toMatchObject({ alvoId: "r1", chave: "lix:1:arquivado" });
    expect(r.dispensadas[0].dispensa?.motivo).toBe("Limpeza");
  });

  it("estado mudou depois da dispensa: a pendência reaparece como aberta", () => {
    const antes = lixeira();
    const agora = lixeira({ qtdNaLixeira: 2 });
    const r = aplicarDispensas([agora], [dispensa(antes)]);
    expect(r.abertas).toHaveLength(1);
    expect(r.abertas[0].dispensa).toBeNull();
    expect(r.dispensadas).toEqual([]);
  });

  it("dispensa de outro tipo no mesmo alvo não vale", () => {
    const v = lixeira();
    const r = aplicarDispensas([v], [dispensa(v, { tipo: "analise_parada" })]);
    expect(r.abertas).toHaveLength(1);
  });
});

describe("dispensasObsoletas", () => {
  it("encerra a dispensa cuja pendência sumiu ou mudou de assinatura", () => {
    const v = lixeira();
    const sumiu = dispensa(parada(), { id: "sumiu" });
    const mudou = dispensa(lixeira({ qtdNaLixeira: 5 }), { id: "mudou" });
    const viva = dispensa(v, { id: "viva" });
    const r = dispensasObsoletas([v], [sumiu, mudou, viva]);
    expect(r.map((d) => d.id).sort()).toEqual(["mudou", "sumiu"]);
  });
});

describe("resumoDoAviso", () => {
  const item = (v: ViolacaoDispensavel): ItemPendencia => ({ violacao: v, alvoId: alvoDaViolacao(v), chave: assinaturaDaViolacao(v), dispensa: null });

  it("sem aberta e sem correção: nada a avisar", () => {
    expect(resumoDoAviso({ abertas: [], corrigidas: 0 })).toBeNull();
  });
  it("conta por tipo", () => {
    const abertas = [item(lixeira()), item(lixeira({ revisaoId: "r9" })), item(parada()), item(dupla())];
    expect(resumoDoAviso({ abertas, corrigidas: 0 })).toBe("4 pendências abertas (2 na lixeira, 1 parada, 1 duplicada).");
  });
  it("singular e correção automática abrem o texto", () => {
    expect(resumoDoAviso({ abertas: [item(lixeira())], corrigidas: 2 })).toBe(
      "2 liberações indevidas revogadas automaticamente. 1 pendência aberta (1 na lixeira).",
    );
  });
  it("só correção", () => {
    expect(resumoDoAviso({ abertas: [], corrigidas: 1 })).toBe("1 liberação indevida revogada automaticamente.");
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx vitest run src/modules/uploads/ciclo/pendencias.test.ts`
Expected: FAIL ("Failed to resolve import ./pendencias").

- [ ] **Step 8: Implementar `pendencias.ts`**

Criar `src/modules/uploads/ciclo/pendencias.ts`:

```ts
/**
 * Pendências do ciclo documental na tela do administrador. PURO: sem Prisma, sem I/O.
 *
 * A varredura (`integridade.ts`) acha violações; aqui cada uma ganha um ALVO (revisão, ou documento nas
 * duas publicadas) e uma ASSINATURA do estado. A dispensa grava a assinatura do momento: se o estado
 * mudar (outro arquivo na lixeira, a revisão voltou à análise), a assinatura muda e a pendência volta
 * a aparecer. Spec: docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md.
 */
import type { Violacao } from "./integridade";

export const TIPOS_PENDENCIA = ["publicada_com_lixeira", "analise_parada", "duas_publicadas"] as const;
export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number];
export type ViolacaoDispensavel = Extract<Violacao, { tipo: TipoPendencia }>;

export const ROTULO_PENDENCIA: Record<TipoPendencia | "corrigida", string> = {
  publicada_com_lixeira: "Lixeira",
  analise_parada: "Análise parada",
  duas_publicadas: "Duas publicadas",
  corrigida: "Corrigida automaticamente",
};

/** A MESMA frase vai para o `ActionError` do servidor e para o item desabilitado do menu. */
export const MOTIVO_NAO_DISPENSAVEL = "Já foi revogada automaticamente.";
export const MOTIVO_JA_RESOLVIDA = "Esta pendência mudou ou foi resolvida. Atualize a tela.";
export const MOTIVO_JA_DISPENSADA = "Esta pendência já está dispensada.";
export const MOTIVO_DISPENSA_ENCERRADA = "Esta dispensa já foi desfeita.";

export type DispensaAtiva = {
  id: string;
  alvoId: string;
  tipo: TipoPendencia;
  chave: string;
  motivo: string;
  criadaPorId: string;
  criadaEm: Date;
};

export type ItemPendencia = {
  violacao: ViolacaoDispensavel;
  alvoId: string;
  chave: string;
  dispensa: DispensaAtiva | null;
};

export function ehDispensavel(v: Violacao): v is ViolacaoDispensavel {
  return v.tipo !== "controle_fora_de_publicada";
}

/** Revisão (lixeira, análise parada) ou documento (duas publicadas). */
export function alvoDaViolacao(v: ViolacaoDispensavel): string {
  return v.tipo === "duas_publicadas" ? v.documentoId : v.revisaoId;
}

export function assinaturaDaViolacao(v: ViolacaoDispensavel): string {
  switch (v.tipo) {
    case "publicada_com_lixeira":
      return `lix:${v.qtdNaLixeira}:${v.estado}`;
    case "analise_parada":
      return `par:${v.estadoEm.toISOString()}`;
    case "duas_publicadas":
      return `dup:${[...v.revisaoIds].sort().join(",")}`;
  }
}

export function detalheDaViolacao(v: ViolacaoDispensavel): { detalhe: string; complemento: string | null } {
  switch (v.tipo) {
    case "publicada_com_lixeira":
      return {
        detalhe: v.qtdNaLixeira === 1 ? "1 arquivo na lixeira" : `${v.qtdNaLixeira} arquivos na lixeira`,
        complemento: v.estado === "publicado" ? "revisão vigente" : null,
      };
    case "analise_parada":
      return { detalhe: `Em análise há ${v.dias} dias`, complemento: `limite do projeto: ${v.limiteDias} dias` };
    case "duas_publicadas":
      return { detalhe: `${v.revisaoIds.length} revisões publicadas`, complemento: "o índice do banco devia impedir" };
  }
}

const chaveDoPar = (tipo: string, alvoId: string) => `${tipo}:${alvoId}`;

/** Separa as violações dispensáveis em abertas e dispensadas (dispensa ativa COM a mesma assinatura). */
export function aplicarDispensas(
  violacoes: readonly Violacao[],
  dispensas: readonly DispensaAtiva[],
): { abertas: ItemPendencia[]; dispensadas: ItemPendencia[] } {
  const ativas = new Map(dispensas.map((d) => [chaveDoPar(d.tipo, d.alvoId), d]));
  const abertas: ItemPendencia[] = [];
  const dispensadas: ItemPendencia[] = [];
  for (const v of violacoes) {
    if (!ehDispensavel(v)) continue;
    const alvoId = alvoDaViolacao(v);
    const chave = assinaturaDaViolacao(v);
    const d = ativas.get(chaveDoPar(v.tipo, alvoId));
    const item: ItemPendencia = { violacao: v, alvoId, chave, dispensa: d && d.chave === chave ? d : null };
    (item.dispensa ? dispensadas : abertas).push(item);
  }
  return { abertas, dispensadas };
}

/**
 * Dispensas ativas que não casam com nenhuma violação atual (a pendência sumiu ou a assinatura mudou).
 * O job as encerra: sem isso, a ocorrência NOVA com a mesma assinatura de antes herdaria a dispensa
 * velha calada (1 arquivo na lixeira → 2 → volta a 1).
 */
export function dispensasObsoletas(violacoes: readonly Violacao[], dispensas: readonly DispensaAtiva[]): DispensaAtiva[] {
  const vivas = new Set<string>();
  for (const v of violacoes) {
    if (ehDispensavel(v)) vivas.add(`${chaveDoPar(v.tipo, alvoDaViolacao(v))}|${assinaturaDaViolacao(v)}`);
  }
  return dispensas.filter((d) => !vivas.has(`${chaveDoPar(d.tipo, d.alvoId)}|${d.chave}`));
}

/** Corpo da notificação diária (A7). `null` = nada a avisar. */
export function resumoDoAviso(p: { abertas: readonly ItemPendencia[]; corrigidas: number }): string | null {
  const partes: string[] = [];
  if (p.corrigidas > 0) {
    partes.push(
      p.corrigidas === 1
        ? "1 liberação indevida revogada automaticamente."
        : `${p.corrigidas} liberações indevidas revogadas automaticamente.`,
    );
  }
  if (p.abertas.length > 0) {
    const n = (t: TipoPendencia) => p.abertas.filter((i) => i.violacao.tipo === t).length;
    const lixeira = n("publicada_com_lixeira");
    const paradas = n("analise_parada");
    const duplas = n("duas_publicadas");
    const detalhe = [
      lixeira > 0 ? `${lixeira} na lixeira` : null,
      paradas > 0 ? `${paradas} ${paradas === 1 ? "parada" : "paradas"}` : null,
      duplas > 0 ? `${duplas} ${duplas === 1 ? "duplicada" : "duplicadas"}` : null,
    ].filter(Boolean);
    const total = p.abertas.length;
    partes.push(`${total} ${total === 1 ? "pendência aberta" : "pendências abertas"} (${detalhe.join(", ")}).`);
  }
  return partes.length > 0 ? partes.join(" ") : null;
}
```

- [ ] **Step 9: Rodar os testes do ciclo e a checagem de tipos**

Run: `npx vitest run src/modules/uploads/ciclo`
Expected: PASS.
Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`
Expected: sem erros (se levar minutos, é normal: o projeto passa de 4 GB de heap).

- [ ] **Step 10: Commit**

```bash
git add src/modules/uploads/ciclo/integridade.ts src/modules/uploads/ciclo/integridade.test.ts src/modules/uploads/ciclo/integridade-service.ts src/modules/uploads/ciclo/pendencias.ts src/modules/uploads/ciclo/pendencias.test.ts
git commit -m "feat(ciclo): núcleo puro das pendências documentais (assinatura, dispensa e resumo)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 2: Tabela `DispensaPendenciaCiclo` e migration

**Files:**
- Modify: `prisma/schema.prisma` (logo após o model `ConfigDocumentosProjeto`, ~linha 9383)
- Create: `prisma/migrations/20261015120000_dispensa_pendencia_ciclo/migration.sql`

**Interfaces:**
- Produces: `prisma.dispensaPendenciaCiclo` com campos `id, alvoId, tipo, chave, motivo, criadaPorId, criadaEm, desfeitaEm, desfeitaPorId` (consumido nas Tasks 4, 6, 9, 10).

- [ ] **Step 1: Adicionar o model ao `schema.prisma`**

Depois do `}` de `ConfigDocumentosProjeto`:

```prisma
/// Dispensa de uma pendência do ciclo documental (tela /arquivos/pendencias). Valia só para o ESTADO em que
/// foi dada: `chave` é a assinatura (modules/uploads/ciclo/pendencias.ts); mudou o estado, a pendência
/// reaparece e a dispensa velha é encerrada pelo job diário (desfeitaPorId nulo = sistema).
/// `alvoId` é a revisão (lixeira, análise parada) ou o documento (duas publicadas); escalar, sem FK, como
/// DocumentoEvento — o histórico sobrevive ao documento. Uma dispensa ATIVA por alvo+tipo: índice parcial
/// `dispensa_pendencia_ciclo_uma_ativa` (na migração — não representável aqui).
model DispensaPendenciaCiclo {
  id            String    @id @default(cuid())
  alvoId        String
  /// `publicada_com_lixeira` | `analise_parada` | `duas_publicadas`
  tipo          String
  chave         String
  motivo        String
  criadaPorId   String
  criadaEm      DateTime  @default(now())
  desfeitaEm    DateTime?
  desfeitaPorId String?

  @@index([alvoId, tipo])
  @@map("dispensa_pendencia_ciclo")
}
```

- [ ] **Step 2: Escrever a migration à mão**

Criar `prisma/migrations/20261015120000_dispensa_pendencia_ciclo/migration.sql`:

```sql
-- Dispensa de pendência do ciclo documental. Só tabela nova: nada existente muda, sem seed e sem permissão.
-- CreateTable
CREATE TABLE "dispensa_pendencia_ciclo" (
    "id" TEXT NOT NULL,
    "alvoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadaPorId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desfeitaEm" TIMESTAMP(3),
    "desfeitaPorId" TEXT,

    CONSTRAINT "dispensa_pendencia_ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispensa_pendencia_ciclo_alvoId_tipo_idx" ON "dispensa_pendencia_ciclo"("alvoId", "tipo");

-- Uma dispensa ativa por alvo+tipo. É o que faz duas dispensas simultâneas da mesma pendência
-- terminarem em P2002 (a segunda recebe "já está dispensada") em vez de gravar duas linhas.
CREATE UNIQUE INDEX "dispensa_pendencia_ciclo_uma_ativa" ON "dispensa_pendencia_ciclo"("alvoId", "tipo") WHERE "desfeitaEm" IS NULL;
```

- [ ] **Step 3: Aplicar no banco do worktree e gerar o client**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid`.
Run: `npx prisma migrate deploy`
Expected: `1 migration found ... Applying migration 20261015120000_dispensa_pendencia_ciclo`. (Usa `migrate deploy`, não `migrate dev`: o `migrate dev` já exigiu reset de banco por drift neste projeto.)
Run: `npx prisma generate`
Expected: `Generated Prisma Client` em `src/generated/prisma`.

- [ ] **Step 4: Conferir o índice parcial no banco**

Run: `npx prisma db execute --stdin <<< "SELECT indexdef FROM pg_indexes WHERE indexname = 'dispensa_pendencia_ciclo_uma_ativa';"` (se o comando não imprimir resultado, use `psql` na porta 5433 / banco `senahub_remake_vscode`).
Expected: a definição contém `WHERE ("desfeitaEm" IS NULL)`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261015120000_dispensa_pendencia_ciclo/migration.sql
git commit -m "feat(ciclo): tabela de dispensa de pendência documental

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 3: Tipos de evento no histórico do documento

**Files:**
- Modify: `src/modules/uploads/historico/eventos.ts` (`TIPOS_EVENTO` ~linha 40, `complementoEvento` ~linha 196, imports no topo)
- Test: `src/modules/uploads/historico/eventos.test.ts`

**Interfaces:**
- Consumes: `ROTULO_PENDENCIA` de `@/modules/uploads/ciclo/pendencias` (Task 1).
- Produces: tipos `pendencia_dispensada` e `pendencia_dispensa_desfeita` aceitos por `gravarEventoNoTx` (`detalhe: { pendencia: TipoPendencia; motivo?: string }`).

- [ ] **Step 1: Teste (falha primeiro)**

Acrescentar ao fim de `src/modules/uploads/historico/eventos.test.ts`:

```ts
describe("pendências do ciclo documental", () => {
  it("os dois tipos são catalogados e contam como alteração", () => {
    expect(ehTipoEvento("pendencia_dispensada")).toBe(true);
    expect(ehTipoEvento("pendencia_dispensa_desfeita")).toBe(true);
    expect(categoriaDoTipo("pendencia_dispensada")).toBe("alteracao");
    expect(categoriaDoTipo("pendencia_dispensa_desfeita")).toBe("alteracao");
  });

  it("o complemento junta o tipo da pendência e o motivo", () => {
    expect(complementoEvento("pendencia_dispensada", { pendencia: "publicada_com_lixeira", motivo: "Planilha substituída" })).toBe(
      "Lixeira · Planilha substituída",
    );
    expect(complementoEvento("pendencia_dispensa_desfeita", { pendencia: "analise_parada" })).toBe("Análise parada");
    expect(complementoEvento("pendencia_dispensada", {})).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/uploads/historico/eventos.test.ts`
Expected: FAIL (`ehTipoEvento("pendencia_dispensada")` é `false`).

- [ ] **Step 3: Implementar**

Em `eventos.ts`:

1. No topo, junto dos outros imports: `import { ROTULO_PENDENCIA } from "@/modules/uploads/ciclo/pendencias";`
2. Em `TIPOS_EVENTO`, depois da linha `controle_removido`:

```ts
  pendencia_dispensada: { categoria: "alteracao", rotulo: "Dispensou uma pendência" },
  pendencia_dispensa_desfeita: { categoria: "alteracao", rotulo: "Desfez a dispensa de uma pendência" },
```
3. Em `complementoEvento`, antes do `case "envio_sem_carimbo":`:

```ts
    case "pendencia_dispensada":
    case "pendencia_dispensa_desfeita": {
      const pendencia = typeof d.pendencia === "string" ? ROTULO_PENDENCIA[d.pendencia as keyof typeof ROTULO_PENDENCIA] ?? d.pendencia : null;
      const partes = [pendencia, texto("motivo")].filter(Boolean);
      return partes.length ? partes.join(" · ") : null;
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/uploads/historico/eventos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/uploads/historico/eventos.ts src/modules/uploads/historico/eventos.test.ts
git commit -m "feat(historico): eventos de dispensa de pendência documental

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 4: Varredura compartilhada e serviço de dispensa

**Files:**
- Create: `src/modules/uploads/ciclo/varredura.ts`
- Modify: `src/modules/uploads/ciclo/integridade-service.ts` (só o carregamento; o aviso muda na Task 9)
- Create: `src/modules/uploads/ciclo/pendencias-service.ts`

**Interfaces:**
- Consumes: Task 1 (`pendencias.ts`, `integridade.ts`), Task 2 (`prisma.dispensaPendenciaCiclo`), Task 3 (tipos de evento), `gravarEventoNoTx` de `@/modules/uploads/historico/service`.
- Produces:
  - `carregarRevisoesVarridas(db, extra?)`, `violacoesDoCiclo(db, agora, extra?)`, `dispensasAtivas(db)`, `pendenciasAbertasDoCiclo(db, agora, extra?)` em `varredura.ts`
  - `dispensarNoBanco(input: { alvoId: string; tipo: TipoPendencia; chave: string; motivo: string; userId: string }): Promise<void>`
  - `desfazerDispensaNoBanco(input: { alvoId: string; tipo: TipoPendencia; userId: string }): Promise<void>`
  - `encerrarDispensasObsoletasNoBanco(ids: readonly string[]): Promise<number>`

Não há teste unitário (I/O de banco): a verificação é o smoke da Task 10, que cobre cada linha abaixo.

- [ ] **Step 1: Criar `varredura.ts`**

```ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EstadoRevisao } from "./estados";
import { encontrarViolacoes, type RevisaoVarrida, type Violacao } from "./integridade";
import { aplicarDispensas, type DispensaAtiva, type ItemPendencia, type TipoPendencia } from "./pendencias";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A leitura do job A7 e da tela de pendências: UMA só, para os dois nunca divergirem. Lê só o que importa
 * (revisões vivas, controles de pasta ativos, em análise, arquivadas com arquivo na lixeira). `extra`
 * estreita a busca (um projeto no smoke, uma revisão ou um documento ao dispensar).
 */
export async function carregarRevisoesVarridas(db: Db, extra?: Prisma.DocumentoRevisaoWhereInput): Promise<RevisaoVarrida[]> {
  const linhas = await db.documentoRevisao.findMany({
    where: {
      AND: [
        {
          documento: { substituidoPorId: null },
          OR: [
            { estado: { in: ["publicado", "compartilhado"] } },
            { controles: { some: { removidoEm: null, tipo: { in: ["liberado_obra", "enviado_cliente"] } } } },
            { estado: "arquivado", uploads: { some: { excluidoEm: { not: null } } } },
          ],
        },
        ...(extra ? [extra] : []),
      ],
    },
    select: {
      id: true,
      documentoId: true,
      numero: true,
      estado: true,
      estadoEm: true,
      documento: { select: { nomeArquivo: true, titulo: true, disciplina: { select: { projetoId: true } } } },
      controles: { where: { removidoEm: null, tipo: { in: ["liberado_obra", "enviado_cliente"] } }, select: { id: true, tipo: true } },
      _count: { select: { uploads: { where: { excluidoEm: { not: null } } } } },
    },
  });
  return linhas.map((l) => ({
    id: l.id,
    documentoId: l.documentoId,
    projetoId: l.documento.disciplina.projetoId,
    documentoNome: l.documento.titulo ?? l.documento.nomeArquivo,
    numero: l.numero,
    estado: l.estado as EstadoRevisao,
    estadoEm: l.estadoEm,
    controlesDePasta: l.controles,
    qtdNaLixeira: l._count.uploads,
  }));
}

export async function violacoesDoCiclo(db: Db, agora: Date, extra?: Prisma.DocumentoRevisaoWhereInput): Promise<Violacao[]> {
  const revisoes = await carregarRevisoesVarridas(db, extra);
  const configs = await db.configDocumentosProjeto.findMany({ select: { projetoId: true, diasAlertaCompartilhado: true } });
  const dias = new Map(configs.map((c) => [c.projetoId, c.diasAlertaCompartilhado]));
  return encontrarViolacoes(revisoes, { agora, diasAlertaPorProjeto: (p) => dias.get(p) ?? 7 });
}

export async function dispensasAtivas(db: Db): Promise<DispensaAtiva[]> {
  const linhas = await db.dispensaPendenciaCiclo.findMany({ where: { desfeitaEm: null } });
  return linhas.map((l) => ({
    id: l.id,
    alvoId: l.alvoId,
    tipo: l.tipo as TipoPendencia,
    chave: l.chave,
    motivo: l.motivo,
    criadaPorId: l.criadaPorId,
    criadaEm: l.criadaEm,
  }));
}

/** Violações + dispensas ativas → abertas e dispensadas. É o que o job avisa e a tela lista. */
export async function pendenciasAbertasDoCiclo(
  db: Db,
  agora: Date,
  extra?: Prisma.DocumentoRevisaoWhereInput,
): Promise<{ violacoes: Violacao[]; dispensas: DispensaAtiva[]; abertas: ItemPendencia[]; dispensadas: ItemPendencia[] }> {
  const violacoes = await violacoesDoCiclo(db, agora, extra);
  const dispensas = await dispensasAtivas(db);
  return { violacoes, dispensas, ...aplicarDispensas(violacoes, dispensas) };
}
```

- [ ] **Step 2: Fazer `integridade-service.ts` usar `varredura.ts`**

Substituir o bloco da linha 17 (`const linhas = await prisma.documentoRevisao.findMany({`) até a linha `const violacoes = encontrarViolacoes(...)` por:

```ts
  const violacoes = await violacoesDoCiclo(prisma, agora);
```

E ajustar os imports do arquivo: remover `RevisaoVarrida`, `EstadoRevisao` e `encontrarViolacoes` (já não usados); acrescentar `import { violacoesDoCiclo } from "./varredura";`. O resto da função (correção de I5, notificação) continua igual por enquanto — a Task 9 muda a notificação. O retorno `verificadas: revisoes.length` deixa de existir: trocar por `verificadas: violacoes.length` **não** serve (significa outra coisa); troque o campo por `violacoes: number` em `ResultadoIntegridade` e no `return` (`violacoes: violacoes.length`) e atualize o `console.log` de `src/lib/jobs.ts` (linha ~459) de `${r.verificadas} revisão(ões) verificada(s): ` para `${r.violacoes} violação(ões): `.

- [ ] **Step 3: Criar `pendencias-service.ts`**

```ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { gravarEventoNoTx } from "@/modules/uploads/historico/service";
import {
  alvoDaViolacao,
  assinaturaDaViolacao,
  ehDispensavel,
  MOTIVO_DISPENSA_ENCERRADA,
  MOTIVO_JA_DISPENSADA,
  MOTIVO_JA_RESOLVIDA,
  type TipoPendencia,
} from "./pendencias";
import { violacoesDoCiclo } from "./varredura";

/**
 * Dispensar e desfazer a dispensa de uma pendência do ciclo documental. Escrita SÓ aqui: transação, com a
 * revalidação da assinatura DENTRO dela e o evento no histórico do documento. Não muda estado nem controle
 * de revisão (isso é só de `service.ts`).
 */

const filtroDoAlvo = (tipo: TipoPendencia, alvoId: string): Prisma.DocumentoRevisaoWhereInput =>
  tipo === "duas_publicadas" ? { documentoId: alvoId } : { id: alvoId };

export async function dispensarNoBanco(input: {
  alvoId: string;
  tipo: TipoPendencia;
  chave: string;
  motivo: string;
  userId: string;
}): Promise<void> {
  const motivo = input.motivo.trim();
  try {
    await prisma.$transaction(async (tx) => {
      // A pendência ainda existe, com a MESMA assinatura que a tela mostrou? Senão a tela está velha.
      const violacoes = await violacoesDoCiclo(tx, new Date(), filtroDoAlvo(input.tipo, input.alvoId));
      const v = violacoes.filter(ehDispensavel).find((x) => x.tipo === input.tipo && alvoDaViolacao(x) === input.alvoId);
      if (!v || assinaturaDaViolacao(v) !== input.chave) throw new ActionError(MOTIVO_JA_RESOLVIDA);

      const ativa = await tx.dispensaPendenciaCiclo.findFirst({ where: { alvoId: input.alvoId, tipo: input.tipo, desfeitaEm: null } });
      if (ativa?.chave === input.chave) throw new ActionError(MOTIVO_JA_DISPENSADA);
      // Dispensa de uma assinatura ANTIGA ainda ativa (o job não passou): é encerrada e substituída.
      if (ativa) {
        await tx.dispensaPendenciaCiclo.updateMany({
          where: { id: ativa.id, desfeitaEm: null },
          data: { desfeitaEm: new Date(), desfeitaPorId: input.userId },
        });
      }

      await tx.dispensaPendenciaCiclo.create({
        data: { alvoId: input.alvoId, tipo: input.tipo, chave: input.chave, motivo, criadaPorId: input.userId },
      });
      await gravarEventoNoTx(tx, {
        documentoId: v.documentoId,
        revisaoId: v.tipo === "duas_publicadas" ? null : v.revisaoId,
        tipo: "pendencia_dispensada",
        userId: input.userId,
        detalhe: { pendencia: v.tipo, motivo },
      });
    });
  } catch (err) {
    // Dois cliques simultâneos: o índice parcial (uma ativa por alvo+tipo) barra o segundo.
    if ((err as { code?: string }).code === "P2002") throw new ActionError(MOTIVO_JA_DISPENSADA);
    throw err;
  }
}

export async function desfazerDispensaNoBanco(input: { alvoId: string; tipo: TipoPendencia; userId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.dispensaPendenciaCiclo.updateMany({
      where: { alvoId: input.alvoId, tipo: input.tipo, desfeitaEm: null },
      data: { desfeitaEm: new Date(), desfeitaPorId: input.userId },
    });
    if (count !== 1) throw new ActionError(MOTIVO_DISPENSA_ENCERRADA);

    const documentoId =
      input.tipo === "duas_publicadas"
        ? input.alvoId
        : (await tx.documentoRevisao.findUnique({ where: { id: input.alvoId }, select: { documentoId: true } }))?.documentoId;
    // Documento ou revisão apagados: não há histórico onde gravar (o evento tem FK para o documento).
    const documento = documentoId ? await tx.documentoDisciplina.findUnique({ where: { id: documentoId }, select: { id: true } }) : null;
    if (documento) {
      await gravarEventoNoTx(tx, {
        documentoId: documento.id,
        revisaoId: input.tipo === "duas_publicadas" ? null : input.alvoId,
        tipo: "pendencia_dispensa_desfeita",
        userId: input.userId,
        detalhe: { pendencia: input.tipo },
      });
    }
  });
}

/** Chamado pelo job diário com `dispensasObsoletas(...)`: encerra pelo sistema (`desfeitaPorId` nulo). */
export async function encerrarDispensasObsoletasNoBanco(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.dispensaPendenciaCiclo.updateMany({
    where: { id: { in: [...ids] }, desfeitaEm: null },
    data: { desfeitaEm: new Date(), desfeitaPorId: null },
  });
  return count;
}
```

- [ ] **Step 4: Checar tipos e lint**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`
Expected: sem erros.
Run: `npx eslint src/modules/uploads/ciclo`
Expected: sem avisos novos.
Run: `npx vitest run src/modules/uploads`
Expected: PASS (incluindo o teste-guarda de `Promise.all` em transação).

- [ ] **Step 5: Commit**

```bash
git add src/modules/uploads/ciclo/varredura.ts src/modules/uploads/ciclo/integridade-service.ts src/modules/uploads/ciclo/pendencias-service.ts src/lib/jobs.ts
git commit -m "feat(ciclo): varredura compartilhada e serviço de dispensa de pendência

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 5: Schemas e ações

**Files:**
- Create: `src/modules/uploads/ciclo/pendencias-schemas.ts`
- Test: `src/modules/uploads/ciclo/pendencias-schemas.test.ts`
- Create: `src/modules/uploads/ciclo/pendencias-actions.ts`

**Interfaces:**
- Consumes: `dispensarNoBanco`, `desfazerDispensaNoBanco` (Task 4); `TIPOS_PENDENCIA` (Task 1).
- Produces: `dispensarSchema`, `desfazerDispensaSchema`, `MOTIVO_MINIMO_DISPENSA` (schemas.ts); server actions `dispensarPendencia(input: { alvoId; tipo; chave; motivo })` e `desfazerDispensaPendencia(input: { alvoId; tipo })`, ambas `Promise<ActionResult<{ ok: true }>>`.

- [ ] **Step 1: Teste dos schemas (falha primeiro)**

Criar `src/modules/uploads/ciclo/pendencias-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { desfazerDispensaSchema, dispensarSchema, MOTIVO_MINIMO_DISPENSA } from "./pendencias-schemas";

const base = { alvoId: "r1", tipo: "publicada_com_lixeira" as const, chave: "lix:1:arquivado" };

describe("dispensarSchema", () => {
  it("aceita motivo com o mínimo de caracteres e apara os espaços", () => {
    const r = dispensarSchema.safeParse({ ...base, motivo: "  Limpeza de arquivos antigos  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motivo).toBe("Limpeza de arquivos antigos");
  });

  it("recusa motivo só com espaços ou curto, com a mensagem de campo", () => {
    for (const motivo of ["", "          ", "curto"]) {
      const r = dispensarSchema.safeParse({ ...base, motivo });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe(`Explique o motivo (pelo menos ${MOTIVO_MINIMO_DISPENSA} caracteres).`);
    }
  });

  it("recusa motivo acima de 500 caracteres", () => {
    expect(dispensarSchema.safeParse({ ...base, motivo: "x".repeat(501) }).success).toBe(false);
  });

  it("recusa tipo fora dos dispensáveis (I5 não tem dispensa)", () => {
    expect(dispensarSchema.safeParse({ ...base, tipo: "controle_fora_de_publicada", motivo: "Motivo válido aqui" }).success).toBe(false);
  });

  it("exige alvo e assinatura", () => {
    expect(dispensarSchema.safeParse({ ...base, alvoId: "", motivo: "Motivo válido aqui" }).success).toBe(false);
    expect(dispensarSchema.safeParse({ ...base, chave: "", motivo: "Motivo válido aqui" }).success).toBe(false);
  });
});

describe("desfazerDispensaSchema", () => {
  it("só alvo e tipo", () => {
    expect(desfazerDispensaSchema.safeParse({ alvoId: "r1", tipo: "analise_parada" }).success).toBe(true);
    expect(desfazerDispensaSchema.safeParse({ alvoId: "r1", tipo: "outro" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/uploads/ciclo/pendencias-schemas.test.ts`
Expected: FAIL (import não resolve).

- [ ] **Step 3: Implementar `pendencias-schemas.ts`**

```ts
import { z } from "zod";
import { TIPOS_PENDENCIA } from "./pendencias";

/** Mesmo mínimo do diálogo de motivo (`MOTIVO_MINIMO_TELA`): a tela e o servidor recusam igual. */
export const MOTIVO_MINIMO_DISPENSA = 10;

export const dispensarSchema = z.object({
  alvoId: z.string().min(1),
  tipo: z.enum(TIPOS_PENDENCIA),
  /** Assinatura que a tela mostrou; o serviço confere com a de agora. */
  chave: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(MOTIVO_MINIMO_DISPENSA, `Explique o motivo (pelo menos ${MOTIVO_MINIMO_DISPENSA} caracteres).`)
    .max(500, "O motivo pode ter até 500 caracteres."),
});

export const desfazerDispensaSchema = z.object({
  alvoId: z.string().min(1),
  tipo: z.enum(TIPOS_PENDENCIA),
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/uploads/ciclo/pendencias-schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Criar `pendencias-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { desfazerDispensaNoBanco, dispensarNoBanco } from "./pendencias-service";
import { desfazerDispensaSchema, dispensarSchema } from "./pendencias-schemas";

/**
 * Ações da tela de pendências documentais. Gate = o mesmo da tela e da audiência do aviso
 * (`notificacoes:gestao`, só gente de dentro). Uma pendência por chamada: o lote da tela repete a ação
 * no navegador (`useLote`). Nenhuma escreve no banco por conta própria — vão ao serviço.
 */

export const dispensarPendencia = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-dispensar-pendencia",
    recurso: "notificacoes",
    permissao: "gestao",
    interno: true,
    entidade: "DispensaPendenciaCiclo",
    schema: dispensarSchema,
    entidadeId: (_d, input) => input.alvoId,
  },
  async (input, { user }) => {
    await dispensarNoBanco({ alvoId: input.alvoId, tipo: input.tipo, chave: input.chave, motivo: input.motivo, userId: user.id });
    revalidatePath("/arquivos/pendencias");
    return { ok: true as const };
  },
);

export const desfazerDispensaPendencia = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-desfazer-dispensa",
    recurso: "notificacoes",
    permissao: "gestao",
    interno: true,
    entidade: "DispensaPendenciaCiclo",
    schema: desfazerDispensaSchema,
    entidadeId: (_d, input) => input.alvoId,
  },
  async (input, { user }) => {
    await desfazerDispensaNoBanco({ alvoId: input.alvoId, tipo: input.tipo, userId: user.id });
    revalidatePath("/arquivos/pendencias");
    return { ok: true as const };
  },
);
```

- [ ] **Step 6: Checar e commit**

Run: `npx vitest run src/modules/uploads/ciclo && npx eslint src/modules/uploads/ciclo`
Expected: PASS, sem avisos.

```bash
git add src/modules/uploads/ciclo/pendencias-schemas.ts src/modules/uploads/ciclo/pendencias-schemas.test.ts src/modules/uploads/ciclo/pendencias-actions.ts
git commit -m "feat(ciclo): ações de dispensar e desfazer dispensa de pendência

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 6: Leitura da tela (`pendencias-queries.ts`)

**Files:**
- Create: `src/modules/uploads/ciclo/pendencias-queries.ts`

**Interfaces:**
- Consumes: `pendenciasAbertasDoCiclo` (Task 4), `detalheDaViolacao`, `ItemPendencia`, `TipoPendencia` (Task 1), `MOTIVO_CORRECAO_INTEGRIDADE` (`integridade.ts`).
- Produces:
  - `type PendenciaDoCiclo = { id: string; tipo: TipoPendencia | "corrigida"; alvoId: string; chave: string; documentoId: string; disciplinaId: string; documentoNome: string; revisao: string | null; estado: string | null; projetoId: string; projetoNome: string; projetoCodigo: string; detalhe: string; complemento: string | null; dispensa: { motivo: string; por: string; em: string } | null }`
  - `type PendenciasDoCiclo = { abertas: PendenciaDoCiclo[]; dispensadas: PendenciaDoCiclo[]; corrigidas: PendenciaDoCiclo[] }`
  - `pendenciasDoCiclo(agora?: Date): Promise<PendenciasDoCiclo>`

Sem teste unitário (I/O); coberto pelo smoke (Task 10) e pela verificação em tela (Task 8).

- [ ] **Step 1: Escrever o arquivo**

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarData, rotuloRevisao } from "@/lib/utils";
import { MOTIVO_CORRECAO_INTEGRIDADE } from "./integridade";
import { detalheDaViolacao, type ItemPendencia, type TipoPendencia } from "./pendencias";
import { pendenciasAbertasDoCiclo } from "./varredura";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Quanto tempo uma correção automática fica visível na tela. */
const JANELA_CORRIGIDAS_DIAS = 30;

/** Linha da tela. Datas como texto ISO: o objeto atravessa Server → Client Component. */
export type PendenciaDoCiclo = {
  /** `${tipo}:${alvoId}` (a corrigida usa o id do controle). Chave da linha e da seleção. */
  id: string;
  tipo: TipoPendencia | "corrigida";
  alvoId: string;
  /** Assinatura de agora; a ação de dispensar a devolve ao servidor para conferir. Vazia na corrigida. */
  chave: string;
  documentoId: string;
  disciplinaId: string;
  documentoNome: string;
  revisao: string | null;
  estado: string | null;
  projetoId: string;
  projetoNome: string;
  projetoCodigo: string;
  detalhe: string;
  complemento: string | null;
  dispensa: { motivo: string; por: string; em: string } | null;
};

export type PendenciasDoCiclo = {
  abertas: PendenciaDoCiclo[];
  dispensadas: PendenciaDoCiclo[];
  corrigidas: PendenciaDoCiclo[];
};

const porProjetoEDocumento = (a: PendenciaDoCiclo, b: PendenciaDoCiclo) =>
  a.projetoNome.localeCompare(b.projetoNome, "pt-BR") || a.documentoNome.localeCompare(b.documentoNome, "pt-BR");

export async function pendenciasDoCiclo(agora: Date = new Date()): Promise<PendenciasDoCiclo> {
  const { abertas, dispensadas } = await pendenciasAbertasDoCiclo(prisma, agora);
  const itens: ItemPendencia[] = [...abertas, ...dispensadas];

  const controles = await prisma.controleRevisao.findMany({
    where: {
      removidoEm: { gte: new Date(agora.getTime() - JANELA_CORRIGIDAS_DIAS * DIA_MS) },
      removidoPorId: null,
      motivoRemocao: MOTIVO_CORRECAO_INTEGRIDADE,
    },
    orderBy: { removidoEm: "desc" },
    take: 100,
    select: { id: true, tipo: true, removidoEm: true, revisao: { select: { numero: true, documentoId: true } } },
  });

  const documentoIds = [...new Set([...itens.map((i) => i.violacao.documentoId), ...controles.map((c) => c.revisao.documentoId)])];
  const documentos = await prisma.documentoDisciplina.findMany({
    where: { id: { in: documentoIds } },
    select: {
      id: true,
      titulo: true,
      nomeArquivo: true,
      disciplinaId: true,
      disciplina: { select: { projetoId: true, projeto: { select: { nome: true, codigo: true } } } },
    },
  });
  const docPorId = new Map(documentos.map((d) => [d.id, d]));

  // Quem excluiu e quando: o último arquivo que foi para a lixeira em cada revisão. `substituidoPorId`
  // explícito é o escape do filtro de "versão atual" — o arquivo trocado e depois excluído também conta.
  const revisaoIds = itens.flatMap((i) => (i.violacao.tipo === "publicada_com_lixeira" ? [i.violacao.revisaoId] : []));
  const excluidos = await prisma.upload.findMany({
    where: { revisaoId: { in: revisaoIds }, excluidoEm: { not: null }, substituidoPorId: { not: undefined } },
    orderBy: { excluidoEm: "desc" },
    select: { revisaoId: true, excluidoEm: true, excluidoPorId: true },
  });
  const ultimaExclusao = new Map<string, { em: Date; por: string | null }>();
  for (const u of excluidos) {
    if (u.revisaoId && u.excluidoEm && !ultimaExclusao.has(u.revisaoId)) ultimaExclusao.set(u.revisaoId, { em: u.excluidoEm, por: u.excluidoPorId });
  }

  const idsDePessoas = new Set<string>();
  for (const x of ultimaExclusao.values()) if (x.por) idsDePessoas.add(x.por);
  for (const i of itens) if (i.dispensa) idsDePessoas.add(i.dispensa.criadaPorId);
  const pessoas = await prisma.user.findMany({ where: { id: { in: [...idsDePessoas] } }, select: { id: true, name: true } });
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.name]));

  const doItem = (i: ItemPendencia): PendenciaDoCiclo | null => {
    const v = i.violacao;
    const doc = docPorId.get(v.documentoId);
    if (!doc) return null; // documento apagado entre a varredura e agora
    const { detalhe, complemento } = detalheDaViolacao(v);
    const exclusao = v.tipo === "publicada_com_lixeira" ? ultimaExclusao.get(v.revisaoId) : undefined;
    const quem = exclusao?.por ? nomeDe.get(exclusao.por) : null;
    const textoExclusao = exclusao ? `excluído${quem ? ` por ${quem}` : ""} em ${formatarData(exclusao.em)}` : null;
    return {
      id: `${v.tipo}:${i.alvoId}`,
      tipo: v.tipo,
      alvoId: i.alvoId,
      chave: i.chave,
      documentoId: v.documentoId,
      disciplinaId: doc.disciplinaId,
      documentoNome: doc.titulo ?? doc.nomeArquivo,
      revisao: v.tipo === "duas_publicadas" ? null : rotuloRevisao(v.numero),
      estado: v.tipo === "publicada_com_lixeira" ? v.estado : null,
      projetoId: doc.disciplina.projetoId,
      projetoNome: doc.disciplina.projeto.nome,
      projetoCodigo: doc.disciplina.projeto.codigo,
      detalhe,
      complemento: [textoExclusao, complemento].filter(Boolean).join(" · ") || null,
      dispensa: i.dispensa
        ? { motivo: i.dispensa.motivo, por: nomeDe.get(i.dispensa.criadaPorId) ?? "—", em: i.dispensa.criadaEm.toISOString() }
        : null,
    };
  };

  const corrigidas: PendenciaDoCiclo[] = [];
  for (const c of controles) {
    const doc = docPorId.get(c.revisao.documentoId);
    if (!doc || !c.removidoEm) continue;
    corrigidas.push({
      id: `corrigida:${c.id}`,
      tipo: "corrigida",
      alvoId: c.id,
      chave: "",
      documentoId: c.revisao.documentoId,
      disciplinaId: doc.disciplinaId,
      documentoNome: doc.titulo ?? doc.nomeArquivo,
      revisao: rotuloRevisao(c.revisao.numero),
      estado: null,
      projetoId: doc.disciplina.projetoId,
      projetoNome: doc.disciplina.projeto.nome,
      projetoCodigo: doc.disciplina.projeto.codigo,
      detalhe: c.tipo === "liberado_obra" ? "Estava liberada para obra sem estar publicada" : "Estava enviada ao cliente sem estar publicada",
      complemento: `revogada em ${formatarData(c.removidoEm)}`,
      dispensa: null,
    });
  }

  const montar = (lista: ItemPendencia[]) =>
    lista.map(doItem).filter((x): x is PendenciaDoCiclo => x !== null).sort(porProjetoEDocumento);
  return { abertas: montar(abertas), dispensadas: montar(dispensadas), corrigidas: corrigidas.sort(porProjetoEDocumento) };
}
```

- [ ] **Step 2: Checar tipos/lint**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit` e `npx eslint src/modules/uploads/ciclo/pendencias-queries.ts`
Expected: sem erros. (Se o tsc reclamar de `substituidoPorId: { not: undefined }`, é o mesmo escape usado em `uploads/actions.ts:885`; confira o spelling lá.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/uploads/ciclo/pendencias-queries.ts
git commit -m "feat(ciclo): leitura da tela de pendências documentais

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 7: Descritor de ações, textos "o que fazer" e filtro (puros)

**Files:**
- Create: `src/modules/uploads/ciclo/acoes-pendencia.ts` + `acoes-pendencia.test.ts`
- Create: `src/modules/uploads/ciclo/guia-pendencia.ts` + `guia-pendencia.test.ts`
- Create: `src/modules/uploads/ciclo/pendencias-filtro.ts` + `pendencias-filtro.test.ts`

**Interfaces:**
- Consumes: `MOTIVO_NAO_DISPENSAVEL`, `ROTULO_PENDENCIA`, `TipoPendencia` (Task 1); `limparSeparadores`, `AcaoItem` de `@/components/ui/acoes`.
- Produces:
  - `itensDePendenciaCiclo(p: { tipo: TipoPendencia | "corrigida"; dispensada: boolean; hrefDocumento: string; hrefLixeira: string }): AcaoItem[]`; ids: `abrir-documento` (link), `abrir-lixeira` (link), `dispensar`, `desfazer-dispensa` (ações)
  - `itensDaSelecaoDePendencias(): AcaoItem[]` (só `dispensar`)
  - `guiaDaPendencia(p: { tipo: TipoPendencia | "corrigida"; estado: string | null }): { resumo: string; passos: string[] }`
  - `GUIA_DOS_TIPOS: { tipo: TipoPendencia | "corrigida"; rotulo: string; texto: string }[]`
  - `filtrarPendencias<T extends LinhaFiltravel>(linhas: readonly T[], f: { tipo: string; projetoId: string; q: string; mostrarDispensadas: boolean }): T[]`
  - `contarPendencias(linhas: readonly LinhaFiltravel[]): Record<"todas" | TipoPendencia | "corrigida", number>`

- [ ] **Step 1: Testes (falham primeiro)**

`acoes-pendencia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MOTIVO_NAO_DISPENSAVEL } from "./pendencias";
import { itensDaSelecaoDePendencias, itensDePendenciaCiclo } from "./acoes-pendencia";

const base = { dispensada: false, hrefDocumento: "/projetos/p1/arquivos?disciplinaId=d1", hrefLixeira: "/projetos/p1/arquivos?area=lixeira" };
const ids = (xs: ReturnType<typeof itensDePendenciaCiclo>) => xs.map((x) => x.id);

describe("itensDePendenciaCiclo", () => {
  it("lixeira aberta: documento, lixeira do projeto e dispensar", () => {
    const itens = itensDePendenciaCiclo({ ...base, tipo: "publicada_com_lixeira" });
    expect(ids(itens)).toEqual(["abrir-documento", "abrir-lixeira", "sep-dispensa", "dispensar"]);
    expect(itens[0]).toMatchObject({ tipo: "link", href: base.hrefDocumento });
    expect(itens[1]).toMatchObject({ tipo: "link", href: base.hrefLixeira });
    expect(itens[3]).toMatchObject({ tipo: "acao", id: "dispensar" });
    expect(itens[3]).not.toHaveProperty("desabilitado");
  });

  it("só a lixeira oferece abrir a lixeira", () => {
    expect(ids(itensDePendenciaCiclo({ ...base, tipo: "analise_parada" }))).toEqual(["abrir-documento", "sep-dispensa", "dispensar"]);
    expect(ids(itensDePendenciaCiclo({ ...base, tipo: "duas_publicadas" }))).toEqual(["abrir-documento", "sep-dispensa", "dispensar"]);
  });

  it("dispensada: o item vira desfazer dispensa", () => {
    expect(ids(itensDePendenciaCiclo({ ...base, tipo: "analise_parada", dispensada: true }))).toEqual([
      "abrir-documento",
      "sep-dispensa",
      "desfazer-dispensa",
    ]);
  });

  it("corrigida automaticamente: dispensar vem desabilitado com a frase do servidor", () => {
    const itens = itensDePendenciaCiclo({ ...base, tipo: "corrigida" });
    expect(itens.find((i) => i.id === "dispensar")).toMatchObject({ desabilitado: MOTIVO_NAO_DISPENSAVEL });
  });
});

describe("itensDaSelecaoDePendencias", () => {
  it("a barra de lote só dispensa", () => {
    expect(itensDaSelecaoDePendencias().map((i) => i.id)).toEqual(["dispensar"]);
  });
});
```

`guia-pendencia.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GUIA_DOS_TIPOS, guiaDaPendencia } from "./guia-pendencia";

describe("guiaDaPendencia", () => {
  it("lixeira de revisão publicada: é o arquivo vigente e manda restaurar ou republicar", () => {
    const g = guiaDaPendencia({ tipo: "publicada_com_lixeira", estado: "publicado" });
    expect(g.resumo).toMatch(/vigente/);
    expect(g.passos.join(" ")).toMatch(/Restaure/);
    expect(g.passos.join(" ")).toMatch(/nova revisão/);
  });

  it("lixeira de revisão arquivada: costuma ser limpeza", () => {
    const g = guiaDaPendencia({ tipo: "publicada_com_lixeira", estado: "arquivado" });
    expect(g.resumo).toMatch(/antiga/);
    expect(g.passos.join(" ")).toMatch(/Dispense/);
  });

  it("duas publicadas: manda não dispensar", () => {
    expect(guiaDaPendencia({ tipo: "duas_publicadas", estado: null }).passos.join(" ")).toMatch(/Não dispense/);
  });

  it("corrigida: nada a fazer", () => {
    expect(guiaDaPendencia({ tipo: "corrigida", estado: null }).resumo).toMatch(/Nada a fazer/);
  });

  it("o painel cobre os quatro tipos", () => {
    expect(GUIA_DOS_TIPOS.map((g) => g.tipo)).toEqual(["publicada_com_lixeira", "analise_parada", "duas_publicadas", "corrigida"]);
  });
});
```

`pendencias-filtro.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contarPendencias, filtrarPendencias, type LinhaFiltravel } from "./pendencias-filtro";

const l = (p: Partial<LinhaFiltravel>): LinhaFiltravel => ({ tipo: "publicada_com_lixeira", projetoId: "p1", documentoNome: "PLANTA BAIXA", dispensa: null, ...p });
const linhas: LinhaFiltravel[] = [
  l({}),
  l({ tipo: "analise_parada", projetoId: "p2", documentoNome: "MEMORIAL" }),
  l({ dispensa: { x: 1 }, documentoNome: "DISPENSADA" }),
  l({ tipo: "corrigida", documentoNome: "CORRIGIDA" }),
];
const f = { tipo: "todas", projetoId: "", q: "", mostrarDispensadas: false };

describe("filtrarPendencias", () => {
  it("padrão: só abertas (sem dispensadas e sem corrigidas)", () => {
    expect(filtrarPendencias(linhas, f).map((x) => x.documentoNome)).toEqual(["PLANTA BAIXA", "MEMORIAL"]);
  });
  it("mostrar dispensadas inclui as dispensadas, nunca as corrigidas", () => {
    expect(filtrarPendencias(linhas, { ...f, mostrarDispensadas: true }).map((x) => x.documentoNome)).toEqual(["PLANTA BAIXA", "MEMORIAL", "DISPENSADA"]);
  });
  it("chip de tipo, projeto e busca combinam", () => {
    expect(filtrarPendencias(linhas, { ...f, tipo: "analise_parada" }).map((x) => x.documentoNome)).toEqual(["MEMORIAL"]);
    expect(filtrarPendencias(linhas, { ...f, projetoId: "p2" }).map((x) => x.documentoNome)).toEqual(["MEMORIAL"]);
    expect(filtrarPendencias(linhas, { ...f, q: "  planta " }).map((x) => x.documentoNome)).toEqual(["PLANTA BAIXA"]);
  });
  it("chip das corrigidas mostra só as corrigidas", () => {
    expect(filtrarPendencias(linhas, { ...f, tipo: "corrigida" }).map((x) => x.documentoNome)).toEqual(["CORRIGIDA"]);
  });
});

describe("contarPendencias", () => {
  it("conta abertas por tipo e as corrigidas à parte; dispensada não entra", () => {
    expect(contarPendencias(linhas)).toEqual({ todas: 2, publicada_com_lixeira: 1, analise_parada: 1, duas_publicadas: 0, corrigida: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/uploads/ciclo/acoes-pendencia.test.ts src/modules/uploads/ciclo/guia-pendencia.test.ts src/modules/uploads/ciclo/pendencias-filtro.test.ts`
Expected: FAIL (imports não resolvem).

- [ ] **Step 3: Implementar os três módulos**

`acoes-pendencia.ts`:

```ts
import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_NAO_DISPENSAVEL, type TipoPendencia } from "./pendencias";

/**
 * Itens do menu de uma linha de pendência documental — **puro** (ADR-0002). O mesmo array alimenta o menu
 * de contexto e o `...`. O gate da tela e o das ações são o mesmo, então não há item omitido por perfil;
 * o que o ESTADO impede vem desabilitado com a MESMA frase do servidor.
 */
export function itensDePendenciaCiclo(p: {
  tipo: TipoPendencia | "corrigida";
  dispensada: boolean;
  hrefDocumento: string;
  hrefLixeira: string;
}): AcaoItem[] {
  const itens: AcaoItem[] = [{ tipo: "link", id: "abrir-documento", rotulo: "Abrir documento", href: p.hrefDocumento }];
  if (p.tipo === "publicada_com_lixeira") {
    itens.push({ tipo: "link", id: "abrir-lixeira", rotulo: "Abrir lixeira do projeto", href: p.hrefLixeira });
  }
  itens.push({ tipo: "separador", id: "sep-dispensa" });
  if (p.dispensada) itens.push({ tipo: "acao", id: "desfazer-dispensa", rotulo: "Desfazer dispensa" });
  else if (p.tipo === "corrigida") itens.push({ tipo: "acao", id: "dispensar", rotulo: "Dispensar…", desabilitado: MOTIVO_NAO_DISPENSAVEL });
  else itens.push({ tipo: "acao", id: "dispensar", rotulo: "Dispensar…" });
  return limparSeparadores(itens);
}

/** A barra de lote só dispensa (a seleção só aceita pendências abertas). O diálogo de motivo é a confirmação. */
export function itensDaSelecaoDePendencias(): AcaoItem[] {
  return [{ tipo: "acao", id: "dispensar", rotulo: "Dispensar…" }];
}
```

`guia-pendencia.ts`:

```ts
import { ROTULO_PENDENCIA, type TipoPendencia } from "./pendencias";

type Tipo = TipoPendencia | "corrigida";

/** O que fazer com a pendência — texto do bloco da linha. Puro, testado. */
export function guiaDaPendencia(p: { tipo: Tipo; estado: string | null }): { resumo: string; passos: string[] } {
  if (p.tipo === "publicada_com_lixeira" && p.estado === "publicado") {
    return {
      resumo: "Este é o arquivo vigente do documento e está na lixeira.",
      passos: [
        "Abra a lixeira do projeto e veja quem excluiu e por quê.",
        "Foi engano? Restaure o arquivo (só administrador).",
        "O arquivo mudou de verdade? Publique uma nova revisão.",
        "Foi intencional? Dispense com o motivo.",
      ],
    };
  }
  if (p.tipo === "publicada_com_lixeira") {
    return {
      resumo: "Revisão antiga, já substituída. Excluir o arquivo costuma ser limpeza.",
      passos: [
        "Foi limpeza proposital? Dispense com o motivo.",
        "Não foi? Restaure da lixeira: o arquivo arquivado é o registro daquela revisão.",
      ],
    };
  }
  if (p.tipo === "analise_parada") {
    return {
      resumo: "A revisão espera análise além do prazo do projeto.",
      passos: [
        "Abra o documento e veja quem deve analisar.",
        "Cobre a análise, ou aprove ou devolva a revisão.",
        "A espera foi combinada? Dispense com o motivo.",
      ],
    };
  }
  if (p.tipo === "duas_publicadas") {
    return {
      resumo: "Não deveria acontecer: o banco devia impedir.",
      passos: [
        "Abra o documento e confira qual revisão é a vigente.",
        "Arquive a outra.",
        "Avise o desenvolvedor, porque o índice do banco falhou. Não dispense.",
      ],
    };
  }
  return {
    resumo: "Nada a fazer. O sistema já resolveu.",
    passos: ["A liberação indevida foi revogada e está no histórico do documento."],
  };
}

/** Painel "Como resolver cada tipo de pendência", no alto da tela. */
export const GUIA_DOS_TIPOS: { tipo: Tipo; rotulo: string; texto: string }[] = [
  {
    tipo: "publicada_com_lixeira",
    rotulo: ROTULO_PENDENCIA.publicada_com_lixeira,
    texto:
      "Um arquivo de revisão publicada ou arquivada foi para a lixeira. Revisão publicada é o arquivo vigente: restaure, ou publique outra revisão. Revisão arquivada costuma ser limpeza: se foi proposital, dispense com o motivo.",
  },
  {
    tipo: "analise_parada",
    rotulo: ROTULO_PENDENCIA.analise_parada,
    texto: "A revisão está em análise além do prazo do projeto. Cobre quem analisa, ou aprove ou devolva. Dispense só se a espera foi combinada.",
  },
  {
    tipo: "duas_publicadas",
    rotulo: ROTULO_PENDENCIA.duas_publicadas,
    texto: "Não deveria acontecer. Confira qual revisão é a vigente e arquive a outra. Não dispense: avise o desenvolvedor.",
  },
  {
    tipo: "corrigida",
    rotulo: ROTULO_PENDENCIA.corrigida,
    texto: "Nada a fazer. O sistema revogou uma liberação indevida e gravou no histórico do documento.",
  },
];
```

`pendencias-filtro.ts`:

```ts
import type { TipoPendencia } from "./pendencias";

export type LinhaFiltravel = {
  tipo: TipoPendencia | "corrigida";
  projetoId: string;
  documentoNome: string;
  dispensa: unknown | null;
};

/**
 * Filtro da lista (puro). Padrão: só pendências abertas. A dispensada entra com "Mostrar dispensadas";
 * a corrigida automaticamente só aparece no chip dela (não é pendência, é histórico).
 */
export function filtrarPendencias<T extends LinhaFiltravel>(
  linhas: readonly T[],
  f: { tipo: string; projetoId: string; q: string; mostrarDispensadas: boolean },
): T[] {
  const q = f.q.trim().toLowerCase();
  return linhas.filter((l) => {
    if (f.tipo === "corrigida") {
      if (l.tipo !== "corrigida") return false;
    } else {
      if (l.tipo === "corrigida") return false;
      if (f.tipo !== "todas" && l.tipo !== f.tipo) return false;
      if (l.dispensa && !f.mostrarDispensadas) return false;
    }
    if (f.projetoId && l.projetoId !== f.projetoId) return false;
    if (q && !l.documentoNome.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Contagem dos chips: abertas por tipo (dispensada não conta) e as corrigidas à parte. */
export function contarPendencias(linhas: readonly LinhaFiltravel[]): Record<"todas" | TipoPendencia | "corrigida", number> {
  const c = { todas: 0, publicada_com_lixeira: 0, analise_parada: 0, duas_publicadas: 0, corrigida: 0 };
  for (const l of linhas) {
    if (l.tipo === "corrigida") c.corrigida++;
    else if (!l.dispensa) {
      c.todas++;
      c[l.tipo]++;
    }
  }
  return c;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/uploads/ciclo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/uploads/ciclo/acoes-pendencia.ts src/modules/uploads/ciclo/acoes-pendencia.test.ts src/modules/uploads/ciclo/guia-pendencia.ts src/modules/uploads/ciclo/guia-pendencia.test.ts src/modules/uploads/ciclo/pendencias-filtro.ts src/modules/uploads/ciclo/pendencias-filtro.test.ts
git commit -m "feat(ciclo): descritor de ações, guia e filtro da tela de pendências

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 8: Rota, tela e menu

**Files:**
- Create: `src/app/(dashboard)/arquivos/pendencias/page.tsx`
- Create: `src/app/(dashboard)/arquivos/pendencias/loading.tsx`
- Create: `src/components/arquivos/pendencias-view.tsx`
- Modify: `src/lib/nav-config.ts` (item após "Aprovações", ~linha 198; import do ícone no topo)
- Modify: `src/lib/nav-config.test.ts`

**Interfaces:**
- Consumes: `pendenciasDoCiclo`, `PendenciasDoCiclo`, `PendenciaDoCiclo` (Task 6); `dispensarPendencia`, `desfazerDispensaPendencia` (Task 5); `itensDePendenciaCiclo`, `itensDaSelecaoDePendencias` (Task 7); `guiaDaPendencia`, `GUIA_DOS_TIPOS`; `filtrarPendencias`, `contarPendencias`; `ROTULO_PENDENCIA`, `TipoPendencia`.
- Produces: rota `/arquivos/pendencias`.

- [ ] **Step 1: Teste do menu (falha primeiro)**

Em `src/lib/nav-config.test.ts`, dentro do primeiro `describe("hrefAtivo", ...)` acrescentar ao `it("acende só o item mais específico", ...)`:

```ts
    expect(hrefAtivo("/arquivos/pendencias", itens)).toBe("/arquivos/pendencias");
    expect(hrefAtivo("/arquivos", itens)).toBe("/arquivos");
```

E ao fim do arquivo:

```ts
describe("item Pendências documentais", () => {
  it("fica ao lado de Aprovações, só para quem recebe os avisos de gestão", () => {
    const item = itens.find((i) => i.href === "/arquivos/pendencias");
    expect(item).toMatchObject({ title: "Pendências", permissao: "notificacoes:gestao", tipo: "interno" });
  });
});
```

Run: `npx vitest run src/lib/nav-config.test.ts`
Expected: FAIL.

- [ ] **Step 2: Item de menu**

Em `src/lib/nav-config.ts`: acrescentar `FileWarning` ao import de `lucide-react` e, logo depois do item `Aprovações`:

```ts
      {
        title: "Pendências",
        href: "/arquivos/pendencias",
        icon: FileWarning,
        permissao: "notificacoes:gestao",
        tipo: "interno",
      },
```

Run: `npx vitest run src/lib/nav-config.test.ts`
Expected: PASS.

- [ ] **Step 3: Página, `loading.tsx`**

`src/app/(dashboard)/arquivos/pendencias/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { pendenciasDoCiclo } from "@/modules/uploads/ciclo/pendencias-queries";
import { PendenciasView } from "@/components/arquivos/pendencias-view";

export const metadata: Metadata = { title: "Pendências documentais" };

export default async function PendenciasDocumentaisPage() {
  // Dispensar é escrita: `can()` puro, e NÃO `requirePermission` (que aplica o piso de sócio, só leitura).
  // O gate é o mesmo da audiência do aviso diário e das ações.
  const user = await requireUser();
  if (user.tipo !== "interno" || !(await can(user, "notificacoes", "gestao"))) redirect("/sem-permissao");

  const dados = await pendenciasDoCiclo();
  return <PendenciasView {...dados} />;
}
```

`src/app/(dashboard)/arquivos/pendencias/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
```

- [ ] **Step 4: A tela (`pendencias-view.tsx`)**

Criar `src/components/arquivos/pendencias-view.tsx`:

```tsx
"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { MotivoDialog } from "@/components/rh/motivo-dialog";
import { formatarDataHora } from "@/lib/utils";
import { useSetParams } from "@/lib/use-set-param";
import { desfazerDispensaPendencia, dispensarPendencia } from "@/modules/uploads/ciclo/pendencias-actions";
import { itensDaSelecaoDePendencias, itensDePendenciaCiclo } from "@/modules/uploads/ciclo/acoes-pendencia";
import { GUIA_DOS_TIPOS, guiaDaPendencia } from "@/modules/uploads/ciclo/guia-pendencia";
import { contarPendencias, filtrarPendencias } from "@/modules/uploads/ciclo/pendencias-filtro";
import { ROTULO_PENDENCIA, type TipoPendencia } from "@/modules/uploads/ciclo/pendencias";
import type { PendenciaDoCiclo, PendenciasDoCiclo } from "@/modules/uploads/ciclo/pendencias-queries";

const TODOS = "todos";
const TOM: Record<PendenciaDoCiclo["tipo"], "danger" | "warning" | "success"> = {
  publicada_com_lixeira: "danger",
  analise_parada: "warning",
  duas_publicadas: "danger",
  corrigida: "success",
};
const CHIPS: { id: string; rotulo: string }[] = [
  { id: "todas", rotulo: "Abertas" },
  { id: "publicada_com_lixeira", rotulo: ROTULO_PENDENCIA.publicada_com_lixeira },
  { id: "analise_parada", rotulo: ROTULO_PENDENCIA.analise_parada },
  { id: "duas_publicadas", rotulo: ROTULO_PENDENCIA.duas_publicadas },
  { id: "corrigida", rotulo: ROTULO_PENDENCIA.corrigida },
];

const selecionavel = (l: PendenciaDoCiclo) => l.tipo !== "corrigida" && !l.dispensa;
const hrefsDe = (l: PendenciaDoCiclo) => ({
  hrefDocumento: `/projetos/${l.projetoId}/arquivos?disciplinaId=${l.disciplinaId}`,
  hrefLixeira: `/projetos/${l.projetoId}/arquivos?area=lixeira`,
});

/**
 * Pendências do ciclo documental (administradores). Uma lista, filtros na URL, "o que fazer" por linha e
 * dispensa com motivo — uma ou em lote. O mesmo `itensDePendenciaCiclo` alimenta o menu de contexto e o
 * `...` (ADR-0002); o lote repete a ação de UMA pendência (`useLote`, teto de 100).
 */
export function PendenciasView({ abertas, dispensadas, corrigidas }: PendenciasDoCiclo) {
  const router = useRouter();
  const sp = useSearchParams();
  const setParams = useSetParams();
  const selecao = useSelecao();
  const lote = useLote();
  const [pending, start] = useTransition();
  const [guias, setGuias] = useState<ReadonlySet<string>>(() => new Set());
  const [dispensando, setDispensando] = useState<string[] | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");

  const todas = useMemo(() => [...abertas, ...dispensadas, ...corrigidas], [abertas, dispensadas, corrigidas]);
  const porId = useMemo(() => new Map(todas.map((l) => [l.id, l])), [todas]);
  const projetos = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of todas) m.set(l.projetoId, `${l.projetoCodigo} · ${l.projetoNome}`);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todas]);

  const tipo = sp.get("tipo") ?? "todas";
  const projetoId = sp.get("projeto") ?? "";
  const mostrarDispensadas = sp.get("dispensadas") === "1";
  const visiveis = filtrarPendencias(todas, { tipo, projetoId, q, mostrarDispensadas });
  const contagem = contarPendencias(todas);
  const idsSelecionaveis = visiveis.filter(selecionavel).map((l) => l.id);

  function aoSelecionar(l: PendenciaDoCiclo, item: AcaoItemAcao) {
    if (item.id === "dispensar") setDispensando(selecao.marcado(l.id) ? selecao.lista : [l.id]);
    else if (item.id === "desfazer-dispensa") {
      start(async () => {
        const r = await desfazerDispensaPendencia({ alvoId: l.alvoId, tipo: l.tipo as TipoPendencia });
        if (r.ok) {
          toast.success("Dispensa desfeita.");
          router.refresh();
        } else toast.error(r.error);
      });
    }
  }

  function alternarGuia(id: string) {
    setGuias((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Pendências documentais"
        descricao="Revisões que fogem da regra do ciclo e esperam uma decisão."
        acoes={
          <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={pending}>
            Atualizar
          </Button>
        }
      />

      <details className="rounded-sm border bg-card px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Como resolver cada tipo de pendência</summary>
        <dl className="mt-3 grid gap-x-4 gap-y-2 md:grid-cols-[max-content_minmax(0,1fr)]">
          {GUIA_DOS_TIPOS.map((g) => (
            <Fragment key={g.tipo}>
              <dt>
                <StatusBadge tone={TOM[g.tipo]}>{g.rotulo}</StatusBadge>
              </dt>
              <dd className="text-muted-foreground md:mb-0 mb-2">{g.texto}</dd>
            </Fragment>
          ))}
        </dl>
      </details>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de pendência">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={tipo === c.id}
            onClick={() => setParams({ tipo: c.id === "todas" ? null : c.id })}
            className="flex items-baseline gap-2 rounded-sm border bg-card px-3 py-1.5 text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
          >
            {c.rotulo}
            <b className="font-mono text-base font-medium tabular-nums">{contagem[c.id as keyof typeof contagem]}</b>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={projetoId || TODOS} onValueChange={(v) => setParams({ projeto: !v || v === TODOS ? null : v })}>
          <SelectTrigger className="h-9 w-[16rem] max-w-full" aria-label="Filtrar por projeto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os projetos</SelectItem>
            {projetos.map(([id, nome]) => (
              <SelectItem key={id} value={id}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParams({ q: e.target.value.trim() || null }, { replace: true });
          }}
          placeholder="Buscar documento"
          aria-label="Buscar documento"
          className="h-9 w-56 max-w-full"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={mostrarDispensadas} onCheckedChange={(v) => setParams({ dispensadas: v ? "1" : null })} />
          Mostrar dispensadas
        </label>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title={todas.length === 0 ? "Nenhuma pendência" : "Nada neste filtro"}
          description={todas.length === 0 ? "Tudo em dia com o ciclo dos documentos." : "Mude o tipo, o projeto ou a busca."}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={idsSelecionaveis.length > 0 && selecao.estadoDaPagina(idsSelecionaveis) === "todos"}
                    onCheckedChange={() => selecao.alternarPagina(idsSelecionaveis)}
                    disabled={idsSelecionaveis.length === 0}
                    aria-label="Marcar todas as pendências abertas desta lista"
                  />
                </TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="hidden md:table-cell">Rev.</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden lg:table-cell">Projeto</TableHead>
                <TableHead className="hidden sm:table-cell">Detalhe</TableHead>
                <TableHead className="w-8 px-1 text-right" aria-label="Ações" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l) => (
                <LinhaPendencia
                  key={l.id}
                  l={l}
                  marcada={selecao.marcado(l.id)}
                  guiaAberto={guias.has(l.id)}
                  onAlternarMarca={() => selecao.alternar(l.id)}
                  onAlternarGuia={() => alternarGuia(l.id)}
                  onAbrirMenu={() => selecionavel(l) && selecao.aoAbrirMenu(l.id)}
                  onSelect={(item) => aoSelecionar(l, item)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BarraSelecao
        total={selecao.total}
        itens={itensDaSelecaoDePendencias()}
        onSelect={() => setDispensando(selecao.lista)}
        onLimpar={selecao.limpar}
        substantivo={["pendência", "pendências"]}
        genero="f"
        progresso={lote.progresso}
        pendente={lote.pendente}
      />
      {lote.portal}

      {dispensando && (
        <MotivoDialog
          titulo={dispensando.length > 1 ? `Dispensar ${dispensando.length} pendências` : "Dispensar pendência"}
          descricao={
            "A pendência volta a aparecer se algo mudar nela (outro arquivo na lixeira, mudança de estado). " +
            (dispensando.length > 1 ? "O mesmo motivo vale para todas as selecionadas." : "Dá para desfazer depois.")
          }
          rotuloConfirmar="Dispensar"
          onOpenChange={(aberto) => !aberto && setDispensando(null)}
          onConfirmar={async (motivo) => {
            await lote.executar({
              ids: dispensando,
              acao: (id) => {
                const l = porId.get(id)!;
                return dispensarPendencia({ alvoId: l.alvoId, tipo: l.tipo as TipoPendencia, chave: l.chave, motivo });
              },
              substantivo: ["pendência", "pendências"],
              verbo: ["dispensada", "dispensadas"],
              rotulo: (id) => porId.get(id)?.documentoNome ?? id,
              aoConcluir: () => selecao.limpar(),
            });
            return { ok: true };
          }}
        />
      )}
    </div>
  );
}

/** Componente de topo (não definido dentro do pai): senão remonta a cada render e fecha o menu aberto. */
function LinhaPendencia({
  l,
  marcada,
  guiaAberto,
  onAlternarMarca,
  onAlternarGuia,
  onAbrirMenu,
  onSelect,
}: {
  l: PendenciaDoCiclo;
  marcada: boolean;
  guiaAberto: boolean;
  onAlternarMarca: () => void;
  onAlternarGuia: () => void;
  onAbrirMenu: () => void;
  onSelect: (item: AcaoItemAcao) => void;
}) {
  const itens = itensDePendenciaCiclo({ tipo: l.tipo, dispensada: l.dispensa !== null, ...hrefsDe(l) });
  const guia = guiaDaPendencia({ tipo: l.tipo, estado: l.estado });
  return (
    <>
      <LinhaComMenu
        itens={itens}
        onSelect={onSelect}
        aoAbrir={(aberto) => aberto && onAbrirMenu()}
        render={<TableRow data-state={marcada ? "selected" : undefined} className="data-[popup-open]:bg-muted/50" />}
      >
        <TableCell className="align-top">
          {selecionavel(l) && <Checkbox checked={marcada} onCheckedChange={onAlternarMarca} aria-label={`Marcar ${l.documentoNome}`} />}
        </TableCell>
        <TableCell className={`min-w-0 align-top ${l.dispensa ? "opacity-70" : ""}`}>
          <p className="break-words font-medium">{l.documentoNome}</p>
          <p className="text-xs text-muted-foreground lg:hidden">{l.projetoNome}</p>
          <div className="mt-1 sm:hidden">
            <p className="text-sm">{l.detalhe}</p>
            {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
          </div>
          <button type="button" onClick={onAlternarGuia} aria-expanded={guiaAberto} className="mt-1 text-xs text-primary underline">
            {guiaAberto ? "Ocultar" : "O que fazer"}
          </button>
        </TableCell>
        <TableCell className="hidden align-top font-mono text-xs md:table-cell">{l.revisao ?? "—"}</TableCell>
        <TableCell className="align-top">
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge tone={TOM[l.tipo]}>{ROTULO_PENDENCIA[l.tipo]}</StatusBadge>
            {l.dispensa && <StatusBadge tone="neutral">Dispensada</StatusBadge>}
          </div>
        </TableCell>
        <TableCell className="hidden align-top text-muted-foreground lg:table-cell">
          {l.projetoCodigo} · {l.projetoNome}
        </TableCell>
        <TableCell className={`hidden min-w-0 align-top sm:table-cell ${l.dispensa ? "opacity-70" : ""}`}>
          <p className="text-sm">{l.detalhe}</p>
          {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
          {l.dispensa && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dispensada por {l.dispensa.por} em {formatarDataHora(new Date(l.dispensa.em))}: “{l.dispensa.motivo}”
            </p>
          )}
        </TableCell>
        <TableCell className="px-1 text-right align-top">
          <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={`Ações de ${l.documentoNome}`} />
        </TableCell>
      </LinhaComMenu>
      {guiaAberto && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que fazer</p>
            <p className="mt-1 text-sm">{guia.resumo}</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
              {guia.passos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
```

Observações ao implementar: (a) no celular a dispensa não cabe na coluna "Detalhe" (oculta abaixo de `sm`) — o motivo da dispensada aparece no bloco "O que fazer" só se você acrescentar `{l.dispensa && <p>…</p>}` ali; faça isso se a verificação em 390 px mostrar que o motivo some; (b) `Select`/`Checkbox`/`Input` seguem o padrão de `clientes-view.tsx` — se a assinatura de algum diferir (base-ui), copie de lá.

- [ ] **Step 5: Lint, tipos e testes**

Run: `npx eslint "src/components/arquivos/pendencias-view.tsx" "src/app/(dashboard)/arquivos/pendencias" src/lib/nav-config.ts`
Expected: sem avisos (rode **sem** `--quiet`).
Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`
Expected: sem erros.
Run: `npx vitest run`
Expected: PASS (inclui os testes-guarda: `contextmenu` à mão, `Promise.all` em transação, `"use server"` só com funções).

- [ ] **Step 6: Verificar em tela (você mesmo, não o dono)**

1. Subir o dev server **desta pasta**: `npm run dev -- -p 3001` (se já houver um nesta porta, pode reiniciá-lo; nunca mexa no da porta 3000). Nunca rode `next build` enquanto ele estiver ativo.
2. Entrar com o admin de teste do banco deste worktree (`claude.admin@dev.senahub` / `ClaudeDev@2026`).
3. Gerar dados no banco de dev: rode o smoke da Task 10 com `--manter` **ou** crie à mão (projeto → documento → revisão arquivada → enviar um arquivo → mover para a lixeira) e uma revisão em análise com `estadoEm` de 10 dias atrás (`UPDATE documento_revisao SET "estadoEm" = now() - interval '10 days'`).
4. Conferir em `/arquivos/pendencias`: cabeçalho como primeiro elemento; chips e contagens; filtro por projeto e busca (URL muda); "O que fazer" abre/fecha; menu `⋯` e botão direito mostram os mesmos itens; "Dispensar…" pede o motivo (curto → erro); dispensar some a linha, "Mostrar dispensadas" a traz de volta esmaecida com o motivo; "Desfazer dispensa" a reabre; marcar 2+ linhas mostra a barra "N pendências selecionadas" e dispensa em lote; a linha corrigida tem "Dispensar…" desabilitado com "Já foi revogada automaticamente."; "Abrir documento" e "Abrir lixeira do projeto" levam ao lugar certo (a lixeira abre na área Lixeira).
5. Medir: a 390×844, `document.documentElement.scrollWidth === 390`; a 1366×768 com o menu lateral **aberto**, o cabeçalho não sobrepõe a barra do topo; tema claro e escuro.
6. Perfil sem o par: entrar com um usuário que **não** tem `notificacoes:gestao` (ex.: um do `ensaio:eap`, senha `Demo@2026`, perfil de projetista) → abrir a URL cai em `/sem-permissao`, e o item não aparece no menu.
7. Salvar prints em `prints-auditoria/2026-10-15_pendencias-documentais/` (pasta ignorada pelo git) com um `LEIAME.md` dizendo o que cada print mostra.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/arquivos/pendencias/page.tsx" "src/app/(dashboard)/arquivos/pendencias/loading.tsx" src/components/arquivos/pendencias-view.tsx src/lib/nav-config.ts src/lib/nav-config.test.ts
git commit -m "feat(arquivos): tela de pendências documentais para administradores

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 9: Aviso diário vira resumo, e o job encerra dispensas obsoletas

**Files:**
- Modify: `src/modules/uploads/ciclo/integridade-service.ts`

**Interfaces:**
- Consumes: `pendenciasAbertasDoCiclo` (Task 4), `dispensasObsoletas`, `resumoDoAviso` (Task 1), `encerrarDispensasObsoletasNoBanco` (Task 4).
- Produces: `ResultadoIntegridade = { violacoes: number; corrigidas: number; relatadas: number; encerradas: number }` — `relatadas` passa a contar só as pendências **abertas** (sem as dispensadas).

O resumo já tem teste puro (Task 1, `resumoDoAviso`); a ordem "encerrar obsoletas → depois avisar" e o efeito no banco são cobertos pelo smoke (Task 10).

- [ ] **Step 1: Reescrever `verificarIntegridadeCiclo`**

Substituir o conteúdo de `src/modules/uploads/ciclo/integridade-service.ts` por:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { MOTIVO_CORRECAO_INTEGRIDADE } from "./integridade";
import { dispensasObsoletas, resumoDoAviso } from "./pendencias";
import { encerrarDispensasObsoletasNoBanco } from "./pendencias-service";
import { carregarRevisao, removerControleNoTx } from "./service";
import { pendenciasAbertasDoCiclo } from "./varredura";

export type ResultadoIntegridade = { violacoes: number; corrigidas: number; relatadas: number; encerradas: number };

/**
 * A7 — varredura diária (pg-boss). Corrige a violação de I5 pelo serviço do ciclo (com o evento
 * "Correção automática de integridade"), encerra as dispensas que já não casam com nenhuma pendência
 * (para uma ocorrência nova não herdar a dispensa velha) e avisa os administradores com um RESUMO das
 * pendências ABERTAS, com link para /arquivos/pendencias. As dispensadas não entram no aviso.
 */
export async function verificarIntegridadeCiclo(agora: Date = new Date()): Promise<ResultadoIntegridade> {
  const { violacoes, dispensas, abertas } = await pendenciasAbertasDoCiclo(prisma, agora);

  let corrigidas = 0;
  for (const v of violacoes) {
    if (v.tipo !== "controle_fora_de_publicada") continue;
    try {
      await prisma.$transaction(async (tx) => {
        const r = await carregarRevisao(tx, v.revisaoId);
        const c = r.controles.find((x) => x.id === v.controleId);
        if (!c) return; // alguém já resolveu entre a leitura e agora
        await removerControleNoTx(tx, r, c, { quem: null, motivo: MOTIVO_CORRECAO_INTEGRIDADE });
        corrigidas++;
      });
    } catch (err) {
      console.error(`[ciclo-integridade] não corrigiu ${v.controleId}:`, err);
    }
  }

  const encerradas = await encerrarDispensasObsoletasNoBanco(dispensasObsoletas(violacoes, dispensas).map((d) => d.id));

  const corpo = resumoDoAviso({ abertas, corrigidas });
  if (corpo) {
    const admins = await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } });
    await notificarMuitos(
      admins.map((a) => a.id),
      { titulo: "Ciclo dos documentos: verificação diária", corpo, href: "/arquivos/pendencias" },
      { categoria: "ciclo_documental" },
    );
  }
  return { violacoes: violacoes.length, corrigidas, relatadas: abertas.length, encerradas };
}
```

- [ ] **Step 2: Ajustar o log do job**

Em `src/lib/jobs.ts` (handler `ciclo-documental-integridade`, ~linha 456-460) deixar:

```ts
        const r = await verificarIntegridadeCiclo();
        if (r.corrigidas + r.relatadas + r.encerradas > 0) {
          console.log(`[ciclo-documental] ${r.violacoes} violação(ões): ${r.corrigidas} corrigida(s), ${r.relatadas} aberta(s), ${r.encerradas} dispensa(s) encerrada(s).`);
        }
```
(mantenha o `return`/fechamento original do handler; só o corpo do `if` e a condição mudam).

- [ ] **Step 3: Checar tipos, lint, testes**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit && npx eslint src/modules/uploads/ciclo src/lib/jobs.ts && npx vitest run src/modules/uploads`
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add src/modules/uploads/ciclo/integridade-service.ts src/lib/jobs.ts
git commit -m "feat(ciclo): aviso diário vira resumo das pendências abertas e encerra dispensas obsoletas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 10: Smoke, documentação e auditoria final

**Files:**
- Create: `scripts/smoke-pendencias-ciclo.ts`
- Modify: `package.json` (script `smoke:pendencias-ciclo`, depois de `smoke:ciclo-documental`)
- Modify: `CLAUDE.md` (lista de comandos + parágrafo no bloco "Document lifecycle")
- Modify: `docs/manual/novidades.md`
- Modify: `docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md` (§5 e §9: dispensa obsoleta é encerrada pelo job)

**Interfaces:**
- Consumes: tudo das Tasks 1–9.
- Produces: `npm run smoke:pendencias-ciclo`.

- [ ] **Step 1: Escrever o smoke**

Criar `scripts/smoke-pendencias-ciclo.ts`:

```ts
/**
 * Smoke das pendências documentais contra o banco de dev — o I/O que o vitest não cobre: assinatura lida do
 * banco, dispensa com evento, índice parcial (uma ativa), corrida de dois cliques, dispensa velha que não
 * pode valer para ocorrência nova, e o job só avisando o que está aberto.
 *
 *   npm run smoke:pendencias-ciclo
 *
 * Cria um cliente/projeto descartáveis (tag SMKPEND_*) e apaga tudo no fim. As duas publicadas (I4) não
 * entram aqui: o índice do banco as impede — a regra é coberta pelos testes puros.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { dispensasObsoletas, MOTIVO_JA_DISPENSADA, MOTIVO_JA_RESOLVIDA, MOTIVO_DISPENSA_ENCERRADA } from "../src/modules/uploads/ciclo/pendencias";
import { desfazerDispensaNoBanco, dispensarNoBanco, encerrarDispensasObsoletasNoBanco } from "../src/modules/uploads/ciclo/pendencias-service";
import { pendenciasAbertasDoCiclo } from "../src/modules/uploads/ciclo/varredura";
import { pendenciasDoCiclo } from "../src/modules/uploads/ciclo/pendencias-queries";
import { verificarIntegridadeCiclo } from "../src/modules/uploads/ciclo/integridade-service";

async function main() {
  const tag = `SMKPEND_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const recusa = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id,
        disciplinas: { create: [{ disciplinaTextoLegado: "Estrutural", ordem: 0 }] },
      },
      include: { disciplinas: true },
    });
  });
  const disciplinaId = projeto.disciplinas[0].id;
  const escopo = { documento: { disciplina: { projetoId: projeto.id } } };
  const revisaoIds: string[] = [];

  let n = 0;
  async function documentoComRevisao(nome: string, estado: "arquivado" | "compartilhado", estadoEm: Date) {
    const documento = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}`, nomeArquivo: `${tag}-${nome}.pdf` },
    });
    const revisao = await prisma.documentoRevisao.create({ data: { documentoId: documento.id, numero: 1, createdById: usuario!.id, estado, estadoEm } });
    revisaoIds.push(revisao.id);
    return { documento, revisao };
  }
  async function arquivo(documentoId: string, revisaoId: string, excluido: boolean) {
    return prisma.upload.create({
      data: {
        disciplinaId, documentoId, revisaoId, pacote: "A", versao: ++n, nomeArquivo: `${tag}-doc-${n}.pdf`,
        caminho: `smoke/${tag}-${n}.pdf`, tamanho: 10, hashSha256: `${n}`.padStart(64, "0"), validado: true, autorId: usuario!.id,
        ...(excluido ? { excluidoEm: new Date(), excluidoPorId: usuario!.id } : {}),
      },
    });
  }
  const dispensasDe = (alvoId: string) => prisma.dispensaPendenciaCiclo.findMany({ where: { alvoId }, orderBy: { criadaEm: "asc" } });
  const abertasAgora = async () => (await pendenciasAbertasDoCiclo(prisma, new Date(), escopo)).abertas;
  const dispensadasAgora = async () => (await pendenciasAbertasDoCiclo(prisma, new Date(), escopo)).dispensadas;
  const ativaDe = (id: string, tipo: string) => prisma.dispensaPendenciaCiclo.count({ where: { alvoId: id, tipo, desfeitaEm: null } });

  try {
    const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const a = await documentoComRevisao("lixeira", "arquivado", new Date());
    await arquivo(a.documento.id, a.revisao.id, true);
    const b = await documentoComRevisao("parada", "compartilhado", dezDiasAtras);

    // ── a varredura vê as duas ──
    const ab0 = await abertasAgora();
    const lix = ab0.find((i) => i.violacao.tipo === "publicada_com_lixeira" && i.alvoId === a.revisao.id);
    const par = ab0.find((i) => i.violacao.tipo === "analise_parada" && i.alvoId === b.revisao.id);
    check("varredura: arquivada com arquivo na lixeira aparece (assinatura lix:1:arquivado)", lix?.chave === "lix:1:arquivado");
    check("varredura: revisão parada em análise há 10 dias aparece", par !== undefined);

    // ── dispensar ──
    await dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: lix!.chave, motivo: "Limpeza do smoke", userId: usuario.id });
    check("dispensar: sai das abertas e entra nas dispensadas com o motivo", (await abertasAgora()).every((i) => i.alvoId !== a.revisao.id) && (await dispensadasAgora()).some((i) => i.alvoId === a.revisao.id && i.dispensa?.motivo === "Limpeza do smoke"));
    check(
      "dispensar: gravou evento no histórico do documento, com a revisão",
      (await prisma.documentoEvento.count({ where: { documentoId: a.documento.id, revisaoId: a.revisao.id, tipo: "pendencia_dispensada" } })) === 1,
    );
    check("dispensar de novo a mesma assinatura é recusado com a frase certa", (await recusa(() => dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: lix!.chave, motivo: "Limpeza do smoke", userId: usuario.id }))) === MOTIVO_JA_DISPENSADA);
    check("assinatura que não é a de agora é recusada (tela velha)", (await recusa(() => dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: "lix:9:arquivado", motivo: "Limpeza do smoke", userId: usuario.id }))) === MOTIVO_JA_RESOLVIDA);

    // ── estado mudou: reaparece; dispensa velha NÃO vale para a ocorrência nova ──
    const up2 = await arquivo(a.documento.id, a.revisao.id, true);
    const reapareceu = (await abertasAgora()).find((i) => i.alvoId === a.revisao.id);
    check("estado mudou (2 arquivos na lixeira): a pendência reaparece como aberta", reapareceu?.chave === "lix:2:arquivado");
    const { violacoes, dispensas } = await pendenciasAbertasDoCiclo(prisma, new Date(), escopo);
    // `dispensas` traz TODAS as ativas do banco (o `escopo` só estreita as violações): filtra para as deste
    // smoke, senão o encerramento abaixo fecharia dispensas reais de outros projetos do banco de dev.
    const obsoletas = dispensasObsoletas(violacoes, dispensas).filter((d) => revisaoIds.includes(d.alvoId));
    check("a dispensa velha é apontada como obsoleta", obsoletas.length === 1 && obsoletas[0].alvoId === a.revisao.id);
    check("o job encerra a obsoleta pelo sistema (desfeitaPorId nulo)", (await encerrarDispensasObsoletasNoBanco(obsoletas.map((d) => d.id))) === 1 && (await dispensasDe(a.revisao.id))[0].desfeitaPorId === null);
    await prisma.upload.update({ where: { id: up2.id }, data: { excluidoEm: null, excluidoPorId: null } });
    const volta = (await abertasAgora()).find((i) => i.alvoId === a.revisao.id);
    check("voltou a 1 arquivo: a assinatura é a de antes, e a dispensa velha NÃO a esconde", volta?.chave === "lix:1:arquivado");

    // ── dispensar de novo, desfazer ──
    await dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: volta!.chave, motivo: "Segunda dispensa", userId: usuario.id });
    check("uma dispensa ativa por alvo+tipo", (await ativaDe(a.revisao.id, "publicada_com_lixeira")) === 1);
    await desfazerDispensaNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", userId: usuario.id });
    check("desfazer: a pendência volta e o evento foi gravado", (await abertasAgora()).some((i) => i.alvoId === a.revisao.id) && (await prisma.documentoEvento.count({ where: { revisaoId: a.revisao.id, tipo: "pendencia_dispensa_desfeita" } })) === 1);
    check("desfazer de novo é recusado", (await recusa(() => desfazerDispensaNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", userId: usuario.id }))) === MOTIVO_DISPENSA_ENCERRADA);

    // ── corrida: dois cliques na mesma pendência ──
    const chavePar = par!.chave;
    const r = await Promise.allSettled([
      dispensarNoBanco({ alvoId: b.revisao.id, tipo: "analise_parada", chave: chavePar, motivo: "Espera combinada", userId: usuario.id }),
      dispensarNoBanco({ alvoId: b.revisao.id, tipo: "analise_parada", chave: chavePar, motivo: "Espera combinada", userId: usuario.id }),
    ]);
    const passou = r.filter((x) => x.status === "fulfilled").length;
    const recusadas = r.filter((x) => x.status === "rejected" && (x.reason as Error).message === MOTIVO_JA_DISPENSADA).length;
    check("corrida: uma dispensa passa e a outra recebe a frase de 'já dispensada'", passou === 1 && recusadas === 1 && (await ativaDe(b.revisao.id, "analise_parada")) === 1);

    // ── a pendência deixa de existir (revisão voltou à análise agora): dispensar com a tela velha é recusado ──
    await prisma.documentoRevisao.update({ where: { id: b.revisao.id }, data: { estadoEm: new Date() } });
    check("a pendência sumiu (análise recente): dispensar com a assinatura velha é recusado", (await recusa(() => dispensarNoBanco({ alvoId: b.revisao.id, tipo: "analise_parada", chave: chavePar, motivo: "Tela velha aqui", userId: usuario.id }))) === MOTIVO_JA_RESOLVIDA);

    // ── a tela e o job leem a mesma coisa ──
    const tela = await pendenciasDoCiclo();
    check("a leitura da tela traz a lixeira aberta deste projeto, com nome do projeto e documento", tela.abertas.some((x) => x.alvoId === a.revisao.id && x.projetoNome === `${tag}_proj` && x.documentoNome === `${tag}-lixeira.pdf`));
    const job = await verificarIntegridadeCiclo();
    check("o job roda inteiro e devolve contagens", typeof job.relatadas === "number" && typeof job.encerradas === "number");

    // ── o que sobrou do aviso: abertas e dispensadas se separam ──
    await dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: "lix:1:arquivado", motivo: "Dispensada para o aviso", userId: usuario.id });
    const final = await pendenciasAbertasDoCiclo(prisma, new Date(), escopo);
    check("a dispensada não entra nas abertas (que é o que o aviso lista)", final.abertas.every((i) => i.alvoId !== a.revisao.id) && final.dispensadas.some((i) => i.alvoId === a.revisao.id));
  } finally {
    await prisma.dispensaPendenciaCiclo.deleteMany({ where: { alvoId: { in: revisaoIds } } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(ok ? "\nSmoke das pendências documentais: tudo certo." : "\nSmoke das pendências documentais: HOUVE FALHA.");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

Se o `documentoDisciplina.create` reclamar de campo obrigatório (`tipoId`), copie a criação do tipo (`prancha_catalogo` com `exigeDwg: false`) de `scripts/smoke-ciclo-documental.ts:73-75` e passe `tipoId`.

- [ ] **Step 2: Script no `package.json`**

Depois da linha `"smoke:ciclo-documental": ...`:

```json
    "smoke:pendencias-ciclo": "tsx --tsconfig tsconfig.server.json scripts/smoke-pendencias-ciclo.ts",
```

- [ ] **Step 3: Rodar o smoke**

Run: `npm run smoke:pendencias-ciclo`
Expected: todas as linhas `[OK]` e `Smoke das pendências documentais: tudo certo.` Se alguma der `[FALHA]`, corrija o código da Task 4/9 (não o smoke), a menos que o erro seja de dado de teste (campo obrigatório).
Run também: `npm run smoke:ciclo-documental`
Expected: continua tudo certo (a refatoração do `integridade-service` não pode ter quebrado o A7).

- [ ] **Step 4: Atualizar o spec (dispensa obsoleta)**

Em `docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md`:
- no fim do §5 acrescentar: `Dispensa ativa que não casa com nenhuma violação atual (a pendência sumiu ou a assinatura mudou) é **encerrada pelo job diário** (`desfeitaPorId` nulo = sistema). Sem isso, uma ocorrência nova com a mesma assinatura de antes (1 arquivo na lixeira → 2 → volta a 1) herdaria a dispensa velha calada. Função pura `dispensasObsoletas`.`
- no §9 acrescentar: `O job também encerra as dispensas obsoletas antes de avisar.`

- [ ] **Step 5: CLAUDE.md**

1. Na lista de comandos, depois da linha de `smoke:ciclo-documental`:

```
npm run smoke:pendencias-ciclo     # pendências documentais: assinatura lida do banco, dispensa com evento, uma ativa por alvo, corrida de dois cliques, dispensa velha que não vale para ocorrência nova, job só avisa o aberto
```

2. No fim do parágrafo "**Document lifecycle (ISO 19650)**" acrescentar um parágrafo novo logo abaixo dele:

```
**Pendências documentais** (`modules/uploads/ciclo/pendencias*.ts` + `varredura.ts`, tela `/arquivos/pendencias`, spec
`docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md`): job e tela leem a MESMA varredura (`violacoesDoCiclo`);
a tela calcula ao vivo, sem gravar. Cada violação dispensável (lixeira I6, análise parada, duas publicadas — o I5 é corrigido
sozinho e só aparece como histórico) tem ALVO (revisão; documento nas duas publicadas) e ASSINATURA do estado
(`assinaturaDaViolacao`). `DispensaPendenciaCiclo` guarda a assinatura do momento: mudou o estado, a pendência reaparece, e o
job encerra a dispensa que já não casa (`dispensasObsoletas`), senão uma ocorrência nova com a mesma assinatura herdaria a velha.
Uma dispensa ATIVA por alvo+tipo (índice parcial — dois cliques simultâneos terminam em P2002 → "já está dispensada"). Escrita
só em `pendencias-service.ts` (revalida a assinatura dentro da transação, grava `DocumentoEvento` `pendencia_dispensada` /
`pendencia_dispensa_desfeita`); `ciclo/service.ts` não é tocado. Gate da tela e das ações: `notificacoes:gestao`, o mesmo da
audiência do aviso (sem permissão nova). O aviso das 06:20 virou resumo das pendências ABERTAS com link para a tela.
```

- [ ] **Step 6: Manual (linguagem do dia a dia)**

Em `docs/manual/novidades.md`, antes do título `## Compatibilização: realinhar, conflitos e filtros (outubro/2026)`, inserir:

```markdown
## Pendências documentais (outubro/2026)

- **Tela nova para administradores: Arquivos › Pendências.** Mostra, em uma lista só, tudo o que o aviso diário
  das 06:20 ("Ciclo dos documentos: verificação diária") apontava em texto cortado: arquivo de revisão publicada
  ou arquivada que está na lixeira, revisão parada em análise além do prazo e documento com duas revisões
  publicadas. As liberações indevidas que o sistema revogou sozinho aparecem no chip "Corrigidas automaticamente".
- **Cada linha explica o que fazer.** O botão "O que fazer" diz, para aquela situação, se vale restaurar o arquivo,
  publicar nova revisão, cobrar a análise ou só dispensar.
- **Dispensar com motivo.** Se foi proposital (por exemplo, limpeza de arquivos antigos), dispense a pendência, uma
  a uma ou várias de uma vez. Ela some do aviso e fica em "Mostrar dispensadas", com quem dispensou e por quê, e dá
  para desfazer. Se algo mudar naquela pendência (outro arquivo vai para a lixeira, a revisão volta para a análise),
  ela reaparece sozinha.
- **O aviso diário ficou um resumo.** Ele conta as pendências abertas por tipo e leva direto para a tela.
```

- [ ] **Step 7: Auditoria final (obrigatória)**

Ler `docs/PROTOCOLO_AUDITORIA_FINAL.md` **de novo** e rodar o nível pelo risco real (aqui: **nível 2–3** — tabela nova, ação de escrita, evento no histórico, tela). Mínimo:

1. `npm run lint` (sem `--quiet`), `npm test`, `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`.
2. Parar o dev server desta pasta e rodar `npm run build` (nunca com `next dev` ativo no mesmo `.next`).
3. `npm run smoke:pendencias-ciclo` e `npm run smoke:ciclo-documental`.
4. Subagentes revisores do protocolo (seção 13), em paralelo, sobre `git diff <commit antes da Task 1>..HEAD`: `action-guardian` (ações), `prisma-migration-reviewer` (migration), `design-system-guardian` + `ui-state-linter` + `a11y-auditor` (tela), `realtime-jobs-auditor` (job). Corrigir o que estiver no escopo.
5. Prints e `LEIAME.md` já feitos na Task 8, Step 6 — conferir que cobrem o estado final.
6. Relatório final **em pt-BR** no formato do protocolo, dizendo o que foi rodado e o que **não** foi (por exemplo: "não testado no `dev:server`/job real do pg-boss; testado chamando `verificarIntegridadeCiclo` direto").

- [ ] **Step 8: Commit**

```bash
git add scripts/smoke-pendencias-ciclo.ts package.json CLAUDE.md docs/manual/novidades.md docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md
git commit -m "test(ciclo): smoke das pendências documentais; docs e manual

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

## Deploy (para o dono, depois)

Só `npx prisma migrate deploy` no servidor. Sem script de dados, sem `db:seed`, sem permissão nova. As dispensas começam vazias: as 71 do aviso de 2026-10-15 aparecem como abertas até alguém dispensar.

## Self-Review (feita ao escrever)

- **Cobertura do spec:** §1–3 decisões → Tasks 5/7/8; §4 dados → Task 2; §5 assinatura → Task 1 (+ obsoleta, Review Focus 1); §6 leitura → Tasks 4/6; §7 escrita → Tasks 4/5; §8 tela → Tasks 7/8; §9 job → Task 9; §10 testes → Tasks 1,3,5,7 (puros) e 10 (smoke); §11–12 ordem/deploy → ordem das tasks e bloco "Deploy". Item "Corrigidas automaticamente" (§6) → Task 6.
- **Placeholders:** nenhum "TBD"/"similar a"; os pontos que dependem do banco real (campo obrigatório `tipoId` no smoke, assinatura de `Select`/`Checkbox`) têm instrução explícita do que fazer.
- **Consistência de tipos:** `ItemPendencia`, `DispensaAtiva`, `TipoPendencia`, `PendenciaDoCiclo` e os ids de ação (`dispensar`, `desfazer-dispensa`, `abrir-documento`, `abrir-lixeira`) são os mesmos em todas as tasks; `ResultadoIntegridade` muda de `verificadas` para `violacoes` nas Tasks 4 e 9, com o ajuste de `jobs.ts` nas duas.
- **Desvio do spec:** o spec dizia que o aviso "continua diário enquanto houver pendência aberta"; mantido. Acrescentado: encerramento de dispensas obsoletas pelo job (atualizado no spec, Task 10 Step 4).
