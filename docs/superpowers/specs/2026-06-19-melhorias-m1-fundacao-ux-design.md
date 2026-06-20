# Melhorias M1 — Fundação UX — Design

> **Data:** 2026-06-19
> **Onda:** M1 do [roadmap de melhorias](2026-06-19-melhorias-roadmap-design.md)
> **Objetivo:** Criar os primitivos de UX reaproveitáveis e **fazer o rollout amplo** deles em
> todo o app, eliminando a duplicação/inconsistência atual (estados vazios em texto cru,
> formatadores de moeda/data copiados, confirmações destrutivas via `window.confirm`, tags só por cor).

---

## 1. Decisões (acordadas com o usuário)

1. **Rollout amplo agora**, não só os primitivos. Esta onda converte todos os sites existentes
   (~72 moeda, ~54 data, ~92 estados vazios, 4 `window.confirm`). Por isso é decomposta em
   sub-fases M1.0–M1.5 (cada uma com plano/execução e gate próprio).
2. **Formato: padrão único, sem compacto.** Centralizar full BRL (`R$ 81.000,00`) e `dd/mm/aaaa`
   + variantes contextuais já em uso. **Não** introduzir `R$ 81k`.
3. **Sem nova abstração de form** (decisão herdada do roadmap). O realce de loading é só uma prop
   no `Button` atual sobre o `pending`/`useTransition` que já existe — não é react-hook-form.
4. Mantém base-ui/shadcn (`render={}`, não `asChild`), código em inglês, UI pt-BR, commits pt-BR.

---

## 2. Primitivos (M1.0)

### 2.1 Formatadores — `src/lib/utils.ts`

Funções puras, com unit test. Aceitam `Date | string` (string ISO ou `yyyy-mm-dd`); inválido → `""`.

| Função | Saída | Cobre |
|---|---|---|
| `brl(v: number)` | `R$ 81.000,00` | ~72 cópias de `const brl` |
| `formatarData(d)` | `07/06/2026` | `toLocaleDateString("pt-BR")` (46×) |
| `formatarDataHora(d)` | `07/06/2026 14:30` | logs/auditoria |
| `formatarMesCurto(d)` | `jun` | `{ month: "short" }` (4×) |
| `formatarDiaMes(d)` | `07/06` | `{ day:"2-digit", month:"2-digit" }` (2×) |

Regra de moeda: `v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`.
Regra de data: normalizar para `Date`; se `NaN` → `""`; senão `toLocaleDateString("pt-BR")`.

### 2.2 `<EmptyState>` — `src/components/ui/empty-state.tsx`

```tsx
type EmptyStateProps = {
  icon?: LucideIcon;        // ex.: FileQuestion, Inbox
  title: string;            // pt-BR
  description?: string;     // pt-BR
  action?: React.ReactNode; // CTA opcional (Button/Link)
  className?: string;
};
```

Render: container centralizado (`flex flex-col items-center justify-center gap-3 py-10 text-center`),
ícone `size-10 text-muted-foreground`, título `text-sm font-medium`, descrição `text-xs text-muted-foreground`,
e `action` abaixo. Substitui os blocos `<p class="text-muted-foreground">Nenhum…</p>`.

### 2.3 `<ConfirmDialog>` + `useConfirm()` — `src/components/ui/confirm-dialog.tsx`

Construído sobre `dialog.tsx` (base-ui). Padrão provider + hook, para ergonomia tipo `window.confirm`:

```tsx
type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;  // default "Confirmar"
  cancelLabel?: string;   // default "Cancelar"
  variant?: "default" | "destructive"; // botão de confirmação
};

function useConfirm(): (opts: ConfirmOptions) => Promise<boolean>;
function ConfirmProvider({ children }: { children: React.ReactNode }): JSX.Element;
```

- `ConfirmProvider` mantém um único `<Dialog>` controlado + uma `ref` para a `resolve` da Promise.
- `confirm(opts)` abre o dialog e devolve uma Promise; "Confirmar" resolve `true`, "Cancelar"/fechar resolve `false`.
- Botão de confirmação usa `variant="destructive"` quando `variant === "destructive"`.
- `ConfirmProvider` é montado uma vez no layout do dashboard: `src/app/(dashboard)/layout.tsx`.

Uso (substitui `if (!window.confirm(...)) return;`):

```tsx
const confirm = useConfirm();
// ...
if (!(await confirm({ title: "Excluir modelo?", description: "Ação irreversível.", variant: "destructive" }))) return;
```

### 2.4 `<StatusBadge>` — `src/components/ui/status-badge.tsx`

Resolve daltonismo (cor **+** ícone). Recebe um `tone` semântico; escolhe ícone e classe automaticamente.

```tsx
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type StatusBadgeProps = { tone: Tone; children: React.ReactNode; className?: string };
```

Mapa interno:

