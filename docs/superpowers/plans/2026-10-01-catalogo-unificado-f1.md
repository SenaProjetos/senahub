# Catálogo de nomenclatura — Fase 1 (domínio + fim da armadilha do ESG) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Modelo:** **Opus** (spec §0, F1). Se o modelo ativo for outro: PARAR e esperar `/model`.

**Goal:** Tornar as linhas de sigla a única verdade do catálogo (sair/voltar não mexem nelas), criar as operações de sinônimo e de transferência de sigla, e dar à tela "Catálogo da vN" de hoje o mínimo para resolver o caso do ESG sem sair dela.

**Architecture:** Regra pura em `modules/projetos/nomenclatura/catalogo/versao.ts` (roda no navegador para a prévia e no servidor para gravar); `service.ts` grava a mesma regra no banco; a action recalcula o plano contra o banco e grava numa transação. A tela ganha três diálogos reutilizáveis (siglas da versão, adicionar com conflito, voltar com siglas) em `components/configuracoes/catalogo/`, que a Fase 2 reaproveita na tela unificada.

**Tech Stack:** Next.js 15 (Server Actions via `defineAction`), React 19, Prisma 7, Zod 4, Vitest (env node), shadcn sobre base-ui.

**Spec:** [docs/superpowers/specs/2026-09-30-catalogo-nomenclatura-unificado.md](../specs/2026-09-30-catalogo-nomenclatura-unificado.md) — esta é a **F1** (§7). Mockup aprovado: artifact `2YtpNHYrCbRPNLDJ8mQRMR` (diálogos "Conflito com sinônimo", "Conflito com sigla oficial", "Siglas nesta versão", "Voltar para a versão").

**Fora desta fase (plano próprio depois que a F1 entrar):** tela unificada com lentes e lista suspensa de versões (F2/F3), ações de cadastro sem versão e "pasta dos arquivos" editável com `uso = 0` (F2), retirada das telas antigas (F4), verificação final (F5).

## Global Constraints

- Código e identificadores seguem o arquivo vizinho (domínio em português); **todo texto de tela em pt-BR**; commits Conventional em pt-BR, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Toda mutação passa por `defineAction` (`lib/with-action.ts`); erro de negócio = `throw new ActionError("frase segura para o usuário")`.
- Arquivo `"use server"` só exporta funções async (memória: export não-função quebra em runtime).
- **Sem `Promise.all` com o cliente de transação** (`lib/promise-all-em-transacao.test.ts`): dentro de `$transaction`, um `await` por vez.
- `versao.ts` continua **puro e client-safe** (sem Prisma, sem `server-only`, sem Next).
- Siglas: 2 a 6 letras ou números, normalizadas por `normalizarSigla` (`catalogo/planilha.ts`: sem acento, maiúscula).
- shadcn sobre **base-ui**: `render={<Comp />}`, nunca `asChild`; `Checkbox.onCheckedChange` recebe `boolean | …` — use `!!v`.
- Não sobrescrever o tamanho de toque de `Input`/`Button` (`pointer-coarse:` já cuida).
- Stage arquivos específicos (nunca `git add -A`/`.`) e conferir com `git show --stat` depois de cada commit.
- Não rodar `next build` com `next dev` ativo na mesma pasta.

## Review Focus

1. **Tela velha:** outro admin muda o catálogo entre abrir o diálogo e salvar → o servidor recalcula e, se surgiu conflito, recusa com "recarregue e confirme a transferência" em vez de gravar por cima. Pinado em `resolverLeva` (Task 2).
2. **Item que sai e volta pelo formulário antigo** ("Até a v1" → salvar → "Sem fim" → salvar) → as siglas voltam exatamente como eram. Pinado em `decidirSiglasAoSalvar` (Task 4) e no smoke (Task 5).
3. **Voltar um item cuja sigla hoje é de outro** (card Acústica voltando com ACU, que virou sub de Arquitetura) → o diálogo mostra o conflito antes de salvar. Pinado em `planejarTransferencia` (Task 2).
4. **Trocar a oficial por um sinônimo do próprio item e rebaixar a antiga no mesmo salvar** → uma sigla oficial, sem linha duplicada nem encerrada duas vezes. Pinado em `opsDasSiglas` + `simular` (Task 2).
5. **Dado legado de produção** (linhas truncadas pelo espelho antigo junto com o item) → "Voltar" reabre as siglas escolhidas a partir da versão. Pinado em `simular` (Task 1) e no smoke (Task 5).

---

## Mapa de arquivos

| Arquivo | Papel | Tarefa |
|---|---|---|
| `src/modules/projetos/nomenclatura/catalogo/versao.ts` | Operações puras: sem espelho, `sinonimo-novo`, `entra.siglas`, transferência, helpers da tela | 1, 2 |
| `src/modules/projetos/nomenclatura/catalogo/versao.test.ts` | Testes das operações e da transferência | 1, 2 |
| `src/modules/projetos/nomenclatura/catalogo/faixa-efetiva.test.ts` (novo) | Guarda da §5.1: leitores recortam pela faixa efetiva | 3 |
| `src/modules/projetos/nomenclatura/catalogo/importacao.ts` | Ordem de gravação conhece `sinonimo-novo`; usa `linhaDoItem` | 1, 2 |
| `src/modules/uploads/nomenclatura/siglas-versao.ts` (+ `.test.ts`) | `decidirSiglasAoSalvar`: mudar só a validade mantém as linhas | 4 |
| `src/modules/projetos/nomenclatura/catalogo/service.ts` | Grava a mesma regra de `simular` | 5 |
| `src/modules/projetos/nomenclatura/catalogo/queries.ts` | `carregarCatalogoSnap(db)` aceita a transação | 5 |
| `scripts/smoke-catalogo-nomenclatura.ts` (novo) + `package.json` + `CLAUDE.md` | Smoke com transação desfeita | 5 |
| `src/modules/projetos/nomenclatura/catalogo/actions.ts` | `alterarCatalogoNaVersao` em lote + `transferir` | 6 |
| `src/components/configuracoes/catalogo/*.tsx` (novos) | Chips de sigla, aviso de conflito, 3 diálogos | 7 |
| `src/components/configuracoes/catalogo-versao-view.tsx` + `src/app/(dashboard)/configuracoes/nomenclatura/[numero]/page.tsx` | Tela de hoje usando os diálogos | 7 |
| `docs/manual/sistema/configuracoes.md`, `docs/manual/novidades.md`, `docs/manual/search-index.json` | Manual | 8 |

---

### Task 0: Área de trabalho e spec

A pasta `SENAHub-remake-vscode` está na branch `feat/planejador-financeiro` com trabalho **não commitado de outra sessão** (planejador financeiro). **Não troque de branch nessa pasta e não mexa nesses arquivos.**

- [ ] **Step 1: Criar a área isolada**

Use a skill `superpowers:using-git-worktrees` para criar a branch `feat/catalogo-unificado` a partir de `refs/heads/dev-vscode` num worktree próprio (ex.: `C:\SENA_ADM\SENAHUB\SENAHub-remake-catalogo`), com `node_modules` **real** (`npm ci`; nunca junction — memórias "worktree com junction"). Copie o `.env` da pasta `SENAHub-remake-vscode` (mesmo banco `senahub_remake_vscode`; esta fase **não tem migração**). Para olhar a tela no navegador, suba o dev desse worktree em outra porta (`npm run dev -- -p 3002`) com `APP_URL`/`BETTER_AUTH_URL` = `http://localhost:3002` e `AUTH_COOKIE_PREFIX=senahub-catalogo` no `.env` dele.

Confira a base:

```bash
git log --oneline -1 refs/heads/dev-vscode
git -C <worktree> status --short --branch
```
Expected: `## feat/catalogo-unificado`, árvore limpa.

- [ ] **Step 2: Levar o spec e este plano para a branch e commitar**

Copie `docs/superpowers/specs/2026-09-30-catalogo-nomenclatura-unificado.md` e `docs/superpowers/plans/2026-10-01-catalogo-unificado-f1.md` da pasta `SENAHub-remake-vscode` para os mesmos caminhos no worktree.

```bash
git add docs/superpowers/specs/2026-09-30-catalogo-nomenclatura-unificado.md docs/superpowers/plans/2026-10-01-catalogo-unificado-f1.md
git commit -m "docs(nomenclatura): spec e plano da F1 do catálogo numa tela só

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

Depois **apague as duas cópias não rastreadas** da pasta `SENAHub-remake-vscode` (senão, quando ela voltar para `dev-vscode` depois do merge, o git recusa: "untracked working tree files would be overwritten").

- [ ] **Step 3: Linha de base verde**

```bash
npx vitest run src/modules/projetos/nomenclatura src/modules/uploads/nomenclatura
```
Expected: PASS. Se algo já falhar antes de mexer, pare e conte ao dono.

---

### Task 1: Operações puras — sair/voltar sem espelho, sinônimo novo, promoção de sinônimo

**Files:**
- Modify: `src/modules/projetos/nomenclatura/catalogo/versao.ts` (tipos de operação ~190-206; `comFaixa`/`colunasDe` ~219-235; `simular` ~254-350; imports 15-23)
- Modify: `src/modules/projetos/nomenclatura/catalogo/importacao.ts:450-458` (ordem de gravação)
- Test: `src/modules/projetos/nomenclatura/catalogo/versao.test.ts`

**Interfaces:**
- Produces: `type SiglaVolta = { sigla: string; oficial: boolean }`; `OperacaoCatalogo` ganha `{ tipo: "sinonimo-novo"; alvo; sigla }` e `entra` ganha `siglas?: SiglaVolta[]`; `simular` com a regra nova (usada pela Task 2, 3, 5).

- [ ] **Step 1: Escrever os testes (falham)**

Em `versao.test.ts`, **substitua** o teste `"sai de item espelho: as siglas acompanham a faixa (lápis segue livre)"` por este, e acrescente os demais dentro do mesmo `describe("simular", …)`:

```ts
  it("sai muda só a faixa do item; as linhas de sigla ficam (a faixa efetiva recorta)", () => {
    const s = simular(catalogoDev(), 2, [{ id: "x", tipo: "sai", alvo: D("log") }]);
    const log = s.cards.find((c) => c.id === "log")!;
    expect(log.versaoAte).toBe(1);
    expect(log.siglas.every((l) => l.versaoAte === null)).toBe(true);
    expect(siglasDoItemNaVersao(s, D("log"), 2).oficial).toBeNull();
    expect(siglasDoItemNaVersao(s, D("log"), 1).oficial).toBe("LOG");
  });

  it("entra com siglas: só as escolhidas valem na versão", () => {
    const fora = simular(catalogoDev(), 2, [{ id: "x", tipo: "sai", alvo: D("hid") }]);
    const volta = simular(fora, 2, [
      { id: "y", tipo: "entra", alvo: D("hid"), siglas: [{ sigla: "HID", oficial: true }, { sigla: "HDR", oficial: false }] },
    ]);
    expect(siglasDoItemNaVersao(volta, D("hid"), 2)).toEqual({ oficial: "HID", sinonimos: ["HDR"] });
    expect(siglasDoItemNaVersao(volta, D("hid"), 1)).toEqual({ oficial: "HID", sinonimos: ["HDR", "ESG"] });
  });

  it("entra com siglas reabre linha que o espelho antigo truncou (dado legado)", () => {
    const snap = catalogoDev();
    const log = snap.cards.find((c) => c.id === "log")!;
    log.versaoAte = 1;
    log.siglas = log.siglas.map((l) => ({ ...l, versaoAte: 1 }));
    const volta = simular(snap, 2, [{ id: "y", tipo: "entra", alvo: D("log"), siglas: [{ sigla: "LOG", oficial: true }] }]);
    expect(siglasDoItemNaVersao(volta, D("log"), 2).oficial).toBe("LOG");
    expect(volta.cards.find((c) => c.id === "log")!.siglas.find((l) => l.id.startsWith("nova:y"))).toMatchObject({
      sigla: "LOG",
      oficial: true,
      versaoDesde: 2,
      versaoAte: null,
    });
  });

  it("sinonimo-novo vale a partir da versão; repetido não duplica", () => {
    const s = simular(catalogoDev(), 2, [
      { id: "a", tipo: "sinonimo-novo", alvo: D("ele"), sigla: "ELT" },
      { id: "b", tipo: "sinonimo-novo", alvo: D("ele"), sigla: "ELT" },
    ]);
    expect(siglasDoItemNaVersao(s, D("ele"), 2)).toEqual({ oficial: "ELE", sinonimos: ["ELT"] });
    expect(siglasDoItemNaVersao(s, D("ele"), 1).sinonimos).toEqual([]);
    expect(s.cards.find((c) => c.id === "ele")!.siglas.filter((l) => l.sigla === "ELT")).toHaveLength(1);
  });

  it("sigla-nova com um sinônimo do próprio item: promove (o sinônimo sai na versão)", () => {
    const s = simular(catalogoDev(), 2, [{ id: "a", tipo: "sigla-nova", alvo: D("hid"), sigla: "HDR" }]);
    expect(siglasDoItemNaVersao(s, D("hid"), 2)).toEqual({ oficial: "HDR", sinonimos: ["ESG"] });
    expect(siglasDoItemNaVersao(s, D("hid"), 1)).toEqual({ oficial: "HID", sinonimos: ["HDR", "ESG"] });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/projetos/nomenclatura/catalogo/versao.test.ts`
Expected: FAIL — `sai` ainda trunca as linhas; `sinonimo-novo` e `entra.siglas` não existem (erro de tipo no vitest não trava, mas as asserções falham).

- [ ] **Step 3: Implementar em `versao.ts`**

3a. Imports (linhas 15-23) — `siglasDasColunas` e `siglasSaoEspelho` deixam de ser usados:

```ts
import {
  intersecaoFaixas,
  siglasNaVersao,
  valeNaVersao,
  type FaixaVersao,
  type SiglaLinha,
} from "@/modules/uploads/nomenclatura/siglas-versao";
```

3b. Tipos de operação — substitua o bloco `export type OperacaoCatalogo = …` inteiro por:

```ts
/** Uma sigla que volta com o item ("Voltar para a vN"), com o papel que ela tinha. */
export type SiglaVolta = { sigla: string; oficial: boolean };

export type OperacaoCatalogo =
  | { tipo: "card-novo"; chave: string; nome: string; sigla: string | null; categoria: string | null }
  | { tipo: "sub-nova"; card: RefCard; nome: string; sigla: string | null }
  | { tipo: "item-novo"; categoria: "fase" | "tipo"; nome: string; sigla: string }
  /**
   * Sigla oficial nova a partir da versão; a oficial anterior deixa de valer nela — e um sinônimo do
   * próprio item com a mesma sigla também (foi promovido).
   */
  | { tipo: "sigla-nova"; alvo: AlvoCatalogo; sigla: string }
  /** Sinônimo novo a partir da versão: reconhecido no envio, nunca escrito no nome. */
  | { tipo: "sinonimo-novo"; alvo: AlvoCatalogo; sigla: string }
  /**
   * O item deixa de existir a partir da versão (criado nela mesma = excluído). As linhas de sigla NÃO
   * mudam (E3 da spec 2026-09-30): todo leitor recorta pela faixa efetiva (sigla ∩ item ∩ card).
   */
  | { tipo: "sai"; alvo: AlvoCatalogo }
  /**
   * O item volta a existir a partir da versão. Com `siglas`, elas passam a ser exatamente as que valem
   * nele na versão: as que já valem e não estão na lista são encerradas; as que faltam abrem a partir
   * da versão. Sem `siglas` (importação), as linhas não mudam.
   */
  | { tipo: "entra"; alvo: AlvoCatalogo; siglas?: SiglaVolta[] }
  /** Uma linha de sigla deixa de valer a partir da versão (a sigla passou para outro item). */
  | { tipo: "encerrar-sigla"; alvo: AlvoCatalogo; linhaId: string; sigla: string };
```

3c. Apague as funções `colunasDe` e `comFaixa` (com o comentário acima de `comFaixa`) e, no lugar delas, coloque:

```ts
/** Linhas do item depois de "Voltar" com as siglas escolhidas — a mesma regra que `service.ts` grava. */
function siglasAoVoltar(linhas: SiglaSnap[], escolhidas: readonly SiglaVolta[], versao: number, prefixoId: string): SiglaSnap[] {
  const querem = new Set(escolhidas.map((e) => e.sigla));
  let saida = linhas;
  for (const l of linhas) {
    if (valeNaVersao(l, versao) && !querem.has(l.sigla)) saida = encerrarLinhaNaVersao(saida, l.id, versao);
  }
  const valem = new Set(saida.filter((l) => valeNaVersao(l, versao)).map((l) => l.sigla));
  const novas = escolhidas
    .filter((e) => !valem.has(e.sigla))
    .map((e, i): SiglaSnap => ({ id: `${prefixoId}#${i}`, sigla: e.sigla, oficial: e.oficial, versaoDesde: versao, versaoAte: null }));
  return [...saida, ...novas];
}
```

3d. Em `simular`, substitua os `case` `"sigla-nova"`, `"sai"` e `"entra"` e acrescente `"sinonimo-novo"`:

```ts
      case "sigla-nova": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) => {
          let siglas = item.siglas;
          // A oficial de hoje sai; um sinônimo do próprio item com a mesma sigla também (foi promovido).
          for (const l of item.siglas.filter((l) => (l.oficial || l.sigla === op.sigla) && valeNaVersao(l, versao))) {
            siglas = encerrarLinhaNaVersao(siglas, l.id, versao);
          }
          return { ...item, siglas: [...siglas, linhaNova(op, op.sigla)] };
        });
        break;
      }
      case "sinonimo-novo": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) =>
          item.siglas.some((l) => l.sigla === op.sigla && valeNaVersao(l, versao))
            ? item
            : { ...item, siglas: [...item.siglas, { ...linhaNova(op, op.sigla), oficial: false }] },
        );
        break;
      }
      case "sai": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) =>
          item.versaoDesde >= versao ? null : { ...item, versaoAte: versao - 1 },
        );
        // Card criado na própria versão é excluído — e as subs dele vão junto (cascade no banco).
        if (op.alvo.tipo === "disciplina" && !cardDe(s, op.alvo.id)) {
          s = { ...s, subs: s.subs.filter((x) => x.cardId !== op.alvo.id) };
        }
        break;
      }
      case "entra": {
        s = trocarItem(s, op.alvo, (item: CardSnap | SubSnap | ItemListaSnap) => {
          const faixa: FaixaVersao = {
            versaoDesde: Math.min(item.versaoDesde, versao),
            versaoAte: item.versaoAte !== null && item.versaoAte < versao ? null : item.versaoAte,
          };
          const siglas = op.siglas ? siglasAoVoltar(item.siglas, op.siglas, versao, `nova:${op.id}`) : item.siglas;
          return { ...item, ...faixa, ativo: true, siglas };
        });
        break;
      }
