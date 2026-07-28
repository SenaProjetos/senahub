---
name: nova-ferramenta
description: Cria uma calculadora de engenharia no módulo ferramentas — motor puro, testes contra norma, desenho DXF e memória de cálculo. Use ao adicionar ferramenta nova em src/modules/ferramentas.
disable-model-invocation: true
---

# Nova ferramenta de engenharia

## Regra dura, antes de tudo

A **chave** em `registry.ts` é **imutável depois de publicada**.
`entradasJson.ferramenta` dos saves históricos aponta para ela — renomear quebra o
histórico salvo do usuário, de forma silenciosa. Escolha a chave com calma **antes**
de commitar. Se a chave estiver errada e já foi publicada, crie uma nova e deprecie
a antiga; não renomeie.

## Camadas (nesta ordem)

### 1. Motor puro — `calc/<chave>.ts`
Sem I/O, sem Prisma, sem Next. Entrada tipada, saída estendendo `ResultadoBase`
(ver `types.ts`, junto de `Disciplina` / `TipoFerramenta` / `FormatoExport`).

Citar a **norma NBR aplicada em comentário junto de cada fórmula** — é o que permite
conferir o cálculo depois sem reabrir a norma. Unidades explícitas no nome do campo
ou em comentário (o motor não deve adivinhar unidade).

### 2. Teste — `calc/<chave>.test.ts` (obrigatório)
- Casos resolvidos de norma ou livro-texto, com valor esperado e tolerância declarada.
- Limites: seção insuficiente, entrada zero/negativa, taxa fora do domínio,
  combinação que deveria reprovar.
- Nomes de teste em pt-BR.

```bash
npx vitest run src/modules/ferramentas/calc/<chave>.test.ts
```

### 3. Registro — `registry.ts`
`FerramentaMeta`: chave (imutável), rótulo pt-BR, `Disciplina`, `TipoFerramenta`,
`FormatoExport[]`. O registry é **client-safe** — nada de server-only aqui.

### 4. Desenho — `dxf/<chave>.ts` (se gera desenho)
Sobre `lib/dxf.ts`: R12 (AC1009), unidade **mm**, eixos CAD **Y-up**.
Não desenhar em coordenadas de tela.

### 5. Memória de cálculo — `memoria/`
Renderer em `render-docx` / `render-html` / `render-xlsx` conforme o
`FormatoExport[]` declarado no registry.

### 6. Guia — `guia-meta.ts`
Verbete do guia ilustrado.

## Integrações a conferir

- **ART / responsável técnico**: se a ferramenta emite peça assinável, integrar com o
  cadastro de ARTs do projeto (seleção de ART + responsável técnico no memorial).
- **Persistência**: `savefile.ts` / `auto-store.ts` guardam o snapshot das entradas.
  Confirmar que a entrada nova entra no snapshot.
- **Permissão**: ferramenta em disciplina nova pode exigir recurso novo em
  `permissions-catalog.ts` + `db:seed`.

## Fechamento

- `npx vitest run src/modules/ferramentas/`
- Página no manual em `docs/manual/engenharia/` + entrada em `search-index.json`
- Plano/spec datado em `docs/superpowers/plans/` se a ferramenta foi planejada
  (o repo marca plano concluído no próprio arquivo)