| tone | ícone (lucide) | classe |
|---|---|---|
| success | `Check` | `bg-success/10 text-success border-success/40` |
| warning | `Clock` | `bg-warning/10 text-warning border-warning/40` |
| danger | `X` | `bg-destructive/10 text-destructive border-destructive/40` |
| info | `Info` | `bg-info/10 text-info border-info/40` |
| neutral | `Dot`/`Minus` | `bg-muted text-muted-foreground border-border` |

Envolve o `Badge` existente (`variant="outline"`) + `<Icon className="size-3" />` antes do label.
O código de domínio fornece o `tone` a partir do seu status (mapas já existentes tipo `COR`).

### 2.5 `Button loading?` — `src/components/ui/button.tsx`

Adicionar prop opcional `loading?: boolean`. Quando `true`: renderiza `<Loader2 className="size-4 animate-spin" />`
antes dos children e força `disabled`. Não altera assinatura existente (prop opcional). É um realce do
`pending` que já se passa hoje em `disabled={pending}` — call sites podem passar `loading={pending}`.

---

## 3. Rollouts (M1.1–M1.5)

Transformação **uniforme** por categoria. Cada sub-fase é mecânica e tem um **gate objetivo**:
`grep` da contagem remanescente chega a 0, `npx tsc --noEmit` limpo, `npm test` verde.

### M1.1 — Moeda
Trocar cada `const brl = (v) => v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" })`
(e variantes inline) por `import { brl } from "@/lib/utils"`.
**Gate:** `grep -rE "const brl|function brl|style: \"currency\"" src/components src/modules src/app` → 0 (exceto `lib/utils.ts`).

### M1.2 — Data
Trocar `d.toLocaleDateString("pt-BR"...)` pelas funções `formatarData`/`formatarMesCurto`/`formatarDiaMes`.
**Gate:** `grep -rn "toLocaleDateString" src/components src/modules src/app` → 0 (exceto `lib/utils.ts`).

### M1.3 — EmptyState
Trocar blocos de estado vazio em texto cru (`Nenhum…`, `Sem …`) por `<EmptyState icon title description action?>`.
Escolher ícone/CTA contextual por tela (pranchas, chat #geral, planejamento, documentos, listas).
**Gate:** revisão por tela + `tsc` + `npm test`; reduzir a contagem de `>(\s*Nenhum|\s*Sem )` em JSX a ~0
nos componentes de lista (textos não-empty-state, ex.: descrições, podem permanecer — julgar caso a caso).

### M1.4 — ConfirmDialog
Montar `ConfirmProvider` no layout do dashboard. Trocar os 4 `window.confirm` e adicionar confirmação
às destrutivas que hoje não têm (ex.: excluir modelo em Documentos, remover linha, excluir lançamento).
**Gate:** `grep -rn "window.confirm\|[^.]\bconfirm(" src/components src/app` → 0; `tsc`; `npm test`.

### M1.5 — StatusBadge + aria
Converter tags de status que usam só cor para `<StatusBadge tone>`. Adicionar `aria-label` nos botões
de emoji do clima (RH) e em botões ícone-only sem rótulo nos arquivos tocados.
**Gate:** `tsc`; `npm test`; checagem de que os mapas de status de domínio passam `tone`.

---

## 4. Estratégia de testes

- **Lógica pura** (formatadores `brl`/`formatarData`/…): unit tests em `src/lib/utils.test.ts` (vitest).
- **Componentes/rollout** (EmptyState, ConfirmDialog, StatusBadge, Button): sem RTL/e2e (padrão do repo);
  verificação = `npx tsc --noEmit` + `npm test` + os gates de `grep` por sub-fase + verificação visual
  do usuário ao final.
- Toda mutação continua auditada via `defineAction` (não afetado por esta onda).

---

## 5. Arquivos novos

- `src/lib/utils.ts` (estender) · `src/lib/utils.test.ts` (novo)
- `src/components/ui/empty-state.tsx`
- `src/components/ui/confirm-dialog.tsx`
- `src/components/ui/status-badge.tsx`
- `src/components/ui/button.tsx` (estender) · `src/app/(dashboard)/layout.tsx` (montar provider)
- + edições amplas de rollout em `src/components/**`, `src/modules/**`, `src/app/**`.

## 6. Riscos

- **Volume de edições** (~150 arquivos): mitigado pela decomposição em sub-fases com gate de `grep`
  + `tsc` + testes a cada uma; commits atômicos por sub-fase (ou por bloco coerente dentro dela).
- **EmptyState não é 100% mecânico** (ícone/CTA por contexto): M1.3 exige julgamento por tela —
  por isso fica depois dos rollouts puramente mecânicos (M1.1/M1.2).
- **ConfirmProvider no layout**: garantir que o layout do dashboard é client-compatível para o provider
  (provider é `"use client"`; montado dentro do layout server como componente client).
