# Melhorias M0 — Bugs e Correções — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os bugs reais da Onda M0 do roadmap de melhorias, descartando os "bugs" que a análise reportou mas que já estão corretos no código.

**Architecture:** Mudanças cirúrgicas no código existente. A lógica nova testável é extraída para módulos-folha puros (sem `server-only`/sessão/prisma no caminho de import do teste), seguindo o padrão do repo: testes de lógica pura via `vitest` (node), UI/socket/página verificados rodando o app + `tsc`. Sem React Testing Library, sem e2e de componente, sem novas dependências.

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript · Prisma 7 (`@/generated/prisma/client`) · Socket.io · vitest · sonner · shadcn-on-base-ui.

## Global Constraints

- Manter a arquitetura fixa: Server Actions + Zod no `defineAction`; leitura via Server Components + LRU. **Não** introduzir react-hook-form nem SWR.
- Código e identificadores em inglês; toda string de UI em português (pt-BR); commits semânticos em pt-BR.
- Auditoria obrigatória em mutações continua via `defineAction` — não burlar.
- Prisma sempre de `@/generated/prisma/client`, nunca de `@prisma/client`.
- shadcn é base-ui: triggers usam `render={<Comp/>}`, **não** `asChild`.
- Testes automatizados só para **lógica pura**. UI/socket/página: implementar + `npx tsc --noEmit` + verificação manual rodando `npm run dev:server`.
- Rodar a suíte com `npm test` (vitest run). Teste único: `npx vitest run <arquivo>`.

---

### Task 1: Auditoria — classificar `ActionError` como `rejeitado`

Hoje, qualquer `throw new ActionError(...)` (rejeição de regra de negócio, ex.: "Nenhum pagamento liberado no mês fora de lote.") é auditado como `resultado: "falha"`, gerando alarme falso no `/auditoria` (as "3 falhas" do `gerar-folha-lote`). Vamos separar **rejeição de negócio** (`rejeitado`) de **falha de sistema** (`falha`) em todo o app, na origem (`defineAction`).

A lógica de classificação e a classe `ActionError` vão para um módulo-folha puro (`src/lib/action-error.ts`), para o teste não arrastar o grafo pesado de imports de `with-action.ts` (`session` → `next/headers`/`auth`). `with-action.ts` reexporta `ActionError` para não quebrar os imports existentes (`import { ActionError } from "@/lib/with-action"`).

**Files:**
- Create: `src/lib/action-error.ts`
- Create: `src/lib/action-error.test.ts`
- Modify: `src/lib/with-action.ts:147-148` (remover def local de `ActionError`), `:119-125` (usar `resultadoDoErro` no catch), `:129-145` (tipo do `maybeAudit`)
- Modify: `src/lib/audit.ts:36` (tipo `resultado`)
- Modify: `src/components/auditoria/auditoria-tabela.tsx:38-41` (mapa de cor), `:104-106` (filtro)

**Interfaces:**
- Produces:
  - `class ActionError extends Error`
  - `resultadoDoErro(err: unknown): "falha" | "rejeitado"`
- Consumes: nada de tarefas anteriores.

- [ ] **Step 1: Write the failing test**

Create `src/lib/action-error.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ActionError, resultadoDoErro } from "@/lib/action-error";

describe("resultadoDoErro", () => {
  it("classifica ActionError como 'rejeitado'", () => {
    expect(resultadoDoErro(new ActionError("lote vazio"))).toBe("rejeitado");
  });

  it("classifica Error genérico como 'falha'", () => {
    expect(resultadoDoErro(new Error("boom"))).toBe("falha");
  });

  it("classifica valor não-Error como 'falha'", () => {
    expect(resultadoDoErro("oops")).toBe("falha");
    expect(resultadoDoErro(undefined)).toBe("falha");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/action-error.test.ts`
Expected: FAIL — `Cannot find module '@/lib/action-error'`.

- [ ] **Step 3: Create the leaf module**

Create `src/lib/action-error.ts`:

