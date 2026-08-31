# Melhorias M1.0 — Primitivos de UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar os primitivos reaproveitáveis da onda M1 — formatadores, `<EmptyState>`, `<ConfirmDialog>`/`useConfirm`, `<StatusBadge>` e a prop `loading` no `Button` — sem ainda fazer o rollout (isso são as sub-fases M1.1–M1.5, planos próprios).

**Architecture:** Lógica pura (formatadores) em `lib/utils.ts`, com unit tests vitest. Componentes em `components/ui/`, sobre os primitivos base-ui existentes (`dialog.tsx`, `button.tsx`, `badge.tsx`), verificados por `tsc` + build de tipo (sem RTL/e2e, padrão do repo). O `ConfirmProvider` é montado uma vez no layout do dashboard.

**Tech Stack:** Next 15 · React 19 · TypeScript · base-ui · lucide-react · class-variance-authority · vitest.

## Global Constraints

- Padrão de formatação único, **sem compacto**: `brl()` = `R$ 81.000,00`, `formatarData()` = `dd/mm/aaaa`.
- **Sem nova abstração de form** (sem react-hook-form/SWR). `loading` é só realce do `pending` existente.
- base-ui: triggers usam `render={<Comp/>}`, não `asChild`.
- Código/identificadores em inglês; UI em pt-BR; commits semânticos pt-BR.
- Prisma de `@/generated/prisma/client`. Testes só de lógica pura; componentes via `tsc` + checagem.
- Rodar suíte: `npm test`. Teste único: `npx vitest run <arquivo>`.

---

### Task 1: Formatadores em `lib/utils.ts`

**Files:**
- Modify: `src/lib/utils.ts` (adicionar funções)
- Test: `src/lib/utils.test.ts` (novo)

**Interfaces:**
- Produces:
  - `brl(v: number): string`
  - `formatarData(d: Date | string | null | undefined): string`
  - `formatarDataHora(d: Date | string | null | undefined): string`
  - `formatarMesCurto(d: Date | string | null | undefined): string`
  - `formatarDiaMes(d: Date | string | null | undefined): string`
- Consumes: nada.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brl, formatarData, formatarDataHora, formatarMesCurto, formatarDiaMes } from "@/lib/utils";

// normaliza espaço estreito/insecável que o Intl usa em pt-BR
const norm = (s: string) => s.replace(/ | /g, " ");

describe("brl", () => {
  it("formata real com 2 casas e separadores pt-BR", () => {
    expect(norm(brl(81000))).toBe("R$ 81.000,00");
    expect(norm(brl(1234.5))).toBe("R$ 1.234,50");
    expect(norm(brl(0))).toBe("R$ 0,00");
  });
});

describe("formatarData", () => {
  it("formata Date como dd/mm/aaaa", () => {
    expect(formatarData(new Date(2026, 5, 7))).toBe("07/06/2026");
  });
  it("parseia string yyyy-mm-dd sem shift de timezone", () => {
    expect(formatarData("2026-06-07")).toBe("07/06/2026");
  });
  it("retorna '' para valor inválido/nulo", () => {
    expect(formatarData(null)).toBe("");
    expect(formatarData(undefined)).toBe("");
    expect(formatarData("x</")).toBe("");
  });
});

describe("formatarDataHora", () => {
  it("inclui hora:minuto", () => {
    expect(formatarDataHora(new Date(2026, 5, 7, 14, 30))).toBe("07/06/2026 14:30");
  });
  it("retorna '' para inválido", () => {
    expect(formatarDataHora(null)).toBe("");
  });
});