```

Atualize o comentário de `simular` (acima da função): troque "(regravadas junto com a faixa do item: `nova:<id>#<n>`)" por "(as que voltam com o item: `nova:<id>#<n>`)".

3e. `importacao.ts`, no `ordem` de `operacoesEscolhidas`, acrescente a linha depois de `"sigla-nova": 4,`:

```ts
    "sinonimo-novo": 4,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/projetos/nomenclatura`
Expected: PASS. Se algum teste de `importacao.test.ts` afirmar linhas de sigla **truncadas** depois de um `sai`, a expectativa mudou de propósito (E3): troque-a por "linhas intactas + `versaoAte` do item = versão − 1" e anote no commit.

- [ ] **Step 5: Commit**

```bash
git add src/modules/projetos/nomenclatura/catalogo/versao.ts src/modules/projetos/nomenclatura/catalogo/versao.test.ts src/modules/projetos/nomenclatura/catalogo/importacao.ts
git commit -m "feat(nomenclatura): sair e voltar da versão não mexem nas siglas; sinônimo por versão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 2: Transferência de sigla e helpers da tela (puro)

**Files:**
- Modify: `src/modules/projetos/nomenclatura/catalogo/versao.ts` (fim do arquivo)
- Modify: `src/modules/projetos/nomenclatura/catalogo/importacao.ts` (troca `itemLinha` privado por `linhaDoItem`)
- Test: `src/modules/projetos/nomenclatura/catalogo/versao.test.ts`

**Interfaces:**
- Consumes: `simular`, `colisoes`, `versoesAPartirDe`, `chaveAlvo`, `idCardNovo`, `SiglaVolta` (Task 1).
- Produces (todos exportados de `versao.ts`):
  - `type OperacaoTela` (operação como a tela e a action a descrevem) e `operacoesComId(ops: readonly OperacaoTela[]): OperacaoComId[]` — ids `op0`, `op1`…
  - `linhaDoItem(snap, alvo, linhaId): SiglaSnap | undefined`
  - `type ConflitoSigla = { sigla: string; versao: number; dono: string; papel: "oficial" | "sinônimo" }`
  - `type PlanoTransferencia = { conflitos: ConflitoSigla[]; encerrar: OperacaoComId[]; recusa: string | null }`
  - `planejarTransferencia(snap, versao, ops: readonly OperacaoComId[], versoesExistentes: readonly number[]): PlanoTransferencia`
  - `mensagemConflito(c: ConflitoSigla): string`
  - `resolverLeva(plano, ops, transferir: boolean): { ok: true; ops: OperacaoComId[] } | { ok: false; erro: string }`
  - `siglasParaVoltar(snap, alvo, versao): SiglaVolta[]`
  - `linhasDoItemNaVersao(snap, alvo, versao): { oficial: SiglaSnap | null; sinonimos: SiglaSnap[] }`
  - `opsDasSiglas(alvo, antes, depois: { oficial: string | null; sinonimos: readonly string[] }): OperacaoTela[]`

- [ ] **Step 1: Escrever os testes (falham)**

No topo de `versao.test.ts`, troque o import por:

```ts
import { describe, expect, it } from "vitest";
import { catalogoDev } from "@/test/catalogo-nomenclatura-snap";
import {
  catalogoNaVersao,
  colisoes,
  linhasDoItemNaVersao,
  mensagemConflito,
  operacoesComId,
  opsDasSiglas,
  planejarTransferencia,
  resolverLeva,
  siglasDoItemNaVersao,
  siglasParaVoltar,
  simular,
  type OperacaoComId,
} from "./versao";
```

No fim do arquivo, acrescente:

```ts
describe("planejarTransferencia", () => {
  const versoes = [1, 2];

  it("o caso do ESG: o sinônimo do card vira sigla da sub, a partir da v2", () => {
    const ops = operacoesComId([{ tipo: "sub-nova", cardId: "hid", nome: "Esgoto", sigla: "ESG" }]);
    const p = planejarTransferencia(catalogoDev(), 2, ops, versoes);
    expect(p.recusa).toBeNull();
    expect(p.conflitos).toEqual([{ sigla: "ESG", versao: 2, dono: "Hidrossanitário", papel: "sinônimo" }]);
    expect(mensagemConflito(p.conflitos[0])).toBe("ESG é sinônimo de “Hidrossanitário” na v2.");
    const s = simular(catalogoDev(), 2, [...p.encerrar, ...ops]);
    expect(colisoes(s, versoes)).toEqual([]);
    expect(siglasDoItemNaVersao(s, D("hid"), 1).sinonimos).toContain("ESG");
    expect(siglasDoItemNaVersao(s, D("hid"), 2).sinonimos).not.toContain("ESG");
  });

  it("sigla oficial de outro item: conflito com papel oficial, o outro fica sem sigla", () => {
    const ops = operacoesComId([{ tipo: "sub-nova", cardId: "est", nome: "Estrutura metálica", sigla: "EST" }]);
    const p = planejarTransferencia(catalogoDev(), 2, ops, versoes);
    expect(p.conflitos).toEqual([{ sigla: "EST", versao: 2, dono: "Estrutural", papel: "oficial" }]);
    const s = simular(catalogoDev(), 2, [...p.encerrar, ...ops]);
    expect(siglasDoItemNaVersao(s, D("est"), 2).oficial).toBeNull();
    expect(siglasDoItemNaVersao(s, D("est"), 1).oficial).toBe("EST");
  });

  it("sem conflito: nada a encerrar", () => {
    const ops = operacoesComId([{ tipo: "sinonimo-novo", alvo: D("ele"), sigla: "ELT" }]);
    expect(planejarTransferencia(catalogoDev(), 2, ops, versoes)).toEqual({ conflitos: [], encerrar: [], recusa: null });
  });

  it("mesma sigla em dois itens da mesma leva: recusa", () => {
    const ops = operacoesComId([
      { tipo: "sinonimo-novo", alvo: D("ele"), sigla: "XYZ" },
      { tipo: "sinonimo-novo", alvo: D("gas"), sigla: "XYZ" },
    ]);
    expect(planejarTransferencia(catalogoDev(), 2, ops, versoes).recusa).toBe(
      "A sigla XYZ apareceria duas vezes: “Elétrico” e “Gás”.",
    );
  });

  it("dono só numa versão posterior: recusa dizendo a versão", () => {
    const snap = catalogoDev();
    snap.cards.find((c) => c.id === "gas")!.siglas.push({ id: "gas-v3", sigla: "XYZ", oficial: false, versaoDesde: 3, versaoAte: null });
    const ops = operacoesComId([{ tipo: "sinonimo-novo", alvo: D("ele"), sigla: "XYZ" }]);
    expect(planejarTransferencia(snap, 2, ops, [1, 2, 3]).recusa).toBe(
      "Na v3, a sigla XYZ já é de “Gás”. Troque a sigla de lá nessa versão antes.",
    );
  });

  it("voltar um card com uma sigla que hoje é de outro: conflito na volta", () => {
    const snap = catalogoDev();
    snap.cards.find((c) => c.id === "acu")!.versaoAte = 1;
    snap.subs.push({
      id: "s-acu",
      cardId: "arq",
      nome: "Acústica",
      ativo: true,
      ordem: 0,
      versaoDesde: 2,
      versaoAte: null,
      siglas: [{ id: "s-acu-s0", sigla: "ACU", oficial: true, versaoDesde: 2, versaoAte: null }],
    });
    const ops = operacoesComId([{ tipo: "entra", alvo: D("acu"), siglas: siglasParaVoltar(snap, D("acu"), 2) }]);
    expect(planejarTransferencia(snap, 2, ops, versoes).conflitos).toEqual([
      { sigla: "ACU", versao: 2, dono: "Acústica (sub de Arquitetura)", papel: "oficial" },
    ]);
  });
});