```ts
/** Erro de negócio cuja mensagem pode ser exibida ao usuário. */
export class ActionError extends Error {}

/**
 * Classifica um erro lançado por uma action para fins de auditoria:
 * rejeição de regra de negócio (`ActionError`) vs. falha de sistema.
 */
export function resultadoDoErro(err: unknown): "falha" | "rejeitado" {
  return err instanceof ActionError ? "rejeitado" : "falha";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/action-error.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewire `with-action.ts` to use the leaf module**

In `src/lib/with-action.ts`:

Replace the import block top (after the existing imports) — change line 6 area. Current line 6 is `import type { Role } from "@/lib/roles";`. Add below it:

```ts
import { ActionError, resultadoDoErro } from "@/lib/action-error";
```

Remove the local class definition at the bottom (currently lines 147-148):

```ts
/** Erro de negócio cuja mensagem pode ser exibida ao usuário. */
export class ActionError extends Error {}
```

…and replace it with a re-export so existing consumers keep working:

```ts
export { ActionError } from "@/lib/action-error";
```

In the `catch` (currently lines 119-125), replace:

```ts
    } catch (err) {
      console.error(`[action:${config.modulo}/${config.acao}]`, err);
      await maybeAudit(config, { user, ip }, "falha", err);
      const message =
        err instanceof ActionError ? err.message : "Erro ao processar a solicitação.";
      return { ok: false, error: message };
    }
```

with:

```ts
    } catch (err) {
      const resultado = resultadoDoErro(err);
      if (resultado === "falha") {
        console.error(`[action:${config.modulo}/${config.acao}]`, err);
      }
      await maybeAudit(config, { user, ip }, resultado, err);
      const message =
        err instanceof ActionError ? err.message : "Erro ao processar a solicitação.";
      return { ok: false, error: message };
    }
