---
name: novo-modulo
description: Cria a estrutura completa de um novo módulo do SenaHub, com todos os pontos de registro (nav, permissões, seed, manual). Use ao adicionar um domínio novo ao sistema.
disable-model-invocation: true
---

# Novo módulo

Argumento: nome do módulo em kebab-case. Seguir a nomenclatura dos vizinhos
(`src/modules/` já tem 34 — olhar um parecido antes de decidir).

## Camadas (nesta ordem)

1. **`src/modules/<nome>/schemas.ts`** — Zod. Um schema por ação.

2. **`src/modules/<nome>/service.ts`** — lógica de negócio **pura**.
   Sem import de Next, sem HTTP, sem `server-only`. É o que actions **e**
   jobs-handlers compartilham. É também o que os testes atacam.

3. **`src/modules/<nome>/queries.ts`** — leituras.
   - `import "server-only"` na primeira linha.
   - Listas: usar `parseListParams(searchParams)` de `lib/list-params.ts` →
     `{page, skip, take, sort, dir, q}` pronto pro Prisma.
   - Aplicar escopo de dados: papéis globais (`admin`, `supervisor`) veem tudo;
     os demais são filtrados (ver `escopoProjeto` em `modules/projetos/queries.ts`).
   - `podeVerTudo(u)` de `lib/roles.ts` dá leitura de sócio — **piso de leitura apenas**,
     nunca usar em gate de escrita.

4. **`src/modules/<nome>/actions.ts`** — toda mutação via `defineAction`:
   ```ts
   export const minhaAcao = defineAction(
     { modulo: "<nome>", recurso: "<recurso>", permissao: "gerir", schema: meuSchema },
     async (input, ctx) => { /* delega pro service */ },
   );
   ```
   - Diff no audit: `capturarAntes` vai **dentro do config object**, nunca como 3º argumento.
   - Erro de negócio: `throw new ActionError("mensagem pt-BR")`. Qualquer outro throw
     vira mensagem genérica (bom — não vaza detalhe técnico).
   - Auditoria é automática pelo `defineAction`. Não contornar.

5. **`src/modules/<nome>/<algo>.test.ts`** — cobrir o `service.ts`.
   Vitest roda em env **node**, sem jsdom. Não testar componente React aqui.

6. **`src/app/(dashboard)/<nome>/page.tsx`** — RSC, lê de `queries.ts`.

7. **`src/components/<nome>/`** — convenção de nomes:
   - `<nome>-view.tsx` — página inteira (dona dos filtros, título, ações)
   - `<nome>-dialog.tsx` — modal de formulário
   - `<nome>-form.tsx` — formulário reusável
   - `<nome>-button.tsx` — ação contextual
   - Cliente: `useSetParams` atualiza os search params da URL e **reseta `page`**
     automaticamente quando outro filtro muda.

## Pontos de registro (esquecer aqui = feature invisível)

- **`src/lib/nav-config.ts`** → item em `NAV_GROUPS` com `roles[]` + flag de mobile.
- **`src/lib/permissions-catalog.ts`** → recurso + ações (`ver`, `gerir`, …).
- **`npm run db:seed`** para materializar as permissões — no dev **e no deploy**.
- **`docs/manual/<secao>/`** → página nova + entrada em `search-index.json`
  (não há gerador; sem isso a página some da busca do `/ajuda`).

## Regras que valem em todo o módulo

- Código e identificadores em **inglês**; toda string de usuário em **pt-BR**.
- Prisma: importar de `@/generated/prisma/client`, **nunca** de `@prisma/client`.
- shadcn aqui é sobre **base-ui, não Radix**: `render={<Comp />}`, nunca `asChild`.
- `Select` `onValueChange` devolve `string | null`, não `string`.
- Reusar `components/ui/` — já tem confirm-dialog, empty-state, sortable-head,
  status-badge. Não recriar.
- Toda lista/tabela precisa dos três estados: carregando (skeleton), vazio
  (`EmptyState` acionável) e erro (mensagem com causa, não crash genérico).

## Fechamento

```bash
npm run lint && npm test
```