describe("resolverLeva", () => {
  const ops = operacoesComId([{ tipo: "sub-nova", cardId: "hid", nome: "Esgoto", sigla: "ESG" }]);
  const plano = () => planejarTransferencia(catalogoDev(), 2, ops, [1, 2]);

  it("conflito sem transferir (tela velha): recusa e pede para recarregar", () => {
    expect(resolverLeva(plano(), ops, false)).toEqual({
      ok: false,
      erro: "ESG é sinônimo de “Hidrossanitário” na v2. A tela pode estar desatualizada: recarregue e confirme a transferência.",
    });
  });

  it("com transferir: tira do outro dono antes de gravar", () => {
    const r = resolverLeva(plano(), ops, true);
    expect(r.ok && r.ops.map((o) => o.tipo)).toEqual(["encerrar-sigla", "sub-nova"]);
  });

  it("recusa do plano passa adiante", () => {
    expect(resolverLeva({ conflitos: [], encerrar: [], recusa: "Não dá." }, ops, true)).toEqual({ ok: false, erro: "Não dá." });
  });

  it("mais de uma oficial voltando com o item: recusa", () => {
    const volta = operacoesComId([
      { tipo: "entra", alvo: D("hid"), siglas: [{ sigla: "HID", oficial: true }, { sigla: "HDR", oficial: true }] },
    ]);
    expect(resolverLeva({ conflitos: [], encerrar: [], recusa: null }, volta, false)).toEqual({
      ok: false,
      erro: "Só uma sigla oficial pode voltar com o item.",
    });
  });
});

describe("siglasParaVoltar", () => {
  it("oferece as siglas da última versão em que o item existiu", () => {
    const fora = simular(catalogoDev(), 2, operacoesComId([{ tipo: "sai", alvo: D("hid") }]));
    expect(siglasParaVoltar(fora, D("hid"), 2)).toEqual([
      { sigla: "HID", oficial: true },
      { sigla: "HDR", oficial: false },
      { sigla: "ESG", oficial: false },
    ]);
  });
});