```

Update `maybeAudit` signature (currently line 129-134) to accept the new value:

```ts
async function maybeAudit<S>(
  config: ActionConfig<S>,
  ctx: ActionContext,
  resultado: "falha" | "bloqueado" | "rejeitado",
  err?: unknown,
) {
```

- [ ] **Step 6: Widen the `resultado` type in `audit.ts`**

In `src/lib/audit.ts:36`, change:

```ts
  resultado?: "sucesso" | "falha" | "bloqueado";
```

to:

```ts
  resultado?: "sucesso" | "falha" | "bloqueado" | "rejeitado";
```

- [ ] **Step 7: Surface `rejeitado` in the audit viewer**

In `src/components/auditoria/auditoria-tabela.tsx`, add to the color map (after line 40 `bloqueado: ...`):

```ts
  rejeitado: "bg-warning/10 text-warning border-warning/40",
```

And add a filter option after the `bloqueado` SelectItem (line 106):

```tsx
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
```

- [ ] **Step 8: Verify the whole suite + types still pass**

Run: `npm test`
Expected: all tests pass (existing + 3 new).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/action-error.ts src/lib/action-error.test.ts src/lib/with-action.ts src/lib/audit.ts src/components/auditoria/auditoria-tabela.tsx
git commit -m "fix(auditoria): classifica ActionError como 'rejeitado', não 'falha'"
```

---

### Task 2: Dashboard — "Previsto" original nos meses passados

Bug §2.4: na série "Receita — 6 meses", meses passados mostram Previsto R$ 0. Causa: a query de previstos filtra `status: "previsto"`, então lançamentos que já viraram `confirmado` somem do previsto. Correção: "previsto original" = **toda** receita com `vencimento` no mês (independente de status), agregada pelo mês de vencimento. Realizado continua = confirmados pela `dataConfirmacao`.

A lógica de distribuição em buckets vai para um módulo-folha puro e testável.

**Files:**
- Create: `src/modules/dashboard/serie-receita.ts`
- Create: `src/modules/dashboard/serie-receita.test.ts`
- Modify: `src/modules/dashboard/queries.ts:108-148` (`serieReceita`)

**Interfaces:**
- Produces:
  - `type ItemSerie = { valor: number; data: Date }`
  - `type BucketReceita = { ano: number; mes: number; rotulo: string; realizado: number; previsto: number }`
  - `montarSerieReceita(confirmados: ItemSerie[], previstos: ItemSerie[], ref: Date, meses?: number): BucketReceita[]`
- Consumes: nada.

- [ ] **Step 1: Write the failing test**

Create `src/modules/dashboard/serie-receita.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarSerieReceita } from "@/modules/dashboard/serie-receita";

// ref fixa: junho/2026 (mês index 5)
const REF = new Date(2026, 5, 15);

describe("montarSerieReceita", () => {
  it("gera um bucket por mês, do mais antigo ao mês de referência", () => {
    const buckets = montarSerieReceita([], [], REF, 6);
    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toMatchObject({ ano: 2026, mes: 0 }); // jan
    expect(buckets[5]).toMatchObject({ ano: 2026, mes: 5 }); // jun
  });

  it("soma realizado pelo mês da data de confirmação", () => {
    const buckets = montarSerieReceita(
      [{ valor: 1000, data: new Date(2026, 2, 10) }], // mar
      [],
      REF,
      6,
    );
    expect(buckets[2].realizado).toBe(1000);
    expect(buckets[5].realizado).toBe(0);
  });

  it("soma previsto pelo mês de vencimento, mesmo em meses passados (previsto original)", () => {
    const buckets = montarSerieReceita(
      [{ valor: 800, data: new Date(2026, 1, 20) }],  // realizado fev
      [{ valor: 800, data: new Date(2026, 1, 5) }],   // a mesma receita, prevista p/ fev
      REF,
      6,
    );
    expect(buckets[1].realizado).toBe(800);
    expect(buckets[1].previsto).toBe(800); // antes do fix isto era 0
  });

  it("ignora datas fora da janela", () => {
    const buckets = montarSerieReceita(
      [{ valor: 500, data: new Date(2025, 11, 31) }], // dez/2025, fora
      [],
      REF,
      6,
    );
    expect(buckets.every((b) => b.realizado === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/dashboard/serie-receita.test.ts`
Expected: FAIL — `Cannot find module '@/modules/dashboard/serie-receita'`.

- [ ] **Step 3: Create the pure helper**

Create `src/modules/dashboard/serie-receita.ts`:

```ts
export type ItemSerie = { valor: number; data: Date };
export type BucketReceita = {
  ano: number;
  mes: number;
  rotulo: string;
  realizado: number;
  previsto: number;
};

/**
 * Distribui receita realizada e prevista em buckets mensais.
 * `confirmados` traz {valor efetivo, dataConfirmacao}; `previstos` traz
 * {valor, vencimento} de TODA receita do período (previsto original).
 */
export function montarSerieReceita(
  confirmados: ItemSerie[],
  previstos: ItemSerie[],
  ref: Date,
  meses = 6,
): BucketReceita[] {
  const buckets: BucketReceita[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - (meses - 1) + i, 1);
    buckets.push({
      ano: d.getFullYear(),
      mes: d.getMonth(),
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      realizado: 0,
      previsto: 0,
    });
  }
  const idx = (ano: number, mes: number) =>
    buckets.findIndex((b) => b.ano === ano && b.mes === mes);

  for (const l of confirmados) {
    const i = idx(l.data.getFullYear(), l.data.getMonth());
    if (i >= 0) buckets[i].realizado += l.valor;
  }
  for (const l of previstos) {
    const i = idx(l.data.getFullYear(), l.data.getMonth());
    if (i >= 0) buckets[i].previsto += l.valor;
  }
  return buckets;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/dashboard/serie-receita.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewire `serieReceita` to use the helper and the corrected query**

In `src/modules/dashboard/queries.ts`, replace the whole `serieReceita` function (lines 108-148) with:

```ts
/** Série de 6 meses: receita realizada (caixa) vs prevista original (por vencimento). */
export async function serieReceita(meses = 6) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

  const [confirmados, previstos] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "confirmado", dataConfirmacao: { gte: inicio, lte: fim } },
      select: { valor: true, valorEfetivo: true, dataConfirmacao: true },
    }),
    // Previsto ORIGINAL: toda receita com vencimento no período, independente do status.
    prisma.lancamento.findMany({
      where: { tipo: "receita", vencimento: { gte: inicio, lte: fim } },
      select: { valor: true, vencimento: true },
    }),
  ]);

  return montarSerieReceita(
    confirmados.map((l) => ({ valor: Number(l.valorEfetivo ?? l.valor), data: l.dataConfirmacao! })),
    previstos.map((l) => ({ valor: Number(l.valor), data: l.vencimento! })),
    hoje,
    meses,
  );
}
```

Add the import near the top of `queries.ts` (with the other imports):

```ts
import { montarSerieReceita } from "@/modules/dashboard/serie-receita";
```

- [ ] **Step 6: Verify suite + types**

Run: `npm test`
Expected: all pass.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `npm run dev:server`, open `/` as admin. In "Receita — 6 meses", confirm meses passados com receita confirmada agora mostram Previsto > 0 (não mais R$ 0).

- [ ] **Step 8: Commit**

```bash
git add src/modules/dashboard/serie-receita.ts src/modules/dashboard/serie-receita.test.ts src/modules/dashboard/queries.ts
git commit -m "fix(dashboard): previsto original por vencimento na série de receita"
```

---

### Task 3: Chat — snapshot inicial de presença

Bug §3.8: "Ninguém online" mesmo com usuários logados. Causa: o set `online` no client só é populado por eventos `presenca` recebidos **após** conectar — não há estado inicial de quem já estava online. O servidor já mantém o mapa de presença e expõe `usuariosOnline()`. Vamos emitir a lista atual ao socket que acaba de conectar e o client inicializa o set com ela. (O carregamento de histórico ao abrir canal **já funciona** — `chat-view.tsx:161` — não mexer.)

**Files:**
- Modify: `src/lib/socket.ts:39-45` (emitir `presenca-inicial` na conexão)
- Modify: `src/components/chat/chat-view.tsx:191-216` (listener `presenca-inicial`)

**Interfaces:**
- Produces: evento socket `"presenca-inicial"` com payload `string[]` (userIds online, inclui o próprio).
- Consumes: `usuariosOnline()` de `src/lib/socket.ts` (já existe: `() => string[]`).

- [ ] **Step 1: Emit current presence to the connecting socket**

In `src/lib/socket.ts`, dentro de `io.on("connection", ...)`, logo após `socket.join(\`user:${userId}\`);` (linha 45), adicionar:

```ts
    // Snapshot de quem já está online (inclui o próprio, já inserido acima).
    socket.emit("presenca-inicial", usuariosOnline());
```

(`usuariosOnline()` já está definido e exportado no mesmo arquivo — só chamar.)

- [ ] **Step 2: Initialize the client set from the snapshot**

In `src/components/chat/chat-view.tsx`, no `useEffect` do socket (o que registra `onPresenca`, linhas ~174-223), adicionar um handler e registrá-lo/desregistrá-lo junto dos outros. Após a função `onPresenca` (linha 198), adicionar:

```ts
    function onPresencaInicial(ids: string[]) {
      setOnline(new Set(ids));
    }
```

Registrar após `s.on("presenca", onPresenca);` (linha 214):

```ts
    s.on("presenca-inicial", onPresencaInicial);
```

E no cleanup, após `s.off("presenca", onPresenca);` (linha 219):

```ts
    s.off("presenca-inicial", onPresencaInicial);
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (needs the full server)**

Run `npm run dev:server` (Socket.io só roda aqui, não no `npm run dev`). Logar como dois usuários em dois navegadores/perfis. Abrir `/chat`. Confirmar que cada um vê o outro em "Online (n)" imediatamente ao abrir — não só depois que o outro reconecta.

- [ ] **Step 5: Commit**

```bash
git add src/lib/socket.ts src/components/chat/chat-view.tsx
git commit -m "fix(chat): snapshot inicial de presença ao conectar"
```

---

### Task 4: Página 404 personalizada

Bug §2.2: `/clientes/[id]` inválido já chama `notFound()` (`clientes/[id]/page.tsx:2,30`), mas não existe `not-found.tsx` — cai no 404 cru do Next. Criar um 404 com a marca + link de volta. Vale para todo o app (App Router usa o `not-found.tsx` mais próximo / o global em `app/`).

**Files:**
- Create: `src/app/not-found.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`), `next/link`. Sem dependências de tarefas anteriores.

- [ ] **Step 1: Create the not-found page**

Create `src/app/not-found.tsx`:

```tsx
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <FileQuestion className="size-12 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço acessado não existe ou o registro foi removido.
        </p>
      </div>
      <Button render={<Link href="/">Voltar ao início</Link>} />
    </div>
  );
}
```

> Nota base-ui: `Button` usa `render={<Link/>}`, **não** `asChild`. Se o `Button` do projeto não aceitar `render` com filho texto, usar `<Button asChild>` apenas se o componente local seguir esse contrato — confira `src/components/ui/button.tsx` antes e siga o padrão já usado em outras páginas (ex.: `clientes/[id]/page.tsx` usa `<Button>` com `<Link>`).

- [ ] **Step 2: Verify types + manual check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run `npm run dev`, acessar `/clientes/id-invalido-xyz` e uma rota inexistente `/rota-que-nao-existe`. Confirmar o 404 com a marca + botão "Voltar ao início".

- [ ] **Step 3: Commit**

```bash
git add src/app/not-found.tsx
git commit -m "feat(app): página 404 personalizada"
```

---

### Task 5: Remover texto de roadmap interno da UI

Bug §3.4: o detalhe do cliente exibe "Integra com o Financeiro na Onda 2." — texto de roadmap interno vazando para o usuário final.

**Files:**
- Modify: `src/app/(dashboard)/clientes/[id]/page.tsx:110-112`

**Interfaces:** nenhuma.

- [ ] **Step 1: Remove the roadmap note**

In `src/app/(dashboard)/clientes/[id]/page.tsx`, remover o parágrafo (linhas 110-112):

```tsx
            <p className="pt-2 text-xs text-muted-foreground">
              Integra com o Financeiro na Onda 2.
            </p>