describe("formatarMesCurto / formatarDiaMes", () => {
  it("mês curto sem ponto", () => {
    expect(formatarMesCurto(new Date(2026, 5, 7))).toBe("jun");
  });
  it("dia/mês 2 dígitos", () => {
    expect(formatarDiaMes(new Date(2026, 5, 7))).toBe("07/06");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: FAIL — `brl`/`formatarData`/etc. não exportados.

- [ ] **Step 3: Implement the formatters**

Append to `src/lib/utils.ts` (depois da função `cn`):

```ts
/** Converte Date | string (ISO ou yyyy-mm-dd) em Date local; null se inválido. */
function paraData(d: Date | string | null | undefined): Date | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Moeda BRL: R$ 81.000,00 */
export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data: 07/06/2026 (vazio se inválida). */
export function formatarData(d: Date | string | null | undefined): string {
  const date = paraData(d);
  return date ? date.toLocaleDateString("pt-BR") : "";
}

/** Data e hora: 07/06/2026 14:30 (vazio se inválida). */
export function formatarDataHora(d: Date | string | null | undefined): string {
  const date = paraData(d);
  if (!date) return "";
  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Mês curto sem ponto: jun */
export function formatarMesCurto(d: Date | string | null | undefined): string {
  const date = paraData(d);
  return date ? date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") : "";
}

/** Dia/mês 2 dígitos: 07/06 */
export function formatarDiaMes(d: Date | string | null | undefined): string {
  const date = paraData(d);
  return date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat(ui): formatadores brl/data centralizados em lib/utils"
```

---

### Task 2: `<EmptyState>`

**Files:**
- Create: `src/components/ui/empty-state.tsx`

**Interfaces:**
- Produces: `EmptyState` (default export nomeado) com props `{ icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }`.
- Consumes: `cn` de `@/lib/utils`.

- [ ] **Step 1: Create the component**

Create `src/components/ui/empty-state.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="size-10 text-muted-foreground" aria-hidden /> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/empty-state.tsx
git commit -m "feat(ui): componente EmptyState"
```

---

### Task 3: `<ConfirmDialog>` + `useConfirm()` + provider no layout

**Files:**
- Create: `src/components/ui/confirm-dialog.tsx`
- Modify: `src/app/(dashboard)/layout.tsx` (montar `ConfirmProvider` em volta de `{children}`)

**Interfaces:**
- Produces:
  - `useConfirm(): (opts: ConfirmOptions) => Promise<boolean>`
  - `ConfirmProvider({ children }): JSX.Element`
  - `type ConfirmOptions = { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; variant?: "default" | "destructive" }`
- Consumes: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` de `@/components/ui/dialog`; `Button` de `@/components/ui/button`.

- [ ] **Step 1: Create the provider + hook**

Create `src/components/ui/confirm-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type Estado = ConfirmOptions & { open: boolean };

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<Estado>({ open: false, title: "" });
  const resolveRef = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    setEstado({ ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const fechar = React.useCallback((resultado: boolean) => {
    setEstado((e) => ({ ...e, open: false }));
    resolveRef.current?.(resultado);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={estado.open} onOpenChange={(open) => (!open ? fechar(false) : undefined)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{estado.title}</DialogTitle>
            {estado.description ? <DialogDescription>{estado.description}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => fechar(false)}>
              {estado.cancelLabel ?? "Cancelar"}
            </Button>
            <Button
              variant={estado.variant === "destructive" ? "destructive" : "default"}
              onClick={() => fechar(true)}
            >
              {estado.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Retorna `confirm(opts) => Promise<boolean>`. Requer <ConfirmProvider> ancestral. */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa de <ConfirmProvider> no topo da árvore.");
  return ctx;
}
```

> Nota base-ui: `Dialog` (de `dialog.tsx`) é `DialogPrimitive.Root`; suas props incluem `open` e
> `onOpenChange` (base-ui usa `onOpenChange(open, event)` — aqui só usamos `open`). Confirme a assinatura
> em `dialog.tsx`/base-ui ao implementar; se for `onOpenChange={(open) => ...}`, o código acima já está correto.

- [ ] **Step 2: Mount the provider in the dashboard layout**

In `src/app/(dashboard)/layout.tsx`, importar e envolver `{children}`:

```tsx
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
```

Trocar o corpo do return para:

```tsx
  return (
    <Shell role={user.role} user={user}>
      <PushManager />
      <ConfirmProvider>{children}</ConfirmProvider>
      {/* Chat flutuante: dados carregados sob demanda (ao abrir) — não pesa a navegação. */}
      {CHAT_ROLES.includes(user.role) && <FloatingChat />}
    </Shell>
  );
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors. (Se o `onOpenChange` da base-ui exigir assinatura diferente, ajustar a lambda
para `(open: boolean) => { if (!open) fechar(false); }` e rerodar.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat(ui): ConfirmDialog + useConfirm com provider no dashboard"
```

---

### Task 4: `<StatusBadge>`

**Files:**
- Create: `src/components/ui/status-badge.tsx`

**Interfaces:**
- Produces: `StatusBadge` com props `{ tone: "success" | "warning" | "danger" | "info" | "neutral"; children: React.ReactNode; className?: string }`.
- Consumes: `Badge` de `@/components/ui/badge`; `cn` de `@/lib/utils`.

- [ ] **Step 1: Confirm the Badge API**

Run: `npx tsc --noEmit` não é o ponto aqui — abrir `src/components/ui/badge.tsx` e confirmar que
`Badge` aceita `variant="outline"` e `className`. (Padrão shadcn; usar `variant="outline"`.)

- [ ] **Step 2: Create the component**

Create `src/components/ui/status-badge.tsx`:

```tsx
import { Check, Clock, X, Info, Minus, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, { icon: LucideIcon; className: string }> = {
  success: { icon: Check, className: "bg-success/10 text-success border-success/40" },
  warning: { icon: Clock, className: "bg-warning/10 text-warning border-warning/40" },
  danger: { icon: X, className: "bg-destructive/10 text-destructive border-destructive/40" },
  info: { icon: Info, className: "bg-info/10 text-info border-info/40" },
  neutral: { icon: Minus, className: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = TONE[tone];
  return (
    <Badge variant="outline" className={cn("gap-1", toneClass, className)}>
      <Icon className="size-3" aria-hidden />
      {children}
    </Badge>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/status-badge.tsx
git commit -m "feat(ui): StatusBadge com ícone por tom (acessibilidade daltonismo)"
```

---

### Task 5: Prop `loading` no `Button`

**Files:**
- Modify: `src/components/ui/button.tsx`

**Interfaces:**
- Produces: `Button` aceita `loading?: boolean` (extra). Quando `true`: renderiza spinner `Loader2` antes dos children e força `disabled`.
- Consumes: `Loader2` de `lucide-react`.

- [ ] **Step 1: Add the loading prop**

In `src/components/ui/button.tsx`, importar o ícone no topo:

```tsx
import { Loader2 } from "lucide-react"
```

Substituir a função `Button` por:

```tsx
function Button({
  className,
  variant = "default",
  size = "default",
  render,
  nativeButton,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      // Quando renderizado como outro elemento (ex.: <Link>/<a>), não é um <button> nativo.
      nativeButton={nativeButton ?? !render}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </ButtonPrimitive>
  )
}
```

> Nota: `loading` só faz sentido em botões de ação (sem `render`). Quando há `render`, os children
> vão para o elemento renderizado conforme o contrato base-ui — não usar `loading` junto de `render`.

- [ ] **Step 2: Verify types + full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass (formatadores incluídos).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): prop loading no Button (spinner + disabled)"
```

---

## Self-Review

- **Cobertura do spec (M1.0):** §2.1 formatadores → Task 1 · §2.2 EmptyState → Task 2 · §2.3 ConfirmDialog/useConfirm + provider → Task 3 · §2.4 StatusBadge → Task 4 · §2.5 Button loading → Task 5. Rollouts §3 (M1.1–M1.5) ficam para planos próprios — fora deste plano por decisão de escopo.
- **Placeholders:** nenhum — todo passo de código mostra o código; as duas "Notas" são avisos de contrato base-ui a confirmar na hora, com a correção já indicada.
- **Consistência de tipos:** `ConfirmOptions`/`useConfirm` idênticos entre Task 3 e o uso futuro; `Tone` de `StatusBadge` casa com os tokens `success/warning/danger/info/neutral` (todos existem em globals.css, `--color-info` confirmado); `brl/formatarData/...` com as assinaturas do spec §2.1.
- **Escopo:** só primitivos; nenhum rollout aqui.