describe("opsDasSiglas", () => {
  const hid = () => linhasDoItemNaVersao(catalogoDev(), D("hid"), 2);

  it("lê oficial e sinônimos da versão com os ids das linhas", () => {
    expect(hid()).toMatchObject({
      oficial: { id: "hid-s0", sigla: "HID" },
      sinonimos: [{ id: "hid-s1", sigla: "HDR" }, { id: "hid-s2", sigla: "ESG" }],
    });
  });

  it("sem mudança: nenhuma operação", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: "HID", sinonimos: ["HDR", "ESG"] })).toEqual([]);
  });

  it("tirar um sinônimo = encerrar a linha dele", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: "HID", sinonimos: ["HDR"] })).toEqual([
      { tipo: "encerrar-sigla", alvo: D("hid"), linhaId: "hid-s2", sigla: "ESG" },
    ]);
  });

  it("sinônimo novo", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: "HID", sinonimos: ["HDR", "ESG", "HSN"] })).toEqual([
      { tipo: "sinonimo-novo", alvo: D("hid"), sigla: "HSN" },
    ]);
  });

  it("promover um sinônimo e rebaixar a oficial no mesmo salvar", () => {
    const ops = opsDasSiglas(D("hid"), hid(), { oficial: "HDR", sinonimos: ["ESG", "HID"] });
    expect(ops).toEqual([
      { tipo: "sigla-nova", alvo: D("hid"), sigla: "HDR" },
      { tipo: "sinonimo-novo", alvo: D("hid"), sigla: "HID" },
    ]);
    const s = simular(catalogoDev(), 2, operacoesComId(ops));
    expect(siglasDoItemNaVersao(s, D("hid"), 2)).toEqual({ oficial: "HDR", sinonimos: ["ESG", "HID"] });
  });

  it("oficial vazia: o item fica sem sigla na versão", () => {
    expect(opsDasSiglas(D("hid"), hid(), { oficial: null, sinonimos: ["HDR", "ESG"] })).toEqual([
      { tipo: "encerrar-sigla", alvo: D("hid"), linhaId: "hid-s0", sigla: "HID" },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/projetos/nomenclatura/catalogo/versao.test.ts`
Expected: FAIL — `operacoesComId`, `planejarTransferencia` etc. não existem.

- [ ] **Step 3: Implementar no fim de `versao.ts`**

```ts
// ─── Operações da tela e transferência de sigla ──────────────────────────────

/** Operação como a tela (e a action) a descrevem — sem os ids internos da simulação. */
export type OperacaoTela =
  | { tipo: "card-novo"; nome: string; sigla: string | null }
  | { tipo: "sub-nova"; cardId: string; nome: string; sigla: string | null }
  | { tipo: "item-novo"; categoria: "fase" | "tipo"; nome: string; sigla: string }
  | { tipo: "sigla-nova"; alvo: AlvoCatalogo; sigla: string }
  | { tipo: "sinonimo-novo"; alvo: AlvoCatalogo; sigla: string }
  | { tipo: "encerrar-sigla"; alvo: AlvoCatalogo; linhaId: string; sigla: string }
  | { tipo: "sai"; alvo: AlvoCatalogo }
  | { tipo: "entra"; alvo: AlvoCatalogo; siglas?: SiglaVolta[] };

/** Ids estáveis (`op0`, `op1`…) para simular e gravar: a tela e o servidor geram os mesmos. */
export function operacoesComId(ops: readonly OperacaoTela[]): OperacaoComId[] {
  return ops.map((o, i): OperacaoComId => {
    const id = `op${i}`;
    if (o.tipo === "card-novo") return { id, tipo: "card-novo", chave: id, nome: o.nome, sigla: o.sigla, categoria: null };
    if (o.tipo === "sub-nova") return { id, tipo: "sub-nova", card: { id: o.cardId }, nome: o.nome, sigla: o.sigla };
    return { id, ...o };
  });
}

/** A linha de sigla `linhaId` do item. */
export function linhaDoItem(snap: CatalogoSnap, alvo: AlvoCatalogo, linhaId: string): SiglaSnap | undefined {
  return itemDe(snap, alvo)?.siglas.find((l) => l.id === linhaId);
}

export type ConflitoSigla = {
  sigla: string;
  versao: number;
  /** Rótulo do outro dono: "Hidrossanitário" ou "Esgoto (sub de Hidrossanitário)". */
  dono: string;
  papel: "oficial" | "sinônimo";
};

export type PlanoTransferencia = {
  /** Conflitos na versão editada que a transferência resolve (tirando a sigla do outro dono). */
  conflitos: ConflitoSigla[];
  /** O que tira a sigla dos outros donos a partir da versão — grava ANTES das operações da tela. */
  encerrar: OperacaoComId[];
  /** Conflito que a transferência não resolve (sigla repetida na leva, ou dono só numa versão posterior). */
  recusa: string | null;
};

/** Chaves (`chaveAlvo`) dos itens que a leva mexe ou cria — os "novos donos" de uma sigla. */
function alvosDaLeva(ops: readonly OperacaoComId[]): Set<string> {
  const chaves = new Set<string>();
  for (const op of ops) {
    if (op.tipo === "card-novo") chaves.add(chaveAlvo({ tipo: "disciplina", id: idCardNovo(op.chave) }));
    else if (op.tipo === "sub-nova") chaves.add(chaveAlvo({ tipo: "subdisciplina", id: `novo-sub:${op.id}` }));
    else if (op.tipo === "item-novo") chaves.add(chaveAlvo({ tipo: "prancha", id: `novo-item:${op.id}` }));
    else if (op.tipo !== "sai") chaves.add(chaveAlvo(op.alvo));
  }
  return chaves;
}

/**
 * O que salvar `ops` na versão causa nas siglas dos OUTROS itens: quem perde a sigla se a tela
 * confirmar "Tirar de lá e usar aqui" (a regra da importação, "a planilha manda"), ou por que não
 * dá. Roda na tela (prévia, antes de salvar) e no servidor (que recalcula contra o banco).
 */
export function planejarTransferencia(
  snap: CatalogoSnap,
  versao: number,
  ops: readonly OperacaoComId[],
  versoesExistentes: readonly number[],
): PlanoTransferencia {
  const daLeva = alvosDaLeva(ops);
  const depois = simular(snap, versao, ops);
  const conflitos: ConflitoSigla[] = [];
  const encerrar: OperacaoComId[] = [];
  for (const col of colisoes(depois, [versao])) {
    const novos = col.donos.filter((d) => daLeva.has(d.chave));
    if (novos.length === 0) continue; // conflito antigo, que esta edição não toca
    if (novos.length > 1) {
      return {
        conflitos: [],
        encerrar: [],
        recusa: `A sigla ${col.sigla} apareceria duas vezes: ${novos.map((d) => `“${d.rotulo}”`).join(" e ")}.`,
      };
    }
    for (const outro of col.donos.filter((d) => !daLeva.has(d.chave))) {
      const linha = linhaDoItem(depois, outro.alvo, outro.linhaId);
      conflitos.push({ sigla: col.sigla, versao, dono: outro.rotulo, papel: linha?.oficial ? "oficial" : "sinônimo" });
      encerrar.push({
        id: `encerrar:${outro.chave}:${outro.linhaId}`,
        tipo: "encerrar-sigla",
        alvo: outro.alvo,
        linhaId: outro.linhaId,
        sigla: col.sigla,
      });
    }
  }
  const final = simular(snap, versao, [...encerrar, ...ops]);
  const sobra = colisoes(final, versoesAPartirDe(versao, versoesExistentes)).find((c) => c.donos.some((d) => daLeva.has(d.chave)));
  if (sobra) {
    const outros = sobra.donos.filter((d) => !daLeva.has(d.chave)).map((d) => `“${d.rotulo}”`);
    return {
      conflitos,
      encerrar,
      recusa: `Na v${sobra.versao}, a sigla ${sobra.sigla} já é de ${outros.join(" e ") || "outro item"}. Troque a sigla de lá nessa versão antes.`,
    };
  }
  return { conflitos, encerrar, recusa: null };
}

/** Frase do conflito — a mesma na tela e no servidor. */
export function mensagemConflito(c: ConflitoSigla): string {
  return `${c.sigla} é ${c.papel === "oficial" ? "a sigla oficial" : "sinônimo"} de “${c.dono}” na v${c.versao}.`;
}

/** O que o servidor grava: as transferências antes das operações da tela — ou o motivo de não gravar. */
export function resolverLeva(
  plano: PlanoTransferencia,
  ops: readonly OperacaoComId[],
  transferir: boolean,
): { ok: true; ops: OperacaoComId[] } | { ok: false; erro: string } {
  for (const op of ops) {
    if (op.tipo === "entra" && (op.siglas ?? []).filter((s) => s.oficial).length > 1) {
      return { ok: false, erro: "Só uma sigla oficial pode voltar com o item." };
    }
  }
  if (plano.recusa) return { ok: false, erro: plano.recusa };
  if (plano.conflitos.length > 0 && !transferir) {
    return {
      ok: false,
      erro: `${mensagemConflito(plano.conflitos[0])} A tela pode estar desatualizada: recarregue e confirme a transferência.`,
    };
  }
  return { ok: true, ops: [...plano.encerrar, ...ops] };
}

/**
 * O que "Voltar para a vN" oferece: as siglas que o item tinha na última versão em que existiu antes
 * da vN (ou na primeira depois, se ele só começa mais tarde), com o papel de cada uma.
 */
export function siglasParaVoltar(snap: CatalogoSnap, alvo: AlvoCatalogo, versao: number): SiglaVolta[] {
  const item = itemDe(snap, alvo);
  if (!item) return [];
  const referencia = item.versaoAte !== null && item.versaoAte < versao ? item.versaoAte : Math.max(item.versaoDesde, versao);
  const { oficial, sinonimos } = siglasNaVersao(item.siglas, referencia);
  return [...(oficial ? [{ sigla: oficial, oficial: true }] : []), ...sinonimos.map((sigla) => ({ sigla, oficial: false }))];
}

/** As linhas de sigla que valem no item na versão, com o id (para encerrar) — base do diálogo de siglas. */
export function linhasDoItemNaVersao(
  snap: CatalogoSnap,
  alvo: AlvoCatalogo,
  versao: number,
): { oficial: SiglaSnap | null; sinonimos: SiglaSnap[] } {
  const item = itemDe(snap, alvo);
  if (!item || !existe(snap, alvo, versao, false)) return { oficial: null, sinonimos: [] };
  const validas = item.siglas.filter((l) => valeNaVersao(l, versao));
  const oficial = validas.filter((l) => l.oficial).sort((a, b) => b.versaoDesde - a.versaoDesde)[0] ?? null;
  const vistas = new Set(oficial ? [oficial.sigla] : []);
  const sinonimos: SiglaSnap[] = [];
  for (const l of validas) {
    if (l.oficial || vistas.has(l.sigla)) continue;
    vistas.add(l.sigla);
    sinonimos.push(l);
  }
  return { oficial, sinonimos };
}

/**
 * Operações que levam as siglas do item na versão de `antes` para `depois` (diálogo "Siglas nesta
 * versão"). Siglas já normalizadas. Oficial `null` = o item fica sem sigla na versão.
 */
export function opsDasSiglas(
  alvo: AlvoCatalogo,
  antes: { oficial: SiglaSnap | null; sinonimos: readonly SiglaSnap[] },
  depois: { oficial: string | null; sinonimos: readonly string[] },
): OperacaoTela[] {
  const ops: OperacaoTela[] = [];
  for (const l of antes.sinonimos) {
    // Sinônimo promovido a oficial sai pela própria `sigla-nova`.
    if (!depois.sinonimos.includes(l.sigla) && l.sigla !== depois.oficial) {
      ops.push({ tipo: "encerrar-sigla", alvo, linhaId: l.id, sigla: l.sigla });
    }
  }
  if ((antes.oficial?.sigla ?? null) !== depois.oficial) {
    if (depois.oficial) ops.push({ tipo: "sigla-nova", alvo, sigla: depois.oficial });
    else if (antes.oficial) ops.push({ tipo: "encerrar-sigla", alvo, linhaId: antes.oficial.id, sigla: antes.oficial.sigla });
  }
  const jaSao = new Set(antes.sinonimos.map((l) => l.sigla));
  for (const sigla of depois.sinonimos) {
    if (!jaSao.has(sigla) && sigla !== depois.oficial) ops.push({ tipo: "sinonimo-novo", alvo, sigla });
  }
  return ops;
}
```

Em `importacao.ts`: apague a função privada `itemLinha` (≈420-426), importe `linhaDoItem` de `./versao` junto dos outros imports desse arquivo, e troque a chamada `itemLinha(depois, outro.alvo, outro.linhaId)` por `linhaDoItem(depois, outro.alvo, outro.linhaId)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/projetos/nomenclatura`
Expected: PASS (inclusive `importacao.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/projetos/nomenclatura/catalogo/versao.ts src/modules/projetos/nomenclatura/catalogo/versao.test.ts src/modules/projetos/nomenclatura/catalogo/importacao.ts
git commit -m "feat(nomenclatura): transferência de sigla e operações da tela de siglas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 3: Teste-guarda da faixa efetiva

Com a Task 1, um card que sai deixa as linhas "em aberto". Isso só é seguro porque os três leitores recortam pela faixa efetiva (spec §5.1). Este teste quebra se alguém escrever um leitor que leia a linha crua.

**Files:**
- Create: `src/modules/projetos/nomenclatura/catalogo/faixa-efetiva.test.ts`

**Interfaces:**
- Consumes: `simular`, `colisoes`, `operacoesComId` (Tasks 1-2); `catalogosDaVersao`, `siglasEfetivas` (`uploads/nomenclatura/siglas-versao.ts`, sem mudança).

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, expect, it } from "vitest";
import { catalogoDev } from "@/test/catalogo-nomenclatura-snap";
import { catalogosDaVersao, siglasEfetivas } from "@/modules/uploads/nomenclatura/siglas-versao";
import { colisoes, operacoesComId, simular, type CatalogoSnap } from "./versao";

/**
 * Guarda da E3 (spec 2026-09-30-catalogo-nomenclatura-unificado §5.1): tirar um item da versão não
 * mexe nas linhas de sigla dele, então TODO leitor recorta pela faixa efetiva (sigla ∩ item ∩ card).
 * Se um leitor novo ler a linha crua, o card que saiu volta a "ocupar" a sigla na versão.
 * A trava de publicação (`siglas-queries.ts` → `todasAsSiglasComRotulo`) faz o mesmo recorte inline;
 * `siglasEfetivas` é a versão pura dele.
 */
function paraMotor(snap: CatalogoSnap) {
  return {
    disciplinas: snap.cards.map((c) => ({
      id: c.id,
      numeracao: null,
      numeracaoFim: null,
      versaoDesde: c.versaoDesde,
      versaoAte: c.versaoAte,
      siglas: c.siglas,
    })),
    subdisciplinas: snap.subs.map((s) => ({
      id: s.id,
      disciplinaCatalogoId: s.cardId,
      versaoDesde: s.versaoDesde,
      versaoAte: s.versaoAte,
      siglas: s.siglas,
    })),
    pranchas: snap.itens.map((i) => ({
      id: i.id,
      categoria: i.categoria,
      projetoId: null,
      versaoDesde: i.versaoDesde,
      versaoAte: i.versaoAte,
      siglas: i.siglas,
    })),
  };
}

describe("faixa efetiva: card que saiu não vale na versão, mesmo com a linha em aberto", () => {
  const saiu = simular(catalogoDev(), 2, operacoesComId([{ tipo: "sai", alvo: { tipo: "disciplina", id: "log" } }]));

  it("a linha de sigla continua em aberto (é o que a E3 muda)", () => {
    expect(saiu.cards.find((c) => c.id === "log")!.siglas[0]).toMatchObject({ sigla: "LOG", versaoAte: null });
  });

  it("motor de envio: não reconhece LOG na v2, reconhece na v1", () => {
    expect(catalogosDaVersao(paraMotor(saiu), 2).disciplinas.map((d) => d.codigo)).not.toContain("LOG");
    expect(catalogosDaVersao(paraMotor(saiu), 1).disciplinas.map((d) => d.codigo)).toContain("LOG");
  });

  it("trava de publicação: a linha é cortada na faixa do card", () => {
    const log = saiu.cards.find((c) => c.id === "log")!;
    expect(siglasEfetivas(log.siglas, log)).toEqual([expect.objectContaining({ sigla: "LOG", versaoDesde: 1, versaoAte: 1 })]);
  });

  it("colisão: outro card pode usar LOG na v2", () => {
    const s = simular(saiu, 2, operacoesComId([{ tipo: "card-novo", nome: "Lógica", sigla: "LOG" }]));
    expect(colisoes(s, [1, 2])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run src/modules/projetos/nomenclatura/catalogo/faixa-efetiva.test.ts`
Expected: PASS (as Tasks 1-2 já estão feitas; se falhar, um leitor lê a linha crua — pare e investigue antes de seguir).

- [ ] **Step 3: Conferir o recorte da trava de publicação no código**

Abra `src/modules/uploads/nomenclatura/siglas-queries.ts` e confirme que `todasAsSiglasComRotulo` ainda faz `for (const f of alvo?.faixas ?? []) faixa = faixa && intersecaoFaixas(faixa, f);` antes de devolver cada linha. Nada a mudar.

- [ ] **Step 4: Commit**

```bash
git add src/modules/projetos/nomenclatura/catalogo/faixa-efetiva.test.ts
git commit -m "test(nomenclatura): guarda da faixa efetiva nos leitores de sigla

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 4: Formulário antigo — mudar só a validade não mexe nas siglas

Até a F4 retirar os campos, o formulário "Editar disciplina" (e o da Lista Mestre) ainda tem "Vale a partir da / Até a". Foi esse campo que tirou o Hidrossanitário inteiro da v2 em produção, porque as linhas espelho acompanhavam a faixa. Com a E3, mudar só a validade mantém as linhas — e voltar "Até → Sem fim" restaura tudo.

**Files:**
- Modify: `src/modules/uploads/nomenclatura/siglas-versao.ts:70-97` (`decidirSiglasAoSalvar`)
- Test: `src/modules/uploads/nomenclatura/siglas-versao.test.ts:124-135`

**Interfaces:**
- Produces: `decidirSiglasAoSalvar` com a mesma assinatura; `faixaDepois` continua no tipo de entrada (os chamadores mandam) mas não decide mais nada.

- [ ] **Step 1: Ajustar o teste (falha)**

Substitua o teste `"item espelho: mudar sigla ou validade regrava; não mudar nada mantém"` por:

```ts
  it("item espelho: mudar sigla regrava; mudar só a validade mantém as linhas (E3)", () => {
    const log = [linha("LOG", true)];
    const colunas = { oficial: "LOG", sinonimos: [] };
    const base = { linhas: log, colunasAntes: colunas, faixaAntes: sempre };
    expect(decidirSiglasAoSalvar({ ...base, colunasDepois: colunas, faixaDepois: sempre })).toBe("manter");
    expect(decidirSiglasAoSalvar({ ...base, colunasDepois: { oficial: "CAB", sinonimos: [] }, faixaDepois: sempre })).toBe(
      "espelhar",
    );
    expect(decidirSiglasAoSalvar({ ...base, colunasDepois: colunas, faixaDepois: { versaoDesde: 1, versaoAte: 1 } })).toBe(
      "manter",
    );
  });

  it("o incidente de 2026-09-30: Até a v1 e depois Sem fim deixam as siglas como estavam", () => {
    const hid = [linha("HID", true), linha("HDR", false), linha("ESG", false)];
    const colunas = { oficial: "HID", sinonimos: ["HDR", "ESG"] };
    const ate1 = decidirSiglasAoSalvar({
      linhas: hid,
      colunasAntes: colunas,
      faixaAntes: sempre,
      colunasDepois: colunas,
      faixaDepois: { versaoDesde: 1, versaoAte: 1 },
    });
    expect(ate1).toBe("manter");
    const semFim = decidirSiglasAoSalvar({
      linhas: hid,
      colunasAntes: colunas,
      faixaAntes: { versaoDesde: 1, versaoAte: 1 },
      colunasDepois: colunas,
      faixaDepois: sempre,
    });
    expect(semFim).toBe("manter");
  });
```

(Confirme no topo do `describe` que `const sempre = { versaoDesde: 1, versaoAte: null };` e a função `linha(sigla, oficial, desde?, ate?)` existem — existem hoje, linhas 83 e acima.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/uploads/nomenclatura/siglas-versao.test.ts`
Expected: FAIL — a terceira expectativa devolve `"espelhar"`.

- [ ] **Step 3: Implementar**

Substitua o comentário e o corpo de `decidirSiglasAoSalvar` por:

```ts
/**
 * O que fazer com as siglas do item quando o formulário dele (card ou item da Lista Mestre) é
 * salvo — pelo lápis, pelo olho de ativar/desativar, por qualquer caminho:
 * - `manter`: sigla e sinônimos não mudaram. Mudar SÓ a validade do item também cai aqui (E3 da spec
 *   2026-09-30): a faixa efetiva (sigla ∩ item) já recorta as linhas; regravá-las na faixa do item
 *   tirava as siglas junto e "Até a v1 → Sem fim" não as trazia de volta (incidente do Hidrossanitário);
 * - `espelhar`: as linhas ainda eram o espelho das colunas e a sigla ou um sinônimo mudou →
 *   regravar as linhas a partir das colunas novas;
 * - `bloquear`: o item tem siglas por versão e o formulário tentou mudar sigla/sinônimo pelas
 *   colunas — regravar apagaria as decisões por versão.
 */
export function decidirSiglasAoSalvar(entrada: {
  linhas: readonly SiglaLinha[];
  colunasAntes: ColunasSigla;
  faixaAntes: FaixaVersao;
  colunasDepois: ColunasSigla;
  faixaDepois: FaixaVersao;
}): "espelhar" | "manter" | "bloquear" {
  const { linhas, colunasAntes, faixaAntes, colunasDepois } = entrada;
  const colunasMudaram = !mesmasLinhas(
    siglasDasColunas(colunasAntes.oficial, colunasAntes.sinonimos),
    siglasDasColunas(colunasDepois.oficial, colunasDepois.sinonimos),
  );
  if (!colunasMudaram) return "manter";
  return siglasSaoEspelho(linhas, colunasAntes, faixaAntes) ? "espelhar" : "bloquear";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/uploads/nomenclatura src/modules/projetos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/uploads/nomenclatura/siglas-versao.ts src/modules/uploads/nomenclatura/siglas-versao.test.ts
git commit -m "fix(nomenclatura): mudar só a validade da disciplina não apaga mais as siglas dela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 5: Gravação no banco igual à simulação + smoke

**Files:**
- Modify: `src/modules/projetos/nomenclatura/catalogo/service.ts`
- Modify: `src/modules/projetos/nomenclatura/catalogo/queries.ts`
- Create: `scripts/smoke-catalogo-nomenclatura.ts`
- Modify: `package.json` (scripts), `CLAUDE.md` (lista de smokes)

**Interfaces:**
- Consumes: `OperacaoComId`, `SiglaVolta` (Task 1); `operacoesComId`, `planejarTransferencia`, `resolverLeva`, `siglasParaVoltar` (Task 2).
- Produces: `carregarCatalogoSnap(db?: Prisma.TransactionClient | typeof prisma)`; `executarOperacoes` aceita `sinonimo-novo` e `entra.siglas`.

- [ ] **Step 1: `queries.ts` aceita a transação (consultas em sequência)**

Substitua a função `carregarCatalogoSnap` (e acrescente o import e o tipo):

```ts
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CatalogoSnap } from "./versao";

type Db = Prisma.TransactionClient | typeof prisma;

const LINHAS = { select: { id: true, sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } as const;

/**
 * O catálogo global de nomenclatura inteiro (arquivados inclusos — contam na checagem de sigla,
 * como no diálogo "Siglas por versão"): cards, subs e fases/tipos sem projeto. Pequeno (dezenas
 * de itens), lido de uma vez para a tela "Catálogo da vN" e para planejar a importação. Aceita a
 * transação (o smoke lê dentro dela); por isso as três consultas vão em sequência, não em
 * `Promise.all` (uma transação tem uma conexão só).
 */
export async function carregarCatalogoSnap(db: Db = prisma): Promise<CatalogoSnap> {
  const cards = await db.disciplinaCatalogo.findMany({
    select: {
      id: true,
      nome: true,
      codigo: true,
      sinonimos: true,
      categoria: true,
      ativo: true,
      ordem: true,
      versaoDesde: true,
      versaoAte: true,
      siglas: LINHAS,
    },
  });
  const subs = await db.subdisciplinaCatalogo.findMany({
    select: {
      id: true,
      disciplinaCatalogoId: true,
      nome: true,
      ativo: true,
      ordem: true,
      versaoDesde: true,
      versaoAte: true,
      siglas: LINHAS,
    },
  });
  const itens = await db.pranchaCatalogo.findMany({
    where: { projetoId: null, categoria: { in: ["fase", "tipo"] } },
    select: {
      id: true,
      categoria: true,
      sigla: true,
      nome: true,
      sinonimos: true,
      ativo: true,
      ordem: true,
      versaoDesde: true,
      versaoAte: true,
      siglas: LINHAS,
    },
  });
  return {
    cards,
    subs: subs.map(({ disciplinaCatalogoId, ...s }) => ({ ...s, cardId: disciplinaCatalogoId })),
    itens: itens.map((i) => ({ ...i, categoria: i.categoria as "fase" | "tipo" })),
  };
}
```

(`numerosDasVersoes` fica como está.)

- [ ] **Step 2: `service.ts` — mesma regra de `simular`**

2a. Imports: troque

```ts
import { siglasSaoEspelho, valeNaVersao, type FaixaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";
import type { AlvoCatalogo, OperacaoComId } from "./versao";
```
por
```ts
import { valeNaVersao, type FaixaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";
import type { AlvoCatalogo, OperacaoComId, SiglaVolta } from "./versao";
```

2b. Substitua `criarOficial` e `mudarFaixa` por:

```ts
async function criarLinha(tx: Tx, alvo: AlvoCatalogo, sigla: string, oficial: boolean, versao: number) {
  await tx.siglaNomenclatura.create({
    data: { sigla, categoria: await categoriaDaSigla(tx, alvo), oficial, versaoDesde: versao, ...ondeSiglas(alvo) },
  });
}

/** Troca a faixa do item. As linhas de sigla NÃO mudam (E3): a faixa efetiva as recorta. */
async function mudarFaixa(tx: Tx, alvo: AlvoCatalogo, faixa: FaixaVersao, ativo?: boolean) {
  const data = { ...faixa, ...(ativo === undefined ? {} : { ativo }) };
  if (alvo.tipo === "subdisciplina") await tx.subdisciplinaCatalogo.update({ where: { id: alvo.id }, data });
  else if (alvo.tipo === "disciplina") await tx.disciplinaCatalogo.update({ where: { id: alvo.id }, data });
  else await tx.pranchaCatalogo.update({ where: { id: alvo.id }, data });
}

/** "Voltar" com as siglas escolhidas — a mesma regra de `siglasAoVoltar` em `versao.ts`. */
async function siglasAoVoltar(tx: Tx, alvo: AlvoCatalogo, escolhidas: readonly SiglaVolta[], versao: number) {
  const querem = new Set(escolhidas.map((e) => e.sigla));
  const linhas = await tx.siglaNomenclatura.findMany({ where: ondeSiglas(alvo), ...LINHAS });
  const valem = new Set<string>();
  for (const l of linhas) {
    if (!valeNaVersao(l, versao)) continue;
    if (querem.has(l.sigla)) valem.add(l.sigla);
    else await encerrarLinha(tx, l, versao);
  }
  for (const e of escolhidas) {
    if (!valem.has(e.sigla)) await criarLinha(tx, alvo, e.sigla, e.oficial, versao);
  }
}
```

2c. Em `executarOperacoes`, troque as chamadas `criarOficial(tx, X, sigla, versao)` (em `card-novo` e `sub-nova`) por `criarLinha(tx, X, sigla, true, versao)`, e substitua os `case` `"entra"` e `"sigla-nova"` e acrescente `"sinonimo-novo"`:

```ts
      case "entra": {
        const item = await itemBase(tx, op.alvo);
        await mudarFaixa(
          tx,
          op.alvo,
          {
            versaoDesde: Math.min(item.versaoDesde, versao),
            versaoAte: item.versaoAte !== null && item.versaoAte < versao ? null : item.versaoAte,
          },
          true,
        );
        if (op.siglas) await siglasAoVoltar(tx, op.alvo, op.siglas, versao);
        break;
      }
      case "sigla-nova": {
        // A oficial de hoje sai; um sinônimo do próprio item com a mesma sigla também (foi promovido).
        const linhas = await tx.siglaNomenclatura.findMany({
          where: { ...ondeSiglas(op.alvo), OR: [{ oficial: true }, { sigla: op.sigla }] },
          ...LINHAS,
        });
        for (const l of linhas) await encerrarLinha(tx, l, versao);
        await criarLinha(tx, op.alvo, op.sigla, true, versao);
        break;
      }
      case "sinonimo-novo": {
        await itemBase(tx, op.alvo);
        const mesmas = await tx.siglaNomenclatura.findMany({ where: { ...ondeSiglas(op.alvo), sigla: op.sigla }, ...LINHAS });
        if (!mesmas.some((l) => valeNaVersao(l, versao))) await criarLinha(tx, op.alvo, op.sigla, false, versao);
        break;
      }
```

O `case "sai"` continua chamando `mudarFaixa(tx, op.alvo, { versaoDesde: item.versaoDesde, versaoAte: versao - 1 })` — que agora não mexe nas linhas. `espelharSiglasDasColunas` continua importado (usado em `item-novo`).

- [ ] **Step 3: Escrever o smoke**

Create `scripts/smoke-catalogo-nomenclatura.ts`:

```ts
/**
 * Smoke do catálogo de nomenclatura (F1 da spec 2026-09-30-catalogo-nomenclatura-unificado) contra o
 * banco de dev, dentro de UMA transação desfeita no fim — nada fica gravado. O vitest cobre a regra
 * pura (`versao.ts`); aqui vai o I/O: `executarOperacoes` grava o mesmo que `simular` prevê.
 * Cenários: transferência de sinônimo (o caso do ESG), de sigla oficial, sair sem mexer nas linhas,
 * voltar escolhendo as siglas, e voltar um card com linhas truncadas pelo espelho antigo.
 *
 * Uso: npm run smoke:catalogo-nomenclatura
 */
import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { carregarCatalogoSnap, numerosDasVersoes } from "../src/modules/projetos/nomenclatura/catalogo/queries";
import { executarOperacoes } from "../src/modules/projetos/nomenclatura/catalogo/service";
import {
  operacoesComId,
  planejarTransferencia,
  resolverLeva,
  siglasDoItemNaVersao,
  siglasParaVoltar,
  simular,
  type AlvoCatalogo,
  type CatalogoSnap,
  type OperacaoTela,
} from "../src/modules/projetos/nomenclatura/catalogo/versao";

type Tx = Prisma.TransactionClient;

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

class Desfazer extends Error {}

const sufixo = Date.now().toString(36).toUpperCase().slice(-4);
/** Sigla de 5 caracteres, única por execução, para não esbarrar no catálogo real do dev. */
const S = (letra: string) => `${letra}${sufixo}`;

async function cardComSiglas(
  tx: Tx,
  nome: string,
  siglas: { sigla: string; oficial: boolean; versaoAte?: number | null }[],
  versaoAte: number | null = null,
): Promise<AlvoCatalogo> {
  const c = await tx.disciplinaCatalogo.create({ data: { nome, versaoDesde: 1, versaoAte } });
  for (const s of siglas) {
    await tx.siglaNomenclatura.create({
      data: { sigla: s.sigla, categoria: "disciplina", oficial: s.oficial, versaoDesde: 1, versaoAte: s.versaoAte ?? null, disciplinaCatalogoId: c.id },
    });
  }
  return { tipo: "disciplina", id: c.id };
}

/** Grava como a action: planeja contra o banco de agora, transfere, executa — e devolve o previsto e o gravado. */
async function gravar(tx: Tx, versao: number, versoes: number[], tela: OperacaoTela[]) {
  const snap = await carregarCatalogoSnap(tx);
  const ops = operacoesComId(tela);
  const plano = planejarTransferencia(snap, versao, ops, versoes);
  const leva = resolverLeva(plano, ops, true);
  if (!leva.ok) throw new Error(leva.erro);
  const previsto = simular(snap, versao, leva.ops);
  await executarOperacoes(tx, versao, leva.ops);
  return { plano, previsto, gravado: await carregarCatalogoSnap(tx) };
}

/** Mesma oficial e mesmos sinônimos em cada versão (o banco não garante a ordem das linhas). */
function mesmasSiglas(a: CatalogoSnap, b: CatalogoSnap, alvo: AlvoCatalogo, versoes: number[]): boolean {
  const chave = (s: CatalogoSnap, v: number) => {
    const x = siglasDoItemNaVersao(s, alvo, v);
    return JSON.stringify({ oficial: x.oficial, sinonimos: [...x.sinonimos].sort() });
  };
  return versoes.every((v) => chave(a, v) === chave(b, v));
}

async function main() {
  const versoes = await numerosDasVersoes();
  const V = Math.max(0, ...versoes);
  if (V < 2) {
    console.log("O banco de dev precisa de pelo menos 2 versões de nomenclatura (Configurações → Nomenclatura).");
    process.exitCode = 1;
    return;
  }
  const antes = Math.max(...versoes.filter((n) => n < V));
  console.log(`Versão editada: v${V} (anterior: v${antes}). Tudo numa transação desfeita no fim.`);

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. O caso do ESG: sinônimo do card vira a sigla de uma sub nova, a partir da V.
        const hid = await cardComSiglas(tx, `Smoke Hidro ${sufixo}`, [
          { sigla: S("H"), oficial: true },
          { sigla: S("E"), oficial: false },
        ]);
        const r1 = await gravar(tx, V, versoes, [{ tipo: "sub-nova", cardId: hid.id, nome: "Esgoto", sigla: S("E") }]);
        check("ESG: conflito lido como sinônimo do card", r1.plano.conflitos[0]?.papel === "sinônimo", r1.plano.conflitos);
        check("ESG: o card perde o sinônimo na V", !siglasDoItemNaVersao(r1.gravado, hid, V).sinonimos.includes(S("E")));
        check("ESG: o card mantém o sinônimo antes da V", siglasDoItemNaVersao(r1.gravado, hid, antes).sinonimos.includes(S("E")));
        const esgoto = r1.gravado.subs.find((s) => s.cardId === hid.id && s.nome === "Esgoto");
        check(
          "ESG: a sub nasce com a sigla na V",
          !!esgoto && siglasDoItemNaVersao(r1.gravado, { tipo: "subdisciplina", id: esgoto.id }, V).oficial === S("E"),
        );
        check("ESG: banco = simulação", mesmasSiglas(r1.previsto, r1.gravado, hid, versoes));

        // 2. Sigla oficial de outro card: ele fica sem sigla na V.
        const est = await cardComSiglas(tx, `Smoke Estrutural ${sufixo}`, [{ sigla: S("T"), oficial: true }]);
        const r2 = await gravar(tx, V, versoes, [{ tipo: "sub-nova", cardId: est.id, nome: "Metálica", sigla: S("T") }]);
        check("oficial: conflito lido como oficial", r2.plano.conflitos[0]?.papel === "oficial", r2.plano.conflitos);
        check("oficial: o card fica sem sigla na V", siglasDoItemNaVersao(r2.gravado, est, V).oficial === null);
        check("oficial: o card mantém a sigla antes da V", siglasDoItemNaVersao(r2.gravado, est, antes).oficial === S("T"));

        // 3. Sair não mexe nas linhas; voltar escolhendo só a oficial.
        const cab = await cardComSiglas(tx, `Smoke Cabeamento ${sufixo}`, [
          { sigla: S("L"), oficial: true },
          { sigla: S("C"), oficial: false },
        ]);
        const r3 = await gravar(tx, V, versoes, [{ tipo: "sai", alvo: cab }]);
        const linhasCab = await tx.siglaNomenclatura.findMany({ where: { disciplinaCatalogoId: cab.id } });
        check("sai: linhas de sigla intactas", linhasCab.every((l) => l.versaoAte === null), linhasCab);
        check("sai: o card não vale na V", siglasDoItemNaVersao(r3.gravado, cab, V).oficial === null);
        const oferta = siglasParaVoltar(r3.gravado, cab, V);
        check("voltar: oferece as duas siglas", oferta.length === 2, oferta);
        const r4 = await gravar(tx, V, versoes, [{ tipo: "entra", alvo: cab, siglas: oferta.filter((s) => s.oficial) }]);
        check(
          "voltar: só a oficial vale na V",
          JSON.stringify(siglasDoItemNaVersao(r4.gravado, cab, V)) === JSON.stringify({ oficial: S("L"), sinonimos: [] }),
          siglasDoItemNaVersao(r4.gravado, cab, V),
        );
        check("voltar: banco = simulação", mesmasSiglas(r4.previsto, r4.gravado, cab, versoes));

        // 4. Dado legado: card e linhas truncados juntos pelo espelho antigo.
        const leg = await cardComSiglas(tx, `Smoke Legado ${sufixo}`, [{ sigla: S("G"), oficial: true, versaoAte: V - 1 }], V - 1);
        const snapLeg = await carregarCatalogoSnap(tx);
        const r5 = await gravar(tx, V, versoes, [{ tipo: "entra", alvo: leg, siglas: siglasParaVoltar(snapLeg, leg, V) }]);
        check("legado: a sigla volta na V", siglasDoItemNaVersao(r5.gravado, leg, V).oficial === S("G"));
        check("legado: banco = simulação", mesmasSiglas(r5.previsto, r5.gravado, leg, versoes));

        throw new Desfazer();
      },
      { maxWait: 15000, timeout: 120000 },
    );
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }

  console.log(falhas === 0 ? "\nTudo certo (nada foi gravado: a transação foi desfeita)." : `\n${falhas} falha(s).`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Registrar o script**

Em `package.json`, junto dos outros `smoke:*`:

```json
    "smoke:catalogo-nomenclatura": "tsx --tsconfig tsconfig.server.json scripts/smoke-catalogo-nomenclatura.ts",
```

Em `CLAUDE.md`, na lista de comandos, depois da linha do `smoke:planejador`:

```
npm run smoke:catalogo-nomenclatura # catálogo da versão: sigla que muda de dono (sinônimo/oficial), sair sem mexer em sigla, voltar escolhendo
```

- [ ] **Step 5: Rodar testes e smoke**

```bash
npx vitest run src/modules/projetos/nomenclatura src/modules/uploads/nomenclatura src/lib/promise-all-em-transacao.test.ts
npm run smoke:catalogo-nomenclatura
```
Expected: vitest PASS; smoke imprime só `ok` e termina com "Tudo certo (nada foi gravado…)".

- [ ] **Step 6: Commit**

```bash
git add src/modules/projetos/nomenclatura/catalogo/service.ts src/modules/projetos/nomenclatura/catalogo/queries.ts scripts/smoke-catalogo-nomenclatura.ts package.json CLAUDE.md
git commit -m "feat(nomenclatura): gravação do catálogo segue a simulação (sinônimo, voltar com siglas) + smoke

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 6: Action em lote com transferência

**Files:**
- Modify: `src/modules/projetos/nomenclatura/catalogo/actions.ts:9` (imports) e `:94-143` (schema e `alterarCatalogoNaVersao`)

**Interfaces:**
- Consumes: `operacoesComId`, `planejarTransferencia`, `resolverLeva` (Task 2); `executarOperacoes` (Task 5).
- Produces: `alterarCatalogoNaVersao({ versao: number; operacoes: OperacaoTela[]; transferir?: boolean })` → `ActionResult<{ ok: true; transferidas: number }>`. A Task 7 chama assim.

- [ ] **Step 1: Imports**

Troque a linha `import { colisoes, simular, versoesAPartirDe, type OperacaoComId } from "./versao";` por:

```ts
import { operacoesComId, planejarTransferencia, resolverLeva, type OperacaoComId } from "./versao";
```

- [ ] **Step 2: Schema e action**

Substitua de `const operacaoSchema = …` até o fim do arquivo por:

```ts
const siglaVoltaSchema = z.object({ sigla: siglaSchema, oficial: z.boolean() });

const operacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("card-novo"), nome: nomeSchema, sigla: siglaSchema.nullable() }),
  z.object({ tipo: z.literal("sub-nova"), cardId: z.string().min(1), nome: nomeSchema, sigla: siglaSchema.nullable() }),
  z.object({ tipo: z.literal("item-novo"), categoria: z.enum(["fase", "tipo"]), nome: nomeSchema, sigla: siglaSchema }),
  z.object({ tipo: z.literal("sigla-nova"), alvo: alvoSchema, sigla: siglaSchema }),
  z.object({ tipo: z.literal("sinonimo-novo"), alvo: alvoSchema, sigla: siglaSchema }),
  // A sigla aqui só identifica a linha para a auditoria — pode ser legada (fora do formato atual).
  z.object({ tipo: z.literal("encerrar-sigla"), alvo: alvoSchema, linhaId: z.string().min(1), sigla: z.string().trim().min(1).max(20) }),
  z.object({ tipo: z.literal("sai"), alvo: alvoSchema }),
  z.object({ tipo: z.literal("entra"), alvo: alvoSchema, siglas: z.array(siglaVoltaSchema).max(20).optional() }),
]);

/**
 * Edições avulsas na tabela da versão (adicionar, siglas e sinônimos, tirar, voltar), numa
 * transação. Se uma sigla já tem dono na versão, sem `transferir` a action recusa dizendo quem é
 * e como (oficial ou sinônimo); com `transferir`, tira a sigla do outro dono a partir da versão —
 * a regra da importação ("a planilha manda"). A tela mostra o conflito antes de salvar; aqui o
 * plano é recalculado contra o banco de agora (a tela pode estar velha).
 */
export const alterarCatalogoNaVersao = defineAction(
  {
    ...base,
    acao: "alterar-catalogo-versao",
    entidade: "NomenclaturaVersao",
    schema: z.object({
      versao: z.number().int().min(1),
      operacoes: z.array(operacaoSchema).min(1).max(50),
      transferir: z.boolean().default(false),
    }),
  },
  async (i) => {
    await garantirVersao(i.versao);
    const ops = operacoesComId(i.operacoes);
    const [snap, versoes] = await Promise.all([carregarCatalogoSnap(), numerosDasVersoes()]);
    const plano = planejarTransferencia(snap, i.versao, ops, versoes);
    const leva = resolverLeva(plano, ops, i.transferir);
    if (!leva.ok) throw new ActionError(leva.erro);
    await prisma.$transaction((tx) => executarOperacoes(tx, i.versao, leva.ops), OPCOES_TX);
    rev(i.versao);
    return { ok: true, transferidas: plano.conflitos.length };
  },
);
```

(O `Promise.all` acima usa o `prisma` global, fora de transação — permitido.)

- [ ] **Step 3: Conferir tipos e lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/modules/projetos/nomenclatura
```
Expected: o `tsc` acusa **só** `catalogo-versao-view.tsx` (ainda manda `operacao` em vez de `operacoes`) — corrigido na Task 7. Nenhum outro erro. Lint limpo (rode sem `--quiet`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/projetos/nomenclatura/catalogo/actions.ts
git commit -m "feat(nomenclatura): ação do catálogo em lote, com transferência de sigla confirmada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

(O build fica quebrado só entre este commit e o da Task 7; se preferir, junte as Tasks 6 e 7 num commit só.)

---

### Task 7: Tela "Catálogo da vN" — sinônimos à vista, siglas da versão, conflito e voltar

Segue o mockup aprovado (artifact `2YtpNHYrCbRPNLDJ8mQRMR`): sinônimo com borda tracejada; aviso de conflito dentro do diálogo; botão "Tirar de X e adicionar"; "Entendi: X fica sem sigla na vN" quando a sigla é oficial do outro; "Voltar" com as siglas marcadas.

**Files:**
- Create: `src/components/configuracoes/catalogo/sigla-chips.tsx`
- Create: `src/components/configuracoes/catalogo/aviso-conflitos.tsx`
- Create: `src/components/configuracoes/catalogo/adicionar-item-dialog.tsx`
- Create: `src/components/configuracoes/catalogo/siglas-na-versao-dialog.tsx`
- Create: `src/components/configuracoes/catalogo/voltar-versao-dialog.tsx`
- Modify (reescrita): `src/components/configuracoes/catalogo-versao-view.tsx`
- Modify: `src/app/(dashboard)/configuracoes/nomenclatura/[numero]/page.tsx`

**Interfaces:**
- Consumes: `alterarCatalogoNaVersao` (Task 6); de `versao.ts`: `OperacaoTela`, `CatalogoSnap`, `AlvoCatalogo`, `PlanoTransferencia`, `planejarTransferencia`, `operacoesComId`, `mensagemConflito`, `linhasDoItemNaVersao`, `opsDasSiglas`, `siglasParaVoltar`; `normalizarSigla` (`catalogo/planilha.ts`, puro).
- Produces (a F2 reaproveita): `SiglaOficial`, `SiglaSinonimo`, `usePlanoTransferencia`, `exigeConfirmacao`, `rotuloSalvar`, `AvisoConflitos`, `AdicionarItemDialog`, `SiglasNaVersaoDialog`, `VoltarVersaoDialog`.

- [ ] **Step 1: `sigla-chips.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";

/** Sigla oficial: a que vai no nome do arquivo. Borda cheia. */
export function SiglaOficial({ sigla }: { sigla: string }) {
  return (
    <Badge variant="outline" className="font-mono">
      {sigla}
    </Badge>
  );
}

/** Sinônimo: só reconhecido no envio, nunca escrito no nome. Borda tracejada, mais apagado. */
export function SiglaSinonimo({ sigla }: { sigla: string }) {
  return (
    <Badge
      variant="outline"
      className="border-dashed font-mono font-normal text-muted-foreground"
      title="Sinônimo: reconhecido no envio, nunca escrito no nome"
    >
      {sigla}
    </Badge>
  );
}
```

- [ ] **Step 2: `aviso-conflitos.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  mensagemConflito,
  operacoesComId,
  planejarTransferencia,
  type CatalogoSnap,
  type OperacaoTela,
  type PlanoTransferencia,
} from "@/modules/projetos/nomenclatura/catalogo/versao";

/**
 * Prévia, no navegador, do que salvar `ops` faria com as siglas dos outros itens. O servidor recalcula
 * contra o banco ao gravar. Passe `ops` memorizado (`useMemo`), senão a prévia refaz a cada render.
 */
export function usePlanoTransferencia(
  snap: CatalogoSnap,
  versao: number,
  versoes: readonly number[],
  ops: readonly OperacaoTela[],
): PlanoTransferencia {
  return useMemo(() => planejarTransferencia(snap, versao, operacoesComId(ops), versoes), [snap, versao, versoes, ops]);
}

/** Pede "Entendi" antes de salvar: a transferência deixa outro item sem sigla oficial na versão. */
export function exigeConfirmacao(plano: PlanoTransferencia): boolean {
  return plano.conflitos.some((c) => c.papel === "oficial");
}

/** Rótulo do botão de salvar: "Tirar de Hidrossanitário e adicionar" quando há transferência. */
export function rotuloSalvar(plano: PlanoTransferencia, verbo: string, padrao: string): string {
  const donos = [...new Set(plano.conflitos.map((c) => c.dono))];
  if (donos.length === 0) return padrao;
  return donos.length === 1 ? `Tirar de ${donos[0]} e ${verbo}` : `Transferir e ${verbo}`;
}

/** Conflitos de sigla dentro do diálogo, antes de salvar (spec §4.5). Nada quando não há conflito. */
export function AvisoConflitos({
  plano,
  versao,
  confirmado,
  onConfirmar,
}: {
  plano: PlanoTransferencia;
  versao: number;
  confirmado: boolean;
  onConfirmar: (v: boolean) => void;
}) {
  if (plano.recusa) {
    return (
      <div role="alert" className="flex gap-2.5 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p>{plano.recusa}</p>
      </div>
    );
  }
  if (plano.conflitos.length === 0) return null;
  const anteriores = versao - 1 === 1 ? "Na v1" : `Até a v${versao - 1}`;
  const semSigla = [...new Set(plano.conflitos.filter((c) => c.papel === "oficial").map((c) => c.dono))];
  return (
    <div role="status" className="space-y-3 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm">
      {plano.conflitos.map((c) => (
        <div key={`${c.sigla}:${c.dono}`} className="flex gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <strong className="block font-semibold">{mensagemConflito(c)}</strong>
            {c.papel === "oficial"
              ? `Se passar para cá, “${c.dono}” fica sem sigla na v${versao}: os arquivos dele deixam de ser reconhecidos pela sigla até você dar uma nova. ${anteriores} nada muda.`
              : `Para usar aqui, a sigla sai de “${c.dono}” a partir da v${versao}. ${anteriores} ela continua sendo de “${c.dono}” — projetos dessas versões não mudam.`}
          </p>
        </div>
      ))}
      {semSigla.length > 0 && (
        <label className="flex items-start gap-2.5">
          <Checkbox checked={confirmado} onCheckedChange={(v) => onConfirmar(!!v)} className="mt-0.5" />
          <span>
            Entendi: {semSigla.map((d) => `“${d}”`).join(" e ")} {semSigla.length === 1 ? "fica" : "ficam"} sem sigla na v{versao}.
          </span>
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `adicionar-item-dialog.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizarSigla } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import type { CatalogoSnap, OperacaoTela } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, rotuloSalvar, usePlanoTransferencia } from "./aviso-conflitos";

/** Adicionar card, sub, fase ou tipo na versão — com o conflito de sigla mostrado antes de salvar. */
export function AdicionarItemDialog({
  titulo,
  siglaObrigatoria,
  montar,
  snap,
  versao,
  versoes,
  pending,
  onFechar,
  onSalvar,
}: {
  titulo: string;
  siglaObrigatoria: boolean;
  montar: (nome: string, sigla: string | null) => OperacaoTela;
  snap: CatalogoSnap;
  versao: number;
  versoes: readonly number[];
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacao: OperacaoTela, transferir: boolean) => void;
}) {
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const siglaNorm = sigla.trim() === "" ? null : normalizarSigla(sigla);
  const siglaInvalida = sigla.trim() !== "" && siglaNorm === null;
  const nomeLimpo = nome.trim();
  const pronto = nomeLimpo !== "" && !siglaInvalida && (!siglaObrigatoria || siglaNorm !== null);
  const ops = useMemo(() => (pronto ? [montar(nomeLimpo, siglaNorm)] : []), [pronto, montar, nomeLimpo, siglaNorm]);
  const plano = usePlanoTransferencia(snap, versao, versoes, ops);
  const podeSalvar = pronto && !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Vale a partir desta versão. A sigla é a que vai no nome dos arquivos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="adicionar-nome">Nome</Label>
              <Input id="adicionar-nome" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="w-28 space-y-1.5">
              <Label htmlFor="adicionar-sigla">Sigla{siglaObrigatoria ? "" : " (opcional)"}</Label>
              <Input
                id="adicionar-sigla"
                value={sigla}
                maxLength={6}
                className="font-mono uppercase"
                aria-invalid={siglaInvalida || undefined}
                onChange={(e) => setSigla(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          {siglaInvalida && <p className="text-xs text-destructive">Sigla de 2 a 6 letras ou números.</p>}
          <AvisoConflitos plano={plano} versao={versao} confirmado={confirmado} onConfirmar={setConfirmado} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops[0], plano.conflitos.length > 0)}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "adicionar", "Adicionar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: `siglas-na-versao-dialog.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizarSigla } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import {
  linhasDoItemNaVersao,
  opsDasSiglas,
  type AlvoCatalogo,
  type CatalogoSnap,
  type OperacaoTela,
} from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, rotuloSalvar, usePlanoTransferencia } from "./aviso-conflitos";

/** Sigla oficial e sinônimos do item NESTA versão (spec §4.4). Salvar manda tudo numa transação. */
export function SiglasNaVersaoDialog({
  snap,
  versao,
  versoes,
  alvo,
  rotulo,
  pending,
  onFechar,
  onSalvar,
}: {
  snap: CatalogoSnap;
  versao: number;
  versoes: readonly number[];
  alvo: AlvoCatalogo;
  rotulo: string;
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacoes: OperacaoTela[], transferir: boolean) => void;
}) {
  const antes = useMemo(() => linhasDoItemNaVersao(snap, alvo, versao), [snap, alvo, versao]);
  const [oficial, setOficial] = useState(antes.oficial?.sigla ?? "");
  const [sinonimos, setSinonimos] = useState<string[]>(() => antes.sinonimos.map((l) => l.sigla));
  const [novo, setNovo] = useState("");
  const [confirmado, setConfirmado] = useState(false);

  const oficialNorm = oficial.trim() === "" ? null : normalizarSigla(oficial);
  const oficialInvalida = oficial.trim() !== "" && oficialNorm === null;
  const novoNorm = normalizarSigla(novo);
  const ops = useMemo(
    () => (oficialInvalida ? [] : opsDasSiglas(alvo, antes, { oficial: oficialNorm, sinonimos })),
    [alvo, antes, oficialNorm, oficialInvalida, sinonimos],
  );
  const plano = usePlanoTransferencia(snap, versao, versoes, ops);
  const podeSalvar = ops.length > 0 && !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  function adicionar() {
    if (!novoNorm || sinonimos.includes(novoNorm) || novoNorm === oficialNorm) return;
    setSinonimos((s) => [...s, novoNorm]);
    setNovo("");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Siglas de {rotulo} na v{versao}
          </DialogTitle>
          <DialogDescription>A oficial vai no nome dos arquivos. Sinônimos são reconhecidos no envio, nunca escritos.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="w-40 space-y-1.5">
            <Label htmlFor="sigla-oficial">Oficial</Label>
            <Input
              id="sigla-oficial"
              value={oficial}
              maxLength={6}
              className="font-mono uppercase"
              aria-invalid={oficialInvalida || undefined}
              onChange={(e) => setOficial(e.target.value.toUpperCase())}
            />
            {oficialInvalida && <p className="text-xs text-destructive">Sigla de 2 a 6 letras ou números.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sinonimo-novo">Sinônimos</Label>
            <div className="flex flex-wrap items-center gap-2">
              {sinonimos.map((s) => (
                <span key={s} className="inline-flex items-center gap-0.5 rounded-sm border border-dashed pl-2.5 font-mono text-sm">
                  {s}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Remover sinônimo ${s}`}
                    onClick={() => setSinonimos((l) => l.filter((x) => x !== s))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  id="sinonimo-novo"
                  value={novo}
                  maxLength={6}
                  placeholder="Novo"
                  className="w-24 font-mono uppercase"
                  onChange={(e) => setNovo(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionar();
                    }
                  }}
                />
                <Button size="sm" variant="outline" disabled={!novoNorm} onClick={adicionar}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
          <p className="rounded-sm bg-muted/60 p-3 text-sm">
            O que mudar aqui vale a partir da v{versao}; as versões anteriores ficam como estão.
          </p>
          <AvisoConflitos plano={plano} versao={versao} confirmado={confirmado} onConfirmar={setConfirmado} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops, plano.conflitos.length > 0)}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "salvar", "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: `voltar-versao-dialog.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { siglasParaVoltar, type AlvoCatalogo, type CatalogoSnap, type OperacaoTela } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, rotuloSalvar, usePlanoTransferencia } from "./aviso-conflitos";
import { SiglaOficial, SiglaSinonimo } from "./sigla-chips";

/** "Voltar para a vN": o item volta com as siglas marcadas (E4 da spec). */
export function VoltarVersaoDialog({
  snap,
  versao,
  versoes,
  alvo,
  nome,
  pending,
  onFechar,
  onSalvar,
}: {
  snap: CatalogoSnap;
  versao: number;
  versoes: readonly number[];
  alvo: AlvoCatalogo;
  nome: string;
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacao: OperacaoTela, transferir: boolean) => void;
}) {
  const oferta = useMemo(() => siglasParaVoltar(snap, alvo, versao), [snap, alvo, versao]);
  const [marcadas, setMarcadas] = useState(() => new Set(oferta.map((s) => s.sigla)));
  const [confirmado, setConfirmado] = useState(false);
  const ops = useMemo<OperacaoTela[]>(
    () => [{ tipo: "entra", alvo, siglas: oferta.filter((s) => marcadas.has(s.sigla)) }],
    [alvo, oferta, marcadas],
  );
  const plano = usePlanoTransferencia(snap, versao, versoes, ops);
  const podeSalvar = !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  function alternar(sigla: string, marcada: boolean) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (marcada) novo.add(sigla);
      else novo.delete(sigla);
      return novo;
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Voltar {nome} para a v{versao}
          </DialogTitle>
          <DialogDescription>
            {oferta.length > 0
              ? `Estas eram as siglas de ${nome} — as marcadas voltam junto.`
              : `${nome} não tinha sigla. Volta sem sigla na v${versao}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {oferta.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="sr-only">Siglas que voltam</legend>
              {oferta.map((s) => (
                <label key={s.sigla} className="flex min-h-11 items-center gap-3 rounded-sm border px-3">
                  <Checkbox checked={marcadas.has(s.sigla)} onCheckedChange={(v) => alternar(s.sigla, !!v)} />
                  {s.oficial ? <SiglaOficial sigla={s.sigla} /> : <SiglaSinonimo sigla={s.sigla} />}
                  <span className="text-sm">{s.oficial ? "oficial" : "sinônimo"}</span>
                </label>
              ))}
            </fieldset>
          )}
          <AvisoConflitos plano={plano} versao={versao} confirmado={confirmado} onConfirmar={setConfirmado} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops[0], plano.conflitos.length > 0)}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "voltar", `Voltar para a v${versao}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

(A `fieldset` não tem ancestral rolável com `overflow` sem `relative` — o `sr-only` da `legend` não escapa; memória "sr-only escapa da rolagem".)

- [ ] **Step 6: Reescrever `catalogo-versao-view.tsx`**

Substitua o arquivo inteiro por:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleMinus, FileUp, Plus, Shapes, Tags, Undo2 } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { alterarCatalogoNaVersao } from "@/modules/projetos/nomenclatura/catalogo/actions";
import type {
  AlvoCatalogo,
  CatalogoNaVersao,
  CatalogoSnap,
  LinhaCatalogo,
  OperacaoTela,
  SaiNaVersao,
} from "@/modules/projetos/nomenclatura/catalogo/versao";
import { ImportarCatalogoDialog } from "@/components/configuracoes/importar-catalogo-dialog";
import { AdicionarItemDialog } from "@/components/configuracoes/catalogo/adicionar-item-dialog";
import { SiglasNaVersaoDialog } from "@/components/configuracoes/catalogo/siglas-na-versao-dialog";
import { VoltarVersaoDialog } from "@/components/configuracoes/catalogo/voltar-versao-dialog";
import { SiglaOficial, SiglaSinonimo } from "@/components/configuracoes/catalogo/sigla-chips";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type VersaoResumo = { numero: number; nome: string; publicada: boolean };

/** Diálogo aberto: adicionar (card, sub, fase, tipo), siglas de um item, ou voltar um item que saiu. */
type Dialogo =
  | { tipo: "adicionar"; titulo: string; siglaObrigatoria: boolean; montar: (nome: string, sigla: string | null) => OperacaoTela }
  | { tipo: "siglas"; rotulo: string; alvo: AlvoCatalogo }
  | { tipo: "voltar"; nome: string; alvo: AlvoCatalogo };

const ESTRUTURA: Record<AlvoCatalogo["tipo"], string> = { disciplina: "CARD", subdisciplina: "SUB", prancha: "" };

export function CatalogoVersaoView({
  versao,
  versoes,
  catalogo,
  snap,
}: {
  versao: VersaoResumo & { projetosFixados: number };
  versoes: VersaoResumo[];
  catalogo: CatalogoNaVersao;
  /** Catálogo inteiro, para a prévia de conflito de sigla no navegador (o servidor recalcula). */
  snap: CatalogoSnap;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [importando, setImportando] = useState(false);
  const v = versao.numero;
  // Memorizado: entra nas dependências da prévia de conflito dos diálogos.
  const numeros = useMemo(() => versoes.map((x) => x.numero), [versoes]);
  const totalSubs = catalogo.cards.reduce((n, c) => n + c.subs.length, 0);

  function executar(operacoes: OperacaoTela[], transferir: boolean, sucesso: string) {
    start(async () => {
      const r = await alterarCatalogoNaVersao({ versao: v, operacoes, transferir });
      if (r.ok) {
        toast.success(r.data.transferidas > 0 ? `${sucesso} A sigla saiu do outro item a partir da v${v}.` : sucesso);
        setDialogo(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function tirar(linha: LinhaCatalogo) {
    const ok = await confirm({
      title: `Tirar “${linha.nome}” da v${v}?`,
      description:
        `Deixa de existir a partir da v${v} e segue valendo nas versões anteriores (se foi criado na própria v${v}, é excluído). ` +
        "Projetos que já o usam não mudam.",
      confirmLabel: "Tirar da versão",
    });
    if (!ok) return;
    executar([{ tipo: "sai", alvo: linha.alvo }], false, `“${linha.nome}” saiu da v${v}.`);
  }

  const acoesLinha = {
    pending,
    versao: v,
    onSiglas: (l: LinhaCatalogo) => setDialogo({ tipo: "siglas", rotulo: l.nome, alvo: l.alvo }),
    onTirar: (l: LinhaCatalogo) => void tirar(l),
  };

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo={`Catálogo da v${v}`}
        descricao="Disciplinas, sub-disciplinas, fases e tipos desta versão do padrão, como na planilha."
        trilha={[
          { href: "/", label: "Início" },
          { href: "/configuracoes", label: "Configurações" },
          { href: "/configuracoes/nomenclatura", label: "Nomenclatura" },
        ]}
        acoes={
          <>
            <Button size="sm" onClick={() => setImportando(true)} disabled={pending}>
              <FileUp className="size-4" /> Importar planilha
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                setDialogo({
                  tipo: "adicionar",
                  titulo: `Nova disciplina (card) na v${v}`,
                  siglaObrigatoria: false,
                  montar: (nome, sigla) => ({ tipo: "card-novo", nome, sigla }),
                })
              }
            >
              <Plus className="size-4" /> Disciplina
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Versão:</span>
        {versoes.map((x) => (
          <Button
            key={x.numero}
            size="xs"
            variant={x.numero === v ? "secondary" : "outline"}
            aria-current={x.numero === v ? "page" : undefined}
            render={<Link href={`/configuracoes/nomenclatura/${x.numero}`} />}
          >
            v{x.numero}
            {!x.publicada && <span className="text-muted-foreground"> (rascunho)</span>}
          </Button>
        ))}
      </div>

      <p className="rounded-sm border bg-muted/40 p-3 text-sm">
        {versao.publicada ? (
          <>
            A <strong>v{v} — {versao.nome}</strong> está publicada
            {versao.projetosFixados > 0 ? ` e ${versao.projetosFixados} projeto(s) seguem ela` : ""}: o que mudar aqui vale
            para esses projetos também. Uma mudança que não deve afetá-los vai numa versão nova, criada em{" "}
            <Link href="/configuracoes/nomenclatura" className="text-primary hover:underline">
              Nomenclatura
            </Link>
            .
          </>
        ) : (
          <>
            A <strong>v{v} — {versao.nome}</strong> é rascunho: nada daqui vale para projeto nenhum até ela ser publicada em{" "}
            <Link href="/configuracoes/nomenclatura" className="text-primary hover:underline">
              Nomenclatura
            </Link>
            .
          </>
        )}
      </p>

      <p className="text-sm text-muted-foreground">
        {catalogo.cards.length} disciplina(s) · {totalSubs} sub-disciplina(s) · {catalogo.fases.length} fase(s) ·{" "}
        {catalogo.tipos.length} tipo(s)
        {v > 1 &&
          ` — em relação à v${v - 1}: ${catalogo.resumo.entram} entram, ${catalogo.resumo.saem} saem, ${catalogo.resumo.siglasNovas} sigla(s) nova(s).`}
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Disciplinas</CardTitle>
          <p className="text-xs text-muted-foreground">
            CARD abre disciplina no projeto (projetista, prazo, pagamento). SUB é só etiqueta do documento, lida do nome do
            arquivo, dentro do card.
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <SiglaOficial sigla="HID" /> oficial, vai no nome
            <span className="ml-2" />
            <SiglaSinonimo sigla="HDR" /> sinônimo, só reconhecido
          </p>
        </CardHeader>
        <CardContent>
          {catalogo.cards.length === 0 ? (
            <EmptyState icon={Shapes} title={`Nenhuma disciplina na v${v}`} description="Importe a planilha ou adicione uma disciplina." />
          ) : (
            <ul className="divide-y">
              {catalogo.cards.map((c) => (
                <li key={c.alvo.id} className="py-1">
                  <LinhaItem
                    linha={c}
                    {...acoesLinha}
                    onAdicionarSub={() =>
                      setDialogo({
                        tipo: "adicionar",
                        titulo: `Nova sub-disciplina em ${c.nome} (v${v})`,
                        siglaObrigatoria: false,
                        montar: (nome, sigla) => ({ tipo: "sub-nova", cardId: c.alvo.id, nome, sigla }),
                      })
                    }
                  />
                  {c.subs.length > 0 && (
                    <ul className="ml-3 border-l pl-3 sm:ml-5">
                      {c.subs.map((s) => (
                        <li key={s.alvo.id}>
                          <LinhaItem linha={s} {...acoesLinha} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["fase", "tipo"] as const).map((categoria) => {
          const lista = categoria === "fase" ? catalogo.fases : catalogo.tipos;
          return (
            <Card key={categoria}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{categoria === "fase" ? "Fases" : "Tipos de documento"}</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    setDialogo({
                      tipo: "adicionar",
                      titulo: `Nov${categoria === "fase" ? "a fase" : "o tipo"} na v${v}`,
                      siglaObrigatoria: true,
                      montar: (nome, sigla) => ({ tipo: "item-novo", categoria, nome, sigla: sigla ?? "" }),
                    })
                  }
                >
                  <Plus className="size-4" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent>
                {lista.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item nesta versão.</p>
                ) : (
                  <ul className="divide-y">
                    {lista.map((l) => (
                      <li key={l.alvo.id}>
                        <LinhaItem linha={l} {...acoesLinha} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {catalogo.saem.length > 0 && (
        <CollapsibleSection
          titulo={`Saem na v${v}`}
          descricao={`Existiam na v${v - 1} e não existem nesta. Continuam valendo nas versões anteriores.`}
          resumo={<Badge variant="outline">{catalogo.saem.length}</Badge>}
          defaultOpen
        >
          <ul className="divide-y">
            {catalogo.saem.map((l) => (
              <li key={l.alvo.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {l.nome} <span className="text-xs text-muted-foreground">· {l.tipoRotulo}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {l.sigla && <SiglaOficial sigla={l.sigla} />}
                  {l.sinonimos.map((s) => (
                    <SiglaSinonimo key={s} sigla={s} />
                  ))}
                </span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialogo({ tipo: "voltar", nome: l.nome, alvo: l.alvo })}>
                  <Undo2 className="size-3.5" /> Voltar para a v{v}
                </Button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {dialogo?.tipo === "adicionar" && (
        <AdicionarItemDialog
          titulo={dialogo.titulo}
          siglaObrigatoria={dialogo.siglaObrigatoria}
          montar={dialogo.montar}
          snap={snap}
          versao={v}
          versoes={numeros}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(op, transferir) => executar([op], transferir, `Adicionado à v${v}.`)}
        />
      )}
      {dialogo?.tipo === "siglas" && (
        <SiglasNaVersaoDialog
          snap={snap}
          versao={v}
          versoes={numeros}
          alvo={dialogo.alvo}
          rotulo={dialogo.rotulo}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(ops, transferir) => executar(ops, transferir, `Siglas de “${dialogo.rotulo}” na v${v} salvas.`)}
        />
      )}
      {dialogo?.tipo === "voltar" && (
        <VoltarVersaoDialog
          snap={snap}
          versao={v}
          versoes={numeros}
          alvo={dialogo.alvo}
          nome={dialogo.nome}
          pending={pending}
          onFechar={() => setDialogo(null)}
          onSalvar={(op, transferir) => executar([op], transferir, `“${dialogo.nome}” voltou para a v${v}.`)}
        />
      )}
      <ImportarCatalogoDialog aberto={importando} versao={v} onFechar={() => setImportando(false)} />
    </div>
  );
}

function SituacaoBadge({ linha, versao }: { linha: LinhaCatalogo; versao: number }) {
  if (linha.situacao === "entra") return <Badge variant="secondary" className="text-[10px]">novo na v{versao}</Badge>;
  if (linha.situacao === "sigla-nova") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        sigla nova{linha.siglaAnterior ? ` (era ${linha.siglaAnterior})` : ""}
      </Badge>
    );
  }
  return null;
}

function LinhaItem({
  linha,
  versao,
  pending,
  onSiglas,
  onTirar,
  onAdicionarSub,
}: {
  linha: LinhaCatalogo;
  versao: number;
  pending: boolean;
  onSiglas: (l: LinhaCatalogo) => void;
  onTirar: (l: LinhaCatalogo) => void;
  onAdicionarSub?: () => void;
}) {
  const estrutura = ESTRUTURA[linha.alvo.tipo];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm", linha.alvo.tipo === "disciplina" && "font-medium")}>
      <span className="min-w-0 flex-1 break-words">{linha.nome}</span>
      {estrutura && <span className="w-9 text-[10px] font-semibold tracking-wide text-muted-foreground">{estrutura}</span>}
      <span className="flex flex-wrap items-center gap-1.5">
        {linha.sigla ? <SiglaOficial sigla={linha.sigla} /> : <span className="text-xs font-normal text-muted-foreground">sem sigla</span>}
        {linha.sinonimos.map((s) => (
          <SiglaSinonimo key={s} sigla={s} />
        ))}
      </span>
      <SituacaoBadge linha={linha} versao={versao} />
      <span className="flex items-center">
        {onAdicionarSub && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Adicionar sub-disciplina em ${linha.nome}`}
            title="Adicionar sub-disciplina"
            disabled={pending}
            onClick={onAdicionarSub}
          >
            <Plus className="size-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Siglas de ${linha.nome} na v${versao}`}
          title="Siglas nesta versão"
          disabled={pending}
          onClick={() => onSiglas(linha)}
        >
          <Tags className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Tirar ${linha.nome} da v${versao}`}
          title={`Tirar da v${versao}`}
          disabled={pending}
          onClick={() => onTirar(linha)}
        >
          <CircleMinus className="size-4" />
        </Button>
      </span>
    </div>
  );
}
```

(`LinhaItem` e `SituacaoBadge` ficam no nível do arquivo — ADR-0002: componente de linha não pode ser definido dentro do pai.)

- [ ] **Step 7: Página entrega o `snap`**

Em `src/app/(dashboard)/configuracoes/nomenclatura/[numero]/page.tsx`, acrescente a prop no `CatalogoVersaoView`:

```tsx
      catalogo={catalogoNaVersao(snap, n)}
      snap={snap}
```

- [ ] **Step 8: Tipos, lint, testes**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/configuracoes src/modules/projetos/nomenclatura "src/app/(dashboard)/configuracoes/nomenclatura"
npm test
```
Expected: `tsc` sem erros; lint limpo (sem `--quiet` — um setter sem uso é sinal de UI faltando); `npm test` PASS (inclui os testes-guarda: `contextmenu`, `confirm` antes de `startTransition`, `Promise.all` em transação).

- [ ] **Step 9: Conferir na tela (dev do worktree, porta 3002)**

`npm run dev -- -p 3002`, entrar com o admin de teste do dev (memória "Admin de teste no dev"), abrir `/configuracoes/nomenclatura/2` e conferir **contra o mockup**:

1. Hidrossanitário mostra `HID` com borda cheia e `HDR`/`ESG` tracejados (se o dev tiver esses sinônimos).
2. "+" em Hidrossanitário → nome "Esgoto", sigla "ESG": aparece o aviso "ESG é sinônimo de “Hidrossanitário” na v2." e o botão vira **"Tirar de Hidrossanitário e adicionar"**. Salvar → toast; a sub aparece com ESG; `HDR` continua no card; abrindo a v1, `ESG` continua no card.
3. "+" em Estrutural → sigla `EST`: aviso de sigla oficial e o botão só libera depois de marcar **"Entendi: “Estrutural” fica sem sigla na v2."** (Cancelar — não grave isso no dev.)
4. Ícone de etiqueta numa linha → "Siglas de … na v2": adicionar e remover um sinônimo, salvar, conferir a linha.
5. "Tirar da v2" num card qualquer → aparece em "Saem na v2" com as siglas → "Voltar para a v2" lista as siglas marcadas; desmarcar o sinônimo e voltar → só a oficial volta.
6. Em 390×844, `document.documentElement.scrollWidth` é 390 com cada diálogo aberto.

Esperar o POST da Server Action terminar antes de recarregar (memória "next dev: fila de Server Actions"). Desfaça no dev o que foi gravado nos passos 2, 4 e 5 (tirar a sub Esgoto criada na v2 a exclui, porque nasceu nela).

- [ ] **Step 10: Commit**

```bash
git add src/components/configuracoes/catalogo/sigla-chips.tsx src/components/configuracoes/catalogo/aviso-conflitos.tsx src/components/configuracoes/catalogo/adicionar-item-dialog.tsx src/components/configuracoes/catalogo/siglas-na-versao-dialog.tsx src/components/configuracoes/catalogo/voltar-versao-dialog.tsx src/components/configuracoes/catalogo-versao-view.tsx "src/app/(dashboard)/configuracoes/nomenclatura/[numero]/page.tsx"
git commit -m "feat(nomenclatura): catálogo da versão mostra sinônimos, edita siglas e transfere sigla com aviso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 8: Manual

**Files:**
- Modify: `docs/manual/sistema/configuracoes.md` (frontmatter `palavras-chave`; parágrafo "Ajustes avulsos" ≈113-116; bullets "Pelas telas de catálogo" ≈118-130)
- Modify: `docs/manual/novidades.md` (seção nova no topo)
- Modify: `docs/manual/search-index.json` (entrada `sistema/configuracoes.md`, array `palavrasChave`)

- [ ] **Step 1: `configuracoes.md`**

No frontmatter, acrescente ao fim de `palavras-chave`: `, sinônimo de sigla, transferir sigla`.

Substitua o parágrafo que começa com `**Ajustes avulsos**, no mesmo catálogo:` (até "o sistema diz quem é.") por:

```markdown
**Ajustes avulsos**, no mesmo catálogo: **+ Disciplina**, **+** numa linha de card (nova
sub-disciplina), **Siglas nesta versão** (ícone de etiqueta: a sigla oficial e os sinônimos do
item nesta versão; o que mudar vale desta versão em diante e as anteriores ficam como estão) e
**Tirar da versão**. Na lista, a sigla oficial tem borda cheia e os **sinônimos**, borda tracejada.

Se a sigla que você digitou já tem dono na versão, o diálogo mostra **de quem** e se ela é a
**oficial** ou um **sinônimo** dele, antes de salvar. **Tirar de … e adicionar** (ou **salvar**)
passa a sigla para cá a partir desta versão; nas anteriores ela continua com o dono antigo. Quando
ela é a sigla oficial do outro item, marque **Entendi**: ele fica sem sigla nesta versão até você
dar outra.

**Voltar para a versão** (na lista "Saem") mostra as siglas que o item tinha; só as marcadas
voltam com ele.
```

No bullet que começa com `- cada disciplina, sub-disciplina e item da Lista Mestre tem **"Vale a partir da / Até a"**;`, acrescente ao fim do bullet:

```markdown
  mudar só essa validade **não mexe nas siglas** — se o item sair ("Até a v1") e voltar ("Sem
  fim"), as siglas voltam como eram;
```

- [ ] **Step 2: `novidades.md`**

Logo depois da linha `---` que fecha a introdução (antes de `## Reunião de 29/09: …`), insira:

```markdown
## Nomenclatura: sinônimos à vista e sigla que muda de dono

- No **Catálogo da versão**, os **sinônimos** aparecem na linha (borda tracejada), não só ao passar o mouse.
- **Siglas nesta versão** (ícone de etiqueta) troca a sigla oficial e põe ou tira sinônimos, valendo desta versão em diante.
- Sigla que já é de outro item: o diálogo diz de quem e se é oficial ou sinônimo, e **Tirar de … e adicionar** resolve ali mesmo — as versões anteriores não mudam.
- Mudar a validade de uma disciplina ("Até a vN") **não apaga mais as siglas dela**: se ela voltar, as siglas voltam junto. **Voltar para a versão** mostra quais siglas voltam.

---
```

- [ ] **Step 3: `search-index.json`**

Na entrada com `"path": "sistema/configuracoes.md"`, no array `"palavrasChave"`, acrescente como primeiros itens:

```json
        "sinônimo de sigla",
        "transferir sigla",
```

Confira que o JSON continua válido:

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/manual/search-index.json','utf8')); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add docs/manual/sistema/configuracoes.md docs/manual/novidades.md docs/manual/search-index.json
git commit -m "docs(manual): siglas e sinônimos por versão no catálogo, transferência de sigla

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 9: Verificação final da fase

- [ ] **Step 1: Tudo verde**

Pare o `next dev` do worktree antes do build.

```bash
npm run lint
npm test
npm run smoke:catalogo-nomenclatura
npm run build
```
Expected: lint sem erro; testes PASS; smoke "Tudo certo"; build conclui.

- [ ] **Step 2: Revisão por agentes**

Rode, sobre `git diff refs/heads/dev-vscode...HEAD`, os revisores do repositório: `action-guardian` (actions.ts), `client-boundary-auditor` (componentes novos), `a11y-auditor` (diálogos), `i18n-convention-reviewer`. Corrija o que for real; anote o que for descartado e por quê.

- [ ] **Step 3: Entregar ao dono**

Resumo em pt-BR: o que mudou na tela, o que ele precisa conferir em navegador (os 6 itens da Task 7 Step 9), e que a branch `feat/catalogo-unificado` está pronta para virar PR para `dev` (não fazer push/PR sem o OK dele). Avisar que, **em produção**, esta fase não precisa de script nem de migração; o dado de prod com linhas truncadas pelo espelho antigo se resolve pelo "Voltar" (E4).