```

- [ ] **Step 2: Verify types + manual check**

Run: `npx tsc --noEmit`
Expected: no errors.

Abrir um cliente em `/clientes/<id>` e confirmar que o resumo financeiro não mostra mais o texto.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/clientes/[id]/page.tsx"
git commit -m "fix(clientes): remove texto de roadmap interno do detalhe"
```

---

### Task 6: Reproduzir (e fechar) funcionários e timer de ponto

Bugs §2.1 e §3.9 não se reproduzem por inspeção — o código parece correto:
- `/rh/funcionarios`: `page.tsx` faz `requireRole(...HR_ADMIN_ROLES)` → `FuncionariosView`; nav aponta para a rota certa; query OK. A análise reporta redirect p/ `/auditoria`, que **não existe** no código.
- Timer de ponto: `Cronometro` deriva o tempo de `Date.now() - aberta.inicio` (início vindo do servidor) e recalcula no remount → persiste entre navegações.

Esta tarefa é **investigação com decisão**, não fix especulativo. Use superpowers:systematic-debugging se algo reproduzir.

**Files:** nenhum a priori (só se um bug se confirmar).

- [ ] **Step 1: Reproduzir /rh/funcionarios**

Run `npm run dev`. Logar como admin (`tadrio@senaprojetos.com.br`). Acessar `/rh/funcionarios` por (a) clique no menu lateral e (b) digitando a URL direto.
- Se carregar a listagem nos dois casos → bug **não reproduzido**.
- Se redirecionar: anotar o destino real (`/sem-permissao`? `/trocar-senha`? `/auditoria`?) e a condição (perfil usado, `mustChangePassword`). Aí abrir `systematic-debugging` e corrigir a causa real.

- [ ] **Step 2: Reproduzir o timer de ponto**

Run `npm run dev:server`. Logar como CLT (`carla@demo.senahub`). Abrir uma jornada em `/ponto`, navegar para outra rota e voltar.
- Se o cronômetro continuar do tempo correto → **não reproduzido**.
- Se zerar/parar: anotar o comportamento e corrigir (ex.: garantir que `aberta.inicio` seja sempre revalidado no retorno).

- [ ] **Step 3: Registrar o resultado**

Atualizar o roadmap com o veredito. Em `docs/superpowers/specs/2026-06-19-melhorias-roadmap-design.md`, na seção M0, anotar para cada item: "reproduzido e corrigido em <commit>" **ou** "não reproduzido em 2026-06-19 — fechado".

```bash
git add docs/superpowers/specs/2026-06-19-melhorias-roadmap-design.md
git commit -m "docs(melhorias): registra veredito de reprodução (funcionarios/ponto) — M0"
```

---

## Self-Review

- **Cobertura do spec (M0):** 2.1 funcionarios → Task 6 · 2.2 404 → Task 4 (clientes/[id] já usa `notFound()`) · 2.3 folha-lote → Task 1 (causa real = audit) · 2.4 receita → Task 2 · 3.8 chat → Task 3 (presença; histórico já OK) · 3.9 timer → Task 6 · 3.4 texto roadmap → Task 5. Todos cobertos.
- **Placeholders:** nenhum — todo passo de código mostra o código; passos de UI/socket trazem comandos e verificação manual exatos.
- **Consistência de tipos:** `resultadoDoErro(): "falha" | "rejeitado"` usado em `with-action` e auditado via `resultado?: ... | "rejeitado"`. `montarSerieReceita(ItemSerie[], ItemSerie[], Date, number)` consumido por `serieReceita` mapeando `{valor, data}`. `presenca-inicial: string[]` emitido por `socket.ts` e consumido por `chat-view.tsx`.
- **Escopo:** focado em M0; demais ondas ficam fora.
