# IFC federado (Fase 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na Compatibilização, gerar um IFC único (um `IfcProject`) com os modelos escolhidos, guardado como
documento do projeto (origem `modelo_federado`, versões R00, R01…) e visível numa pasta "Modelo federado" dentro
do Desenvolvimento da aba Arquivos.

**Architecture:** Um motor PURO lê STEP em pedaços (`LeitorStep`), analisa cada IFC (`AnalisadorIfc`: schema,
unidade, projeto, contextos, maior id, GlobalIds) e escreve o arquivo unificado renumerando `#ids` por deslocamento
e absorvendo os `IfcProject` secundários no mestre (`escreverFederado`). Um child process (`scripts/federar-ifc.ts`)
liga o motor ao disco em streaming; um job pg-boss (`gerar-ifc-federado`) chama o child e grava `Documento` +
`DocumentoVersao` + `GeracaoModeloFederado`. A aba Arquivos mostra a área nova `federado` como pasta no nível das
disciplinas.

**Tech Stack:** Next 15 / React 19, Prisma 7 (PostgreSQL 17), pg-boss, tsx child process, vitest (node),
web-ifc (só no smoke), base-ui (shadcn `base-nova`).

**Spec:** [docs/superpowers/specs/2026-10-04-ifc-federado-design.md](../specs/2026-10-04-ifc-federado-design.md)
— leia antes de começar; ela vence este plano em caso de conflito.

## Global Constraints

- Código e identificadores seguem o vizinho (português, como o resto de `modules/coordenacao`); **todo texto de tela
  e de erro em pt-BR**; commits Conventional em pt-BR, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Prisma client de `@/generated/prisma/client`, nunca `@prisma/client`.
- Toda mutação por `defineAction` (`lib/with-action.ts`); erro mostrável = `ActionError`.
- Arquivos puros (`step.ts`, `analise.ts`, `montagem.ts`, `regras.ts`, `fixture-ifc.ts`, `acoes.ts`,
  `documentos-cliente/origens.ts`) **não** importam Prisma, `server-only`, Next, `node:fs`.
- Caminho em disco só por `resolverCaminho()` (`lib/storage.ts`), sempre relativo a `STORAGE_BASE_PATH`.
- `boss` só pelo accessor do `globalThis` (`bossVivo()`), nunca variável de módulo.
- Sem `Promise.all` com o cliente de transação (`tx`).
- `confirm()` SEMPRE antes de `startTransition`.
- Nada de `contextmenu` à mão: menu de linha via `LinhaComMenu` + descritor puro (ADR-0002).
- Limite de entrada: soma ≤ `TAMANHO_MAX_IFC` (2 GB) — `DocumentoVersao.tamanho` é `Int`.
- Revisão exibida com `rotuloRevisao(numero)` (`lib/utils.ts`: versão 1 = R00).
- Stage de arquivos específicos (nunca `git add -A`/`.`); conferir com `git show --stat` depois de cada commit.
- Banco de dev do worktree: `senahub_remake_vscode` (porta 5433). `prisma migrate dev` exige reset neste banco
  (drift conhecido): a migração é escrita à mão e aplicada com `npx prisma migrate deploy`.

## Review Focus

1. **String STEP com `;`, `#`, `''` ou `/*` dentro** (nome de parede "Parede 'A'; #99") partida no meio de dois
   pedaços de leitura — tem de sair idêntica, sem virar duas instruções nem ter o `#99` renumerado. Testado na
   Tarefa 1 (pedaços de 1, 7 e 64 caracteres) e na Tarefa 3 (arquivo inteiro).
2. **IFC cuja unidade é `IfcConversionBasedUnit` (pés) com um `IfcSIUnit` de comprimento solto no arquivo** — a
   unidade é a do `UnitsInContext` do projeto, não o primeiro `IfcSIUnit` achado. Testado na Tarefa 2.
3. **Dois cliques em "Gerar" ao mesmo tempo / servidor reiniciado no meio** — só uma geração viva por projeto
   (índice único parcial) e a travada há mais de 45 min é liberada. Testado no smoke (Tarefa 12).
4. **Modelo excluído ou substituído entre o diálogo e o job** — o job usa a composição congelada e falha dizendo
   qual arquivo sumiu, sem criar documento. Testado no smoke (Tarefa 12).
5. **Federado vazando para onde não deve** (Recebidos, portal, ficha do cliente, lista de modelos da
   Compatibilização, DWG) — teste-guarda dos filtros por origem (Tarefa 7) + checagem no smoke (Tarefa 12).

---

## Modelo por tarefa

Execução por subagentes: o implementador de cada tarefa roda no modelo da coluna **Implementa** (`Agent` com
`model`), o revisor da tarefa no da coluna **Revisa**. A revisão final da branch inteira é **Opus**. Opus = o
modelo desta sessão; trocar de modelo no meio NÃO é preciso, porque cada subagente recebe o seu.

| Tarefa | Implementa | Revisa | Por quê |
|---|---|---|---|
| 1. Leitor STEP puro | Opus | Opus | leitor STEP: fronteira de pedaço, string com `''`/`;`/`#`, comentário — erro aqui corrompe o arquivo em silêncio |
| 2. Fixture de IFC e analisador | Opus | Opus | resolução da unidade pelo `UnitsInContext` (moeda e unidade derivada na atribuição, pés com `IfcSIUnit` solto) |
| 3. Montagem do arquivo federado | Opus | Opus | renumeração, projeto absorvido e contextos: o coração da junção |
| 4. Regras de elegibilidade | Sonnet | Sonnet | regras puras com código e testes prontos no plano |
| 5. Child process e orquestrador do spawn | Sonnet | Opus | segue o padrão do `deslocar-ifc.ts`; o revisor olha backpressure do stream e limpeza do `.parcial` |
| 6. Schema e migração | Sonnet | Sonnet | schema + SQL prontos; atenção ao drift do banco de dev (migrate deploy, nunca migrate dev) |
| 7. Origens de documento (filtros únicos + gate de leitura) | Sonnet | Opus | troca mecânica de filtros, mas é gate de ACESSO — revisor forte confere vazamento |
| 8. Serviço, job e actions | Opus | Opus | concorrência (índice parcial, travada), transação, job, actions e notificação juntos |
| 9. Download em streaming | Haiku | Sonnet | troca pontual de Buffer por stream numa rota, código pronto |
| 10. Compatibilização — diálogo e bloco da última geração | Sonnet | Sonnet | UI com código pronto; conferir 390×844 e tela cheia do visualizador |
| 11. Aba Arquivos — pasta "Modelo federado" no Desenvolvimento | Sonnet | Opus | UI em 6 arquivos da aba Arquivos (shell, árvore, trilha): fácil quebrar navegação existente |
| 12. Smoke, verificação com IFC real e documentação | Sonnet | Opus | smoke e verificação com IFC real; revisor lê o resultado do IFC real e decide se está pronto |

Se executar direto nesta sessão (sem subagentes), a coluna Implementa vira o modelo a ativar com `/model`
antes de cada tarefa — PARE e peça a troca quando a próxima tarefa pedir modelo diferente do atual.

---

## Mapa de arquivos

**Criar**
- `src/modules/coordenacao/federado/step.ts` — leitor STEP em pedaços, atributos, troca de referências, texto STEP.
- `src/modules/coordenacao/federado/step.test.ts`
- `src/modules/coordenacao/federado/fixture-ifc.ts` — gera IFC4 mínimo válido (teste + smoke).
- `src/modules/coordenacao/federado/analise.ts` — `AnalisadorIfc`, `analisarFonte`.
- `src/modules/coordenacao/federado/analise.test.ts`
- `src/modules/coordenacao/federado/montagem.ts` — `planejarJuncao`, `transformarInstancia`, `escreverFederado`, `avisoGuidsRepetidos`.
- `src/modules/coordenacao/federado/montagem.test.ts`
- `src/modules/coordenacao/federado/regras.ts` — elegibilidade, rótulos, constantes, leitura da saída do child.
- `src/modules/coordenacao/federado/regras.test.ts`
- `src/modules/coordenacao/federado/acoes.ts` + `acoes.test.ts` — descritor do menu das versões (ADR-0002).
- `scripts/federar-ifc.ts` — child process (I/O).
- `src/modules/coordenacao/federado/federacao.ts` — spawn do child (server-only, injetável).
- `src/modules/coordenacao/federado/inspecao.ts` — schema/unidade de um IFC em disco (server-only).
- `src/modules/coordenacao/federado/service.ts` — candidatos, criar geração, processar, consultas.
- `src/modules/coordenacao/federado/actions.ts` — Server Actions.
- `src/modules/documentos-cliente/origens.ts` + `origens.test.ts` — constantes de origem + teste-guarda.
- `prisma/migrations/20261004120000_ifc_federado/migration.sql`
- `src/components/coordenacao/exportar-federado-dialog.tsx`
- `src/components/coordenacao/modelo-federado-bloco.tsx`
- `src/components/projetos/arquivos/tabela-modelo-federado.tsx`
- `scripts/smoke-ifc-federado.ts`, `scripts/verificar-ifc-federado.ts`

**Modificar**
- `prisma/schema.prisma` (enum `OrigemDocumento`, model novo, back-relations)
- `src/modules/coordenacao/service.ts` (exportar `bossVivo`)
- `src/lib/jobs.ts`, `src/lib/jobs-handlers.ts` (fila nova)
- `src/modules/coordenacao/queries.ts`, `src/modules/documentos-cliente/queries.ts`, `src/modules/arquivos/arvore-global-queries.ts`, `src/modules/dwg/queries.ts` (filtros por origem)
- `src/modules/documentos-cliente/acesso.ts` (gate da origem nova)
- `src/app/api/documentos/[id]/download/route.ts` (streaming)
- `src/modules/uploads/areas-projeto.ts`, `src/modules/uploads/pastas-da-lista.ts` (+ teste)
- `src/components/projetos/arquivos/{painel-areas-projeto,conteudo-area-projeto,documentos-shell,arvore-documentos,tela-documentos-projeto}.tsx`
- `src/components/coordenacao/{painel-disciplinas,coordenacao-view}.tsx`, `src/app/(dashboard)/projetos/[id]/coordenacao/page.tsx`
- `package.json` (scripts), `CLAUDE.md` (comando + nota), `docs/manual/` (Compatibilização + novidades)

---

### Task 1: Leitor STEP puro

**Modelo:** implementa **Opus**, revisa **Opus** — leitor STEP: fronteira de pedaço, string com `''`/`;`/`#`, comentário — erro aqui corrompe o arquivo em silêncio.

**Files:**
- Create: `src/modules/coordenacao/federado/step.ts`
- Test: `src/modules/coordenacao/federado/step.test.ts`

**Interfaces:**
- Produces:
  - `class LeitorStep { alimentar(texto: string): string[]; finalizar(): string[] }` — devolve instruções completas, sem o `;` final e sem espaços nas pontas.
  - `type Instancia = { id: number; tipo: string; args: string }`
  - `idDaInstrucao(instr: string): number | null`
  - `lerInstancia(instr: string): Instancia | null` — `tipo` em MAIÚSCULAS; `null` para cabeçalho e para instância complexa `#1=(A()B())`.
  - `atributos(args: string): string[]` — atributos de topo, aparados.
  - `trocarReferencias(texto: string, novoId: (id: number) => number): string` — só `#n` fora de string e de comentário.
  - `referencias(texto: string): number[]`
  - `textoStep(s: string): string` — literal STEP com aspas, `''`, `\\` e `\X2\…\X0\` para não-ASCII.
  - `palavraDaInstrucao(instr: string): string` — primeira palavra em maiúsculas (`"DATA"`, `"ENDSEC"`, `"FILE_SCHEMA"`…).

- [ ] **Step 1: Escrever os testes**

```ts
// src/modules/coordenacao/federado/step.test.ts
import { describe, expect, it } from "vitest";
import {
  LeitorStep, atributos, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias, textoStep, trocarReferencias,
} from "./step";

function lerEmPedacos(texto: string, tamanho: number): string[] {
  const leitor = new LeitorStep();
  const saida: string[] = [];
  for (let i = 0; i < texto.length; i += tamanho) saida.push(...leitor.alimentar(texto.slice(i, i + tamanho)));
  saida.push(...leitor.finalizar());
  return saida;
}

const ARQUIVO = [
  "ISO-10303-21;",
  "HEADER;",
  "FILE_SCHEMA(('IFC4'));",
  "ENDSEC;",
  "DATA;",
  "#1=IFCWALL('A1AAAAAAAAAAAAAAAAAAAA',$,'Parede ''A''; com #99 e /* nao e comentario */',$,$,#2,$,$,$);",
  "/* comentario com ; e #5 */",
  "#2=IFCLOCALPLACEMENT($,\n#3);",
  "ENDSEC;",
  "END-ISO-10303-21;",
].join("\n");

describe("LeitorStep", () => {
  it.each([1, 7, 64, 10_000])("acha as mesmas instruções com pedaços de %i caracteres", (tamanho) => {
    const instrucoes = lerEmPedacos(ARQUIVO, tamanho);
    // O comentário não tem ";" próprio: gruda na instrução seguinte (#2).
    expect(instrucoes.map(palavraDaInstrucao)).toEqual([
      "ISO-10303-21", "HEADER", "FILE_SCHEMA", "ENDSEC", "DATA", "#1", "#2", "ENDSEC", "END-ISO-10303-21",
    ]);
    expect(instrucoes[5]).toContain("'Parede ''A''; com #99 e /* nao e comentario */'");
  });

  it("instrução que ocupa várias linhas sai inteira", () => {
    const [, , , , , , dois] = lerEmPedacos(ARQUIVO, 3);
    expect(dois).toMatch(/^\/\* comentario com ; e #5 \*\/\s*#2=IFCLOCALPLACEMENT\(\$,\n#3\)$/);
  });

  it("arquivo que termina dentro de um texto é recusado", () => {
    const leitor = new LeitorStep();
    leitor.alimentar("#1=IFCWALL('sem fim");
    expect(() => leitor.finalizar()).toThrow("IFC truncado");
  });
});

describe("lerInstancia / idDaInstrucao", () => {
  it("lê id, tipo em maiúsculas e argumentos", () => {
    expect(lerInstancia("#12= IfcSiUnit(*,.LENGTHUNIT.,.MILLI.,.METRE.)")).toEqual({
      id: 12, tipo: "IFCSIUNIT", args: "*,.LENGTHUNIT.,.MILLI.,.METRE.",
    });
  });
  it("comentário antes da instância não atrapalha", () => {
    expect(idDaInstrucao("/* x */ #7=IFCDIRECTION((0.,0.,1.))")).toBe(7);
  });
  it("cabeçalho e instância complexa não são Instancia", () => {
    expect(lerInstancia("FILE_SCHEMA(('IFC4'))")).toBeNull();
    expect(lerInstancia("#3=(IFCA()IFCB())")).toBeNull();
    expect(idDaInstrucao("#3=(IFCA()IFCB())")).toBe(3);
  });
});

describe("atributos", () => {
  it("separa só no nível de topo, respeitando string e parênteses", () => {
    expect(atributos("'a,b',$,(#1,#2),IFCLENGTHMEASURE(1.),'x''y'")).toEqual([
      "'a,b'", "$", "(#1,#2)", "IFCLENGTHMEASURE(1.)", "'x''y'",
    ]);
  });
});

describe("trocarReferencias / referencias", () => {
  it("troca só referências fora de string e de comentário", () => {
    const t = "#1=IFCX(#2,'#3',(#4,#5)) /* #6 */";
    expect(trocarReferencias(t, (n) => n + 100)).toBe("#101=IFCX(#102,'#3',(#104,#105)) /* #6 */");
    expect(referencias("(#4,'#9',#5)")).toEqual([4, 5]);
  });
});

describe("textoStep", () => {
  it("escapa aspas, barra e acento", () => {
    expect(textoStep("D'Ávila\\x")).toBe("'D''\\X2\\00C1\\X0\\vila\\\\x'");
  });
});
```

`palavraDaInstrucao` pula comentários iniciais — por isso a instrução com o comentário grudado é `"#2"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/federado/step.test.ts`
Expected: FAIL — "Failed to resolve import ./step".

- [ ] **Step 3: Implementar**

```ts
// src/modules/coordenacao/federado/step.ts
/**
 * Leitura de STEP (ISO-10303-21, o formato de texto do IFC) — PURO, sem I/O.
 *
 * O IFC federado é montado no TEXTO (spec 2026-10-04 §5): ler em pedaços, achar cada instrução, renumerar os
 * `#ids`. Só precisa entender o que separa instruções e o que é referência: `;` e `#n` FORA de string
 * (`'…'` com `''` escapado, ou `"…"` binário) e fora de comentário (`/* … *\/`). O resto é copiado como veio.
 */

export type Instancia = { id: number; tipo: string; args: string };

/** Lê instruções completas de um texto que chega em pedaços (o arquivo pode ter vários GB). */
export class LeitorStep {
  private buffer = "";
  private pos = 0;
  private aspas: string | null = null;
  private comentario = false;

  alimentar(texto: string): string[] {
    this.buffer += texto;
    const b = this.buffer;
    const saida: string[] = [];
    let inicio = 0;
    let i = this.pos;
    while (i < b.length) {
      const c = b[i];
      if (this.comentario) {
        if (c === "*") {
          if (i + 1 === b.length) break; // o "/" pode vir no próximo pedaço
          if (b[i + 1] === "/") {
            this.comentario = false;
            i += 2;
            continue;
          }
        }
        i++;
        continue;
      }
      if (this.aspas) {
        if (c === this.aspas) {
          if (this.aspas === "'") {
            if (i + 1 === b.length) break; // pode ser um '' partido entre pedaços
            if (b[i + 1] === "'") {
              i += 2;
              continue;
            }
          }
          this.aspas = null;
        }
        i++;
        continue;
      }
      if (c === "'" || c === '"') {
        this.aspas = c;
        i++;
        continue;
      }
      if (c === "/") {
        if (i + 1 === b.length) break;
        if (b[i + 1] === "*") {
          this.comentario = true;
          i += 2;
          continue;
        }
      }
      if (c === ";") {
        const instr = b.slice(inicio, i).trim();
        if (instr) saida.push(instr);
        inicio = i + 1;
      }
      i++;
    }
    this.buffer = b.slice(inicio);
    this.pos = i - inicio;
    return saida;
  }

  finalizar(): string[] {
    if (this.aspas || this.comentario) {
      throw new Error("IFC truncado: o arquivo termina no meio de um texto ou comentário.");
    }
    const resto = this.buffer.trim();
    this.buffer = "";
    this.pos = 0;
    return resto ? [resto] : [];
  }
}

/** Tira comentários do começo da instrução (o leitor os deixa grudados na instrução seguinte). */
function semComentarioInicial(instr: string): string {
  let s = instr;
  while (s.startsWith("/*")) {
    const fim = s.indexOf("*/");
    if (fim < 0) return s;
    s = s.slice(fim + 2).trimStart();
  }
  return s;
}

export function palavraDaInstrucao(instr: string): string {
  const s = semComentarioInicial(instr);
  const m = /^(#\d+|[A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1].toUpperCase() : "";
}

export function idDaInstrucao(instr: string): number | null {
  const m = /^#(\d+)\s*=/.exec(semComentarioInicial(instr));
  return m ? Number(m[1]) : null;
}

const RE_INSTANCIA = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/;

export function lerInstancia(instr: string): Instancia | null {
  const m = RE_INSTANCIA.exec(semComentarioInicial(instr));
  return m ? { id: Number(m[1]), tipo: m[2].toUpperCase(), args: m[3] } : null;
}

export function atributos(args: string): string[] {
  const saida: string[] = [];
  let nivel = 0;
  let aspas: string | null = null;
  let inicio = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (aspas) {
      if (c === aspas) {
        if (aspas === "'" && args[i + 1] === "'") {
          i++;
          continue;
        }
        aspas = null;
      }
      continue;
    }
    if (c === "'" || c === '"') aspas = c;
    else if (c === "(") nivel++;
    else if (c === ")") nivel--;
    else if (c === "," && nivel === 0) {
      saida.push(args.slice(inicio, i).trim());
      inicio = i + 1;
    }
  }
  saida.push(args.slice(inicio).trim());
  return saida;
}

export function trocarReferencias(texto: string, novoId: (id: number) => number): string {
  let saida = "";
  let inicio = 0;
  let aspas: string | null = null;
  let comentario = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comentario) {
      if (c === "*" && texto[i + 1] === "/") {
        comentario = false;
        i++;
      }
      continue;
    }
    if (aspas) {
      if (c === aspas) {
        if (aspas === "'" && texto[i + 1] === "'") {
          i++;
          continue;
        }
        aspas = null;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      aspas = c;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      comentario = true;
      i++;
      continue;
    }
    if (c === "#") {
      let j = i + 1;
      while (j < texto.length && texto.charCodeAt(j) >= 48 && texto.charCodeAt(j) <= 57) j++;
      if (j > i + 1) {
        saida += texto.slice(inicio, i) + "#" + novoId(Number(texto.slice(i + 1, j)));
        inicio = j;
        i = j - 1;
      }
    }
  }
  return saida + texto.slice(inicio);
}

export function referencias(texto: string): number[] {
  const achadas: number[] = [];
  trocarReferencias(texto, (n) => {
    achadas.push(n);
    return n;
  });
  return achadas;
}

/** Literal STEP: ASCII puro; fora do ASCII vira \X2\HHHH\X0\ (ISO-10303-21 §6.4.3.3). */
export function textoStep(s: string): string {
  let saida = "";
  let hex = "";
  const fecharHex = () => {
    if (hex) {
      saida += `\\X2\\${hex}\\X0\\`;
      hex = "";
    }
  };
  for (const c of s) {
    const code = c.charCodeAt(0);
    if (code > 126 || code < 32) {
      hex += code.toString(16).toUpperCase().padStart(4, "0");
      continue;
    }
    fecharHex();
    saida += c === "'" ? "''" : c === "\\" ? "\\\\" : c;
  }
  fecharHex();
  return `'${saida}'`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/coordenacao/federado/step.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/federado/step.ts src/modules/coordenacao/federado/step.test.ts
git commit -m "feat(coordenacao): leitor STEP em pedaços para o IFC federado"
git show --stat HEAD
```

---

### Task 2: Fixture de IFC e analisador

**Modelo:** implementa **Opus**, revisa **Opus** — resolução da unidade pelo `UnitsInContext` (moeda e unidade derivada na atribuição, pés com `IfcSIUnit` solto).

**Files:**
- Create: `src/modules/coordenacao/federado/fixture-ifc.ts`
- Create: `src/modules/coordenacao/federado/analise.ts`
- Test: `src/modules/coordenacao/federado/analise.test.ts`

**Interfaces:**
- Consumes: `LeitorStep`, `lerInstancia`, `idDaInstrucao`, `atributos`, `referencias`, `palavraDaInstrucao` (Task 1).
- Produces:
  - `ifcDeTeste(o?: { semente?: string; schema?: string; unidade?: "MILLI" | "METRE" | "FOOT"; dx?: number }): string`
    — IFC4 mínimo válido (projeto → site → edifício → pavimento → uma parede extrudada). GlobalIds derivados de
    `semente` (padrão `"A"`); mesma semente = mesmos GlobalIds.
  - `type AnaliseIfc = { schema: string | null; viewDefinition: string | null; projetoId: number | null; projetos: number; contextosRaiz: number[]; unidade: string | null; maiorId: number; guids: string[] }`
  - `class AnalisadorIfc { instrucao(instr: string): void; unidadeResolvida(): boolean; resultado(): AnaliseIfc }`
  - `type FonteIfc = () => AsyncIterable<string>` (pode ser lida mais de uma vez)
  - `analisarFonte(fonte: FonteIfc): Promise<AnaliseIfc>`
  - `fonteDeTexto(texto: string, tamanhoPedaco?: number): FonteIfc` (para testes e smoke)

`unidade` é o rótulo canônico: `"MILLI METRE"`, `"METRE"`, `"CENTI METRE"`, `"FOOT"`… e `null` quando o
projeto não declara unidade de comprimento.

- [ ] **Step 1: Escrever a fixture (é dado de teste, não regra)**

```ts
// src/modules/coordenacao/federado/fixture-ifc.ts
/**
 * IFC4 mínimo e VÁLIDO para testes e smoke do federado: projeto → site → edifício → pavimento → uma parede
 * extrudada. Os GlobalIds saem da `semente` (mesma semente em dois arquivos = GlobalIds repetidos de propósito).
 * O nome da parede tem `''`, `;`, `#` e parênteses dentro da string — o pior caso para o leitor STEP.
 */
export function ifcDeTeste(o: { semente?: string; schema?: string; unidade?: "MILLI" | "METRE" | "FOOT"; dx?: number } = {}): string {
  const semente = o.semente ?? "A";
  const schema = o.schema ?? "IFC4";
  const unidade = o.unidade ?? "MILLI";
  const dx = (o.dx ?? 0).toFixed(1);
  const guid = (n: number) => `${semente}${n}`.padEnd(22, "A").slice(0, 22);

  const unidades =
    unidade === "FOOT"
      ? [
          "#4=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);",
          "#5=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#6);",
          "#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", // solto: NÃO é a unidade do projeto
          "#2=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'FOOT',#5);",
        ]
      : [`#2=IFCSIUNIT(*,.LENGTHUNIT.,${unidade === "MILLI" ? ".MILLI." : "$"},.METRE.);`];

  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('teste-${semente}.ifc','2026-10-04T00:00:00',(''),(''),'','','');`,
    `FILE_SCHEMA(('${schema}'));`,
    "ENDSEC;",
    "DATA;",
    `#1=IFCPROJECT('${guid(1)}',$,'Projeto ${semente}',$,$,$,$,(#11),#7);`,
    ...unidades,
    "#3=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);",
    // Revit põe moeda e unidades derivadas na atribuição, ANTES da de comprimento: o analisador tem de pular.
    "#13=IFCMONETARYUNIT('BRL');",
    "#7=IFCUNITASSIGNMENT((#13,#2,#3));",
    "#8=IFCCARTESIANPOINT((0.,0.,0.));",
    "#9=IFCDIRECTION((0.,0.,1.));",
    "#10=IFCAXIS2PLACEMENT3D(#8,$,$);",
    "#11=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#10,$);",
    "#12=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#11,$,.MODEL_VIEW.,$);",
    `#20=IFCSITE('${guid(20)}',$,'Terreno',$,$,#21,$,$,.ELEMENT.,$,$,$,$,$);`,
    "#21=IFCLOCALPLACEMENT($,#10);",
    `#22=IFCRELAGGREGATES('${guid(22)}',$,$,$,#1,(#20));`,
    `#23=IFCBUILDING('${guid(23)}',$,'Edificio',$,$,#24,$,$,.ELEMENT.,$,$,$);`,
    "#24=IFCLOCALPLACEMENT(#21,#10);",
    `#25=IFCRELAGGREGATES('${guid(25)}',$,$,$,#20,(#23));`,
    `#26=IFCBUILDINGSTOREY('${guid(26)}',$,'Terreo',$,$,#27,$,$,.ELEMENT.,0.);`,
    "#27=IFCLOCALPLACEMENT(#24,#10);",
    `#28=IFCRELAGGREGATES('${guid(28)}',$,$,$,#23,(#26));`,
    `#30=IFCWALL('${guid(30)}',$,'Parede ''A''; com #99 e (parenteses)',$,$,#31,#35,$,$);`,
    "#31=IFCLOCALPLACEMENT(#27,#32);",
    "#32=IFCAXIS2PLACEMENT3D(#33,$,$);",
    `#33=IFCCARTESIANPOINT((${dx},0.,0.));`,
    "#34=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4000.,200.);",
    "#36=IFCEXTRUDEDAREASOLID(#34,$,#9,3000.);",
    "#37=IFCSHAPEREPRESENTATION(#12,'Body','SweptSolid',(#36));",
    "#35=IFCPRODUCTDEFINITIONSHAPE($,$,(#37));",
    `#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(40)}',$,$,$,(#30),#26);`,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}
```

- [ ] **Step 2: Escrever os testes do analisador**

```ts
// src/modules/coordenacao/federado/analise.test.ts
import { describe, expect, it } from "vitest";
import { AnalisadorIfc, analisarFonte, fonteDeTexto } from "./analise";
import { ifcDeTeste } from "./fixture-ifc";
import { LeitorStep } from "./step";

describe("analisarFonte", () => {
  it("lê schema, projeto, contextos, unidade, maior id e GlobalIds", async () => {
    const a = await analisarFonte(fonteDeTexto(ifcDeTeste(), 13));
    expect(a.schema).toBe("IFC4");
    expect(a.viewDefinition).toBe("ViewDefinition [CoordinationView]");
    expect(a.projetoId).toBe(1);
    expect(a.projetos).toBe(1);
    expect(a.contextosRaiz).toEqual([11]);
    expect(a.unidade).toBe("MILLI METRE");
    expect(a.maiorId).toBe(40);
    // GlobalIds de tudo que é IfcRoot, menos o do projeto (o projeto secundário some na junção).
    expect(a.guids).toHaveLength(8);
    expect(a.guids).not.toContain("A1".padEnd(22, "A"));
  });

  it("metro sem prefixo", async () => {
    expect((await analisarFonte(fonteDeTexto(ifcDeTeste({ unidade: "METRE" })))).unidade).toBe("METRE");
  });

  it("pés: vale a unidade do projeto, não o IfcSIUnit de comprimento solto no arquivo", async () => {
    expect((await analisarFonte(fonteDeTexto(ifcDeTeste({ unidade: "FOOT" })))).unidade).toBe("FOOT");
  });

  it("schema declarado no cabeçalho, como veio", async () => {
    expect((await analisarFonte(fonteDeTexto(ifcDeTeste({ schema: "IFC2X3" })))).schema).toBe("IFC2X3");
  });
});

describe("AnalisadorIfc.unidadeResolvida", () => {
  it("só fica verdadeiro depois de projeto, atribuição e unidade de comprimento", () => {
    const an = new AnalisadorIfc();
    const leitor = new LeitorStep();
    const instrucoes = leitor.alimentar(ifcDeTeste());
    let resolvidaEm = -1;
    instrucoes.forEach((instr, i) => {
      an.instrucao(instr);
      if (resolvidaEm < 0 && an.unidadeResolvida()) resolvidaEm = i;
    });
    // #7 (IFCUNITASSIGNMENT) é a última peça a chegar na fixture (a moeda #13 vem antes dela).
    expect(instrucoes[resolvidaEm]).toMatch(/^#7=IFCUNITASSIGNMENT/);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/federado/analise.test.ts`
Expected: FAIL — "Failed to resolve import ./analise".

- [ ] **Step 4: Implementar**

```ts
// src/modules/coordenacao/federado/analise.ts
/**
 * Análise de um IFC para a junção (spec 2026-10-04 §5.1) — PURO. Uma passada pelas instruções coleta o que a
 * escrita precisa: schema, o IfcProject e seus contextos, a unidade de comprimento DO PROJETO (resolvida por
 * UnitsInContext → IfcUnitAssignment → unidade, nunca "o primeiro IfcSIUnit achado"), o maior #id e os
 * GlobalIds (aviso de repetidos). Só as poucas instâncias de unidade/projeto ficam em memória.
 */
import { LeitorStep, atributos, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias, type Instancia } from "./step";

export type AnaliseIfc = {
  schema: string | null;
  viewDefinition: string | null;
  projetoId: number | null;
  /** Quantos IfcProject o arquivo tem (o válido é 1). */
  projetos: number;
  contextosRaiz: number[];
  unidade: string | null;
  maiorId: number;
  guids: string[];
};

export type FonteIfc = () => AsyncIterable<string>;

/**
 * Qualquer tipo que pode estar numa IfcUnitAssignment entra aqui: uma unidade da atribuição que não está no mapa é
 * lida como "ainda não chegou" — se a moeda (IfcMonetaryUnit) ficasse de fora, a unidade nunca se resolveria.
 */
const TIPOS_DE_UNIDADE = new Set([
  "IFCUNITASSIGNMENT",
  "IFCSIUNIT",
  "IFCCONVERSIONBASEDUNIT",
  "IFCCONVERSIONBASEDUNITWITHOFFSET",
  "IFCDERIVEDUNIT",
  "IFCMONETARYUNIT",
  "IFCCONTEXTDEPENDENTUNIT",
]);
const RE_GUID = /^'([0-9A-Za-z_$]{22})'/;

function enumDe(attr: string | undefined): string | null {
  const m = /^\.([A-Z0-9_]+)\.$/i.exec((attr ?? "").trim());
  return m ? m[1].toUpperCase() : null;
}

function stringDe(attr: string | undefined): string | null {
  const m = /^'((?:[^']|'')*)'$/.exec((attr ?? "").trim());
  return m ? m[1].replace(/''/g, "'") : null;
}

export class AnalisadorIfc {
  private schema: string | null = null;
  private viewDefinition: string | null = null;
  private projeto: Instancia | null = null;
  private projetos = 0;
  private unidades = new Map<number, Instancia>();
  private maiorId = 0;
  private guids: string[] = [];

  instrucao(instr: string): void {
    const id = idDaInstrucao(instr);
    if (id === null) {
      const palavra = palavraDaInstrucao(instr);
      if (palavra === "FILE_SCHEMA") this.schema = /\(\s*\(\s*'([^']+)'/.exec(instr)?.[1] ?? null;
      else if (palavra === "FILE_DESCRIPTION") this.viewDefinition = /'(ViewDefinition\s*\[[^']*\])'/i.exec(instr)?.[1] ?? null;
      return;
    }
    if (id > this.maiorId) this.maiorId = id;
    const inst = lerInstancia(instr);
    if (!inst) return;
    if (inst.tipo === "IFCPROJECT") {
      this.projetos++;
      if (!this.projeto) this.projeto = inst;
      return;
    }
    if (TIPOS_DE_UNIDADE.has(inst.tipo)) this.unidades.set(inst.id, inst);
    const guid = RE_GUID.exec(inst.args);
    if (guid) this.guids.push(guid[1]);
  }

  /** Rótulo da unidade de comprimento do projeto, `undefined` enquanto faltar peça para saber. */
  private unidadeDoProjeto(): string | null | undefined {
    if (!this.projeto) return undefined;
    const ref = referencias(atributos(this.projeto.args)[8] ?? "")[0];
    if (ref === undefined) return null; // projeto sem UnitsInContext
    const atribuicao = this.unidades.get(ref);
    if (!atribuicao) return undefined;
    for (const uid of referencias(atributos(atribuicao.args)[0] ?? "")) {
      const u = this.unidades.get(uid);
      if (!u) return undefined;
      const a = atributos(u.args);
      if (enumDe(a[1]) !== "LENGTHUNIT") continue;
      if (u.tipo === "IFCSIUNIT") {
        const prefixo = enumDe(a[2]);
        const nome = enumDe(a[3]) ?? "METRE";
        return prefixo ? `${prefixo} ${nome}` : nome;
      }
      return (stringDe(a[2]) ?? "").toUpperCase() || null;
    }
    return null;
  }

  unidadeResolvida(): boolean {
    return this.unidadeDoProjeto() !== undefined;
  }

  resultado(): AnaliseIfc {
    const contextos = this.projeto ? referencias(atributos(this.projeto.args)[7] ?? "") : [];
    return {
      schema: this.schema,
      viewDefinition: this.viewDefinition,
      projetoId: this.projeto?.id ?? null,
      projetos: this.projetos,
      contextosRaiz: contextos,
      unidade: this.unidadeDoProjeto() ?? null,
      maiorId: this.maiorId,
      guids: this.guids,
    };
  }
}

export async function analisarFonte(fonte: FonteIfc): Promise<AnaliseIfc> {
  const leitor = new LeitorStep();
  const analisador = new AnalisadorIfc();
  for await (const pedaco of fonte()) for (const instr of leitor.alimentar(pedaco)) analisador.instrucao(instr);
  for (const instr of leitor.finalizar()) analisador.instrucao(instr);
  return analisador.resultado();
}

export function fonteDeTexto(texto: string, tamanhoPedaco = 64 * 1024): FonteIfc {
  return async function* () {
    for (let i = 0; i < texto.length; i += tamanhoPedaco) yield texto.slice(i, i + tamanhoPedaco);
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/modules/coordenacao/federado/`
Expected: PASS (step + analise).

- [ ] **Step 6: Commit**

```bash
git add src/modules/coordenacao/federado/fixture-ifc.ts src/modules/coordenacao/federado/analise.ts src/modules/coordenacao/federado/analise.test.ts
git commit -m "feat(coordenacao): análise de IFC (schema, unidade, projeto) para o federado"
git show --stat HEAD
```

---

### Task 3: Montagem do arquivo federado

**Modelo:** implementa **Opus**, revisa **Opus** — renumeração, projeto absorvido e contextos: o coração da junção.

**Files:**
- Create: `src/modules/coordenacao/federado/montagem.ts`
- Test: `src/modules/coordenacao/federado/montagem.test.ts`

**Interfaces:**
- Consumes: Task 1 (`LeitorStep`, `idDaInstrucao`, `lerInstancia`, `atributos`, `referencias`, `trocarReferencias`, `palavraDaInstrucao`, `textoStep`), Task 2 (`AnaliseIfc`, `FonteIfc`, `analisarFonte`, `fonteDeTexto`, `ifcDeTeste`).
- Produces:
  - `type PlanoJuncao = { offsets: number[]; projetoMestre: number; contextosExtras: number[] }`
  - `planejarJuncao(analises: AnaliseIfc[]): PlanoJuncao` — lança `Error` se o mestre não tem `IfcProject`.
  - `transformarInstancia(instr: string, indice: number, analise: AnaliseIfc, plano: PlanoJuncao): string | null` — `null` = não escrever (projeto absorvido).
  - `type CabecalhoFederado = { nomeArquivo: string; autor: string; quando: string; composicao: { nome: string; grupo: string; revisao: string }[] }`
  - `textoCabecalho(c: CabecalhoFederado, mestre: AnaliseIfc): string`
  - `escreverFederado(fontes: FonteIfc[], analises: AnaliseIfc[], cabecalho: CabecalhoFederado): AsyncGenerator<string>`
  - `avisoGuidsRepetidos(analises: AnaliseIfc[], rotulos: string[]): string | null`

- [ ] **Step 1: Escrever os testes**

```ts
// src/modules/coordenacao/federado/montagem.test.ts
import { describe, expect, it } from "vitest";
import { analisarFonte, fonteDeTexto } from "./analise";
import { ifcDeTeste } from "./fixture-ifc";
import { avisoGuidsRepetidos, escreverFederado, planejarJuncao, type CabecalhoFederado } from "./montagem";
import { LeitorStep, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias } from "./step";

const CAB: CabecalhoFederado = {
  nomeArquivo: "26.001-FEDERADO-R00.ifc",
  autor: "Fulana Elétrica",
  quando: "2026-10-04T10:00:00",
  composicao: [
    { nome: "est.ifc", grupo: "Estrutural", revisao: "R02" },
    { nome: "ele.ifc", grupo: "Elétrica", revisao: "R00" },
  ],
};

async function juntar(textos: string[], tamanho = 17): Promise<string> {
  const fontes = textos.map((t) => fonteDeTexto(t, tamanho));
  const analises = [];
  for (const f of fontes) analises.push(await analisarFonte(f));
  let saida = "";
  for await (const pedaco of escreverFederado(fontes, analises, CAB)) saida += pedaco;
  return saida;
}

function instrucoes(texto: string): string[] {
  const l = new LeitorStep();
  return [...l.alimentar(texto), ...l.finalizar()];
}

describe("planejarJuncao", () => {
  it("desloca cada modelo pela soma dos maiores ids anteriores e junta os contextos no mestre", async () => {
    const a = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "A" })));
    const b = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "B" })));
    expect(planejarJuncao([a, b, a])).toEqual({ offsets: [0, 40, 80], projetoMestre: 1, contextosExtras: [51, 91] });
  });
});

describe("escreverFederado", () => {
  it("um só IfcProject, todas as paredes, nenhuma referência pendente", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B", dx: 5000 })]);
    const todas = instrucoes(texto);
    const instancias = todas.map(lerInstancia).filter((i) => i !== null);
    expect(instancias.filter((i) => i.tipo === "IFCPROJECT")).toHaveLength(1);
    expect(instancias.filter((i) => i.tipo === "IFCWALL")).toHaveLength(2);

    const definidos = new Set(todas.map(idDaInstrucao).filter((n) => n !== null));
    const pendentes = todas.flatMap((i) => referencias(i)).filter((r) => !definidos.has(r));
    expect(pendentes).toEqual([]);
    // os dois sites pendurados no mesmo projeto
    const aggProjeto = instancias.filter((i) => i.tipo === "IFCRELAGGREGATES" && /,\$,\$,\$,#1,/.test(i.args));
    expect(aggProjeto).toHaveLength(2);
  });

  it("o projeto mestre leva os contextos dos outros modelos", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B" })]);
    const projeto = instrucoes(texto).map(lerInstancia).find((i) => i?.tipo === "IFCPROJECT");
    expect(projeto?.args).toContain("(#11,#51)");
  });

  it("strings saem byte a byte, sem renumerar o #99 do nome", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B" })], 1);
    expect(texto.match(/'Parede ''A''; com #99 e \(parenteses\)'/g)).toHaveLength(2);
  });

  it("cabeçalho com schema do mestre, view definition e a composição em ASCII", async () => {
    const texto = await juntar([ifcDeTeste({ semente: "A" }), ifcDeTeste({ semente: "B" })]);
    const palavras = instrucoes(texto).map(palavraDaInstrucao);
    expect(palavras.slice(0, 7)).toEqual(["ISO-10303-21", "HEADER", "FILE_DESCRIPTION", "FILE_NAME", "FILE_SCHEMA", "ENDSEC", "DATA"]);
    expect(palavras.slice(-2)).toEqual(["ENDSEC", "END-ISO-10303-21"]);
    expect(texto).toContain("FILE_SCHEMA(('IFC4'))");
    expect(texto).toContain("'ViewDefinition [CoordinationView]'");
    expect(texto).toContain("'Modelo: ele.ifc (El\\X2\\00E9\\X0\\trica, R00)'");
    expect(/[^\x00-\x7F]/.test(texto)).toBe(false);
  });
});

describe("avisoGuidsRepetidos", () => {
  it("conta os GlobalIds que aparecem em mais de um modelo e diz em quais", async () => {
    const a = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "A" })));
    const a2 = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "A" })));
    const b = await analisarFonte(fonteDeTexto(ifcDeTeste({ semente: "B" })));
    expect(avisoGuidsRepetidos([a, b], ["Estrutural", "Elétrica"])).toBeNull();
    expect(avisoGuidsRepetidos([a, b, a2], ["Estrutural", "Elétrica", "Recebido do cliente"])).toBe(
      "8 elementos com GlobalId repetido entre Estrutural e Recebido do cliente. Visualizadores podem mostrar só um deles.",
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/federado/montagem.test.ts`
Expected: FAIL — "Failed to resolve import ./montagem".

- [ ] **Step 3: Implementar**

```ts
// src/modules/coordenacao/federado/montagem.ts
/**
 * Escrita do IFC federado (spec 2026-10-04 §5.2) — PURO, em streaming. O modelo i soma offsets[i] a cada #id;
 * o IfcProject dos modelos não-mestre não é escrito e toda referência a ele vira o projeto mestre (assim o
 * IfcRelAggregates de cada modelo pendura o seu IfcSite no projeto único); o projeto mestre ganha os contextos
 * raiz dos outros. O resto é copiado como veio — geometria e posições byte a byte.
 */
import type { AnaliseIfc, FonteIfc } from "./analise";
import { LeitorStep, atributos, idDaInstrucao, lerInstancia, palavraDaInstrucao, referencias, textoStep, trocarReferencias } from "./step";

export type PlanoJuncao = { offsets: number[]; projetoMestre: number; contextosExtras: number[] };

export type CabecalhoFederado = {
  nomeArquivo: string;
  autor: string;
  /** `AAAA-MM-DDTHH:MM:SS`, sem fuso (formato do FILE_NAME). */
  quando: string;
  composicao: { nome: string; grupo: string; revisao: string }[];
};

export function planejarJuncao(analises: AnaliseIfc[]): PlanoJuncao {
  const mestre = analises[0];
  if (!mestre || mestre.projetoId === null) throw new Error("O primeiro modelo não tem IfcProject.");
  const offsets: number[] = [];
  let soma = 0;
  for (const a of analises) {
    offsets.push(soma);
    soma += a.maiorId;
  }
  const contextosExtras = analises.slice(1).flatMap((a, i) => a.contextosRaiz.map((c) => c + offsets[i + 1]));
  return { offsets, projetoMestre: mestre.projetoId, contextosExtras };
}

function comContextosExtras(instr: string, extras: number[]): string {
  const inst = lerInstancia(instr);
  if (!inst) return instr;
  const attrs = atributos(inst.args);
  const atuais = referencias(attrs[7] ?? "");
  attrs[7] = `(${[...atuais, ...extras].map((n) => `#${n}`).join(",")})`;
  return `#${inst.id}=${inst.tipo}(${attrs.join(",")})`;
}

export function transformarInstancia(instr: string, indice: number, analise: AnaliseIfc, plano: PlanoJuncao): string | null {
  const id = idDaInstrucao(instr);
  if (id === null) return null;
  if (indice > 0 && id === analise.projetoId) return null;
  const offset = plano.offsets[indice];
  const texto = trocarReferencias(instr, (n) => (indice > 0 && n === analise.projetoId ? plano.projetoMestre : n + offset));
  if (indice === 0 && id === plano.projetoMestre && plano.contextosExtras.length > 0) {
    return comContextosExtras(texto, plano.contextosExtras);
  }
  return texto;
}

export function textoCabecalho(c: CabecalhoFederado, mestre: AnaliseIfc): string {
  const descricao = [
    mestre.viewDefinition ?? "ViewDefinition [CoordinationView]",
    `SenaHub: modelo federado de ${c.composicao.length} modelos`,
    ...c.composicao.map((m) => `Modelo: ${m.nome} (${m.grupo}, ${m.revisao})`),
  ];
  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION((${descricao.map(textoStep).join(",")}),'2;1');`,
    `FILE_NAME(${textoStep(c.nomeArquivo)},${textoStep(c.quando)},(${textoStep(c.autor)}),('SenaHub'),'SenaHub','SenaHub','');`,
    `FILE_SCHEMA((${textoStep(mestre.schema ?? "IFC4")}));`,
    "ENDSEC;",
    "DATA;",
    "",
  ].join("\n");
}

export async function* escreverFederado(
  fontes: FonteIfc[],
  analises: AnaliseIfc[],
  cabecalho: CabecalhoFederado,
): AsyncGenerator<string> {
  const plano = planejarJuncao(analises);
  yield textoCabecalho(cabecalho, analises[0]);
  for (let i = 0; i < fontes.length; i++) {
    const leitor = new LeitorStep();
    let emDados = false;
    const escrever = (instr: string): string => {
      const palavra = palavraDaInstrucao(instr);
      if (palavra === "DATA") {
        emDados = true;
        return "";
      }
      if (palavra === "ENDSEC") {
        emDados = false;
        return "";
      }
      if (!emDados) return "";
      const t = transformarInstancia(instr, i, analises[i], plano);
      return t === null ? "" : `${t};\n`;
    };
    for await (const pedaco of fontes[i]()) {
      let lote = "";
      for (const instr of leitor.alimentar(pedaco)) lote += escrever(instr);
      if (lote) yield lote;
    }
    let resto = "";
    for (const instr of leitor.finalizar()) resto += escrever(instr);
    if (resto) yield resto;
  }
  yield "ENDSEC;\nEND-ISO-10303-21;\n";
}

export function avisoGuidsRepetidos(analises: AnaliseIfc[], rotulos: string[]): string | null {
  const donos = new Map<string, Set<number>>();
  analises.forEach((a, i) => {
    for (const g of new Set(a.guids)) {
      const s = donos.get(g) ?? new Set<number>();
      s.add(i);
      donos.set(g, s);
    }
  });
  let total = 0;
  const envolvidos = new Set<number>();
  for (const s of donos.values()) {
    if (s.size < 2) continue;
    total++;
    for (const i of s) envolvidos.add(i);
  }
  if (total === 0) return null;
  const nomes = [...envolvidos].sort((x, y) => x - y).map((i) => rotulos[i]);
  const lista = nomes.length === 2 ? nomes.join(" e ") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
  return `${total} elemento${total === 1 ? "" : "s"} com GlobalId repetido entre ${lista}. Visualizadores podem mostrar só um deles.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/coordenacao/federado/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/federado/montagem.ts src/modules/coordenacao/federado/montagem.test.ts
git commit -m "feat(coordenacao): montagem do IFC federado com projeto único"
git show --stat HEAD
```

---

### Task 4: Regras de elegibilidade

**Modelo:** implementa **Sonnet**, revisa **Sonnet** — regras puras com código e testes prontos no plano.

**Files:**
- Create: `src/modules/coordenacao/federado/regras.ts`
- Test: `src/modules/coordenacao/federado/regras.test.ts`

**Interfaces:**
- Consumes: `TAMANHO_MAX_IFC` de `@/modules/coordenacao/conversao-estado` (puro).
- Produces:
  - `FILA_FEDERAR_IFC = "gerar-ifc-federado"`, `GRUPO_FEDERADO = "Modelo federado"`, `MINUTOS_GERACAO_TRAVADA = 45`
  - `type FamiliaSchema = "IFC2X3" | "IFC4" | "IFC4X3"`; `familiaDoSchema(schema: string | null): FamiliaSchema | null`
  - `rotuloUnidade(u: string | null): string`
  - `type CandidatoFederado = { modeloId: string; nome: string; grupo: string; revisao: string; tamanho: number; convertido: boolean; arquivoExiste: boolean; schema: string | null; unidade: string | null | undefined }` (`unidade: undefined` = não deu para ler na inspeção — não bloqueia)
  - `type AvaliacaoSelecao = { motivos: Record<string, string | null>; validos: string[]; podeGerar: boolean; motivoGerar: string | null; totalBytes: number }`
  - `avaliarSelecao(candidatos: CandidatoFederado[], marcados: readonly string[]): AvaliacaoSelecao`
  - `conflitoEntreAnalises(itens: { rotulo: string; schema: string | null; unidade: string | null; projetos: number }[]): string | null`
  - `type SaidaFederar = { ok: true; tamanho: number; sha256: string; avisos: string[] } | { ok: false; erro: string }`
  - `lerSaidaDoFilho(stdout: string): SaidaFederar | null`
  - `motivoIntrinseco(c: CandidatoFederado): string | null`
  - mensagens exportadas: `MOTIVO_NAO_CONVERTIDO`, `MOTIVO_ARQUIVO_SUMIU`, `MOTIVO_CABECALHO`, `MOTIVO_POUCOS`

- [ ] **Step 1: Escrever os testes**

```ts
// src/modules/coordenacao/federado/regras.test.ts
import { describe, expect, it } from "vitest";
import {
  MOTIVO_ARQUIVO_SUMIU, MOTIVO_CABECALHO, MOTIVO_NAO_CONVERTIDO, MOTIVO_POUCOS,
  avaliarSelecao, conflitoEntreAnalises, familiaDoSchema, lerSaidaDoFilho, rotuloUnidade, type CandidatoFederado,
} from "./regras";

const GB = 1024 ** 3;
const c = (modeloId: string, o: Partial<CandidatoFederado> = {}): CandidatoFederado => ({
  modeloId, nome: `${modeloId}.ifc`, grupo: "Estrutural", revisao: "R00", tamanho: 1000,
  convertido: true, arquivoExiste: true, schema: "IFC4", unidade: "MILLI METRE", ...o,
});

describe("familiaDoSchema / rotuloUnidade", () => {
  it("agrupa variantes do schema", () => {
    expect(familiaDoSchema("IFC4X3_ADD2")).toBe("IFC4X3");
    expect(familiaDoSchema("ifc4")).toBe("IFC4");
    expect(familiaDoSchema("IFC2X3")).toBe("IFC2X3");
    expect(familiaDoSchema("IFC5")).toBeNull();
    expect(familiaDoSchema(null)).toBeNull();
  });
  it("unidade por extenso", () => {
    expect(rotuloUnidade("MILLI METRE")).toBe("milímetros");
    expect(rotuloUnidade("METRE")).toBe("metros");
    expect(rotuloUnidade("FOOT")).toBe("pés");
    expect(rotuloUnidade(null)).toBe("unidade não declarada");
  });
});

describe("avaliarSelecao", () => {
  it("motivos intrínsecos valem marcado ou não", () => {
    const r = avaliarSelecao(
      [c("a", { convertido: false }), c("b", { arquivoExiste: false }), c("d", { schema: null }), c("e")],
      [],
    );
    expect(r.motivos).toEqual({ a: MOTIVO_NAO_CONVERTIDO, b: MOTIVO_ARQUIVO_SUMIU, d: MOTIVO_CABECALHO, e: null });
  });

  it("o primeiro marcado válido dita schema e unidade", () => {
    const r = avaliarSelecao(
      [c("a"), c("b", { schema: "IFC2X3" }), c("d", { unidade: "METRE" }), c("e", { unidade: undefined })],
      ["a", "b", "d", "e"],
    );
    expect(r.motivos.b).toBe("IFC2X3 — os marcados são IFC4. Exporte de novo em IFC4.");
    expect(r.motivos.d).toBe("Em metros — os marcados estão em milímetros. Exporte de novo na mesma unidade.");
    expect(r.motivos.e).toBeNull();
    expect(r.validos).toEqual(["a", "e"]);
    expect(r.podeGerar).toBe(true);
  });

  it("desmarcar o primeiro passa o papel ao próximo", () => {
    const r = avaliarSelecao([c("a"), c("b", { unidade: "METRE" }), c("d", { unidade: "METRE" })], ["b", "d"]);
    expect(r.motivos.a).toBe("Em milímetros — os marcados estão em metros. Exporte de novo na mesma unidade.");
    expect(r.validos).toEqual(["b", "d"]);
  });

  it("precisa de dois e respeita o limite de tamanho", () => {
    expect(avaliarSelecao([c("a"), c("b")], ["a"]).motivoGerar).toBe(MOTIVO_POUCOS);
    const grande = avaliarSelecao([c("a", { tamanho: 1.5 * GB }), c("b", { tamanho: 1 * GB })], ["a", "b"]);
    expect(grande.podeGerar).toBe(false);
    expect(grande.motivoGerar).toBe("Os modelos marcados somam 2,5 GB; o limite é 2 GB. Desmarque algum modelo.");
  });
});

describe("conflitoEntreAnalises", () => {
  it("confere de novo no arquivo inteiro (o child é a palavra final)", () => {
    expect(conflitoEntreAnalises([
      { rotulo: "est.ifc", schema: "IFC4", unidade: "MILLI METRE", projetos: 1 },
      { rotulo: "ele.ifc", schema: "IFC4", unidade: "METRE", projetos: 1 },
    ])).toBe("ele.ifc está em metros e est.ifc em milímetros. Exporte de novo na mesma unidade.");
    expect(conflitoEntreAnalises([{ rotulo: "x.ifc", schema: "IFC4", unidade: null, projetos: 2 }]))
      .toBe("x.ifc tem 2 IfcProject; um IFC válido tem um só.");
    expect(conflitoEntreAnalises([
      { rotulo: "a.ifc", schema: "IFC4", unidade: "METRE", projetos: 1 },
      { rotulo: "b.ifc", schema: "IFC2X3", unidade: "METRE", projetos: 1 },
    ])).toBe("b.ifc é IFC2X3 e a.ifc é IFC4. Exporte de novo em IFC4.");
  });
});

describe("lerSaidaDoFilho", () => {
  it("pega a última linha JSON com ok", () => {
    expect(lerSaidaDoFilho('ruído\n{"ok":true,"tamanho":10,"sha256":"ab","avisos":[]}\n')).toEqual({
      ok: true, tamanho: 10, sha256: "ab", avisos: [],
    });
    expect(lerSaidaDoFilho('{"ok":false,"erro":"x"}')).toEqual({ ok: false, erro: "x" });
    expect(lerSaidaDoFilho("nada")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/federado/regras.test.ts`
Expected: FAIL — "Failed to resolve import ./regras".

- [ ] **Step 3: Implementar**

```ts
// src/modules/coordenacao/federado/regras.ts
/**
 * Regras do IFC federado (spec 2026-10-04 §4) — PURO. A mesma função decide o que o diálogo desabilita, o que
 * a action recusa e o que o job confere; a frase é a mesma nos três lugares.
 */
import { TAMANHO_MAX_IFC } from "@/modules/coordenacao/conversao-estado";

export const FILA_FEDERAR_IFC = "gerar-ifc-federado";
export const GRUPO_FEDERADO = "Modelo federado";
export const MINUTOS_GERACAO_TRAVADA = 45;

export const MOTIVO_NAO_CONVERTIDO = "Este modelo ainda não foi convertido. Aguarde ou reconverta na lista de modelos.";
export const MOTIVO_ARQUIVO_SUMIU = "O arquivo IFC deste modelo não está mais no servidor.";
export const MOTIVO_CABECALHO = "Não foi possível ler o cabeçalho deste IFC.";
export const MOTIVO_POUCOS = "Marque pelo menos dois modelos.";

export type FamiliaSchema = "IFC2X3" | "IFC4" | "IFC4X3";

export function familiaDoSchema(schema: string | null): FamiliaSchema | null {
  const s = (schema ?? "").toUpperCase();
  if (s.startsWith("IFC4X3")) return "IFC4X3";
  if (s.startsWith("IFC4")) return "IFC4";
  if (s.startsWith("IFC2X3")) return "IFC2X3";
  return null;
}

const UNIDADES: Record<string, string> = {
  "MILLI METRE": "milímetros",
  "CENTI METRE": "centímetros",
  "DECI METRE": "decímetros",
  METRE: "metros",
  "KILO METRE": "quilômetros",
  FOOT: "pés",
  INCH: "polegadas",
};

export function rotuloUnidade(u: string | null): string {
  if (u === null) return "unidade não declarada";
  return UNIDADES[u] ?? u.toLowerCase();
}

export type CandidatoFederado = {
  modeloId: string;
  nome: string;
  grupo: string;
  revisao: string;
  tamanho: number;
  convertido: boolean;
  arquivoExiste: boolean;
  schema: string | null;
  /** `undefined` = a inspeção não achou a unidade a tempo; não bloqueia (o job confere no arquivo inteiro). */
  unidade: string | null | undefined;
};

export type AvaliacaoSelecao = {
  motivos: Record<string, string | null>;
  validos: string[];
  podeGerar: boolean;
  motivoGerar: string | null;
  totalBytes: number;
};

/** O que impede o modelo sozinho, marcado ou não (o diálogo desabilita o checkbox por isto). */
export function motivoIntrinseco(c: CandidatoFederado): string | null {
  if (!c.convertido) return MOTIVO_NAO_CONVERTIDO;
  if (!c.arquivoExiste) return MOTIVO_ARQUIVO_SUMIU;
  if (familiaDoSchema(c.schema) === null) return MOTIVO_CABECALHO;
  return null;
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

export function avaliarSelecao(candidatos: CandidatoFederado[], marcados: readonly string[]): AvaliacaoSelecao {
  const marcado = new Set(marcados);
  const referencia = candidatos.find((c) => marcado.has(c.modeloId) && motivoIntrinseco(c) === null) ?? null;
  const famRef = referencia ? familiaDoSchema(referencia.schema) : null;
  const motivos: Record<string, string | null> = {};
  for (const c of candidatos) {
    let motivo = motivoIntrinseco(c);
    if (!motivo && referencia && c.modeloId !== referencia.modeloId) {
      const fam = familiaDoSchema(c.schema);
      if (fam !== famRef) motivo = `${fam} — os marcados são ${famRef}. Exporte de novo em ${famRef}.`;
      else if (c.unidade !== undefined && referencia.unidade !== undefined && c.unidade !== referencia.unidade) {
        motivo = `Em ${rotuloUnidade(c.unidade)} — os marcados estão em ${rotuloUnidade(referencia.unidade)}. Exporte de novo na mesma unidade.`;
      }
    }
    motivos[c.modeloId] = motivo;
  }
  const validos = candidatos.filter((c) => marcado.has(c.modeloId) && motivos[c.modeloId] === null).map((c) => c.modeloId);
  const totalBytes = candidatos.filter((c) => validos.includes(c.modeloId)).reduce((s, c) => s + c.tamanho, 0);
  let motivoGerar: string | null = null;
  if (validos.length < 2) motivoGerar = MOTIVO_POUCOS;
  else if (totalBytes > TAMANHO_MAX_IFC) {
    motivoGerar = `Os modelos marcados somam ${gb(totalBytes)}; o limite é ${gb(TAMANHO_MAX_IFC).replace(",0", "")}. Desmarque algum modelo.`;
  }
  return { motivos, validos, podeGerar: motivoGerar === null, motivoGerar, totalBytes };
}

export function conflitoEntreAnalises(
  itens: { rotulo: string; schema: string | null; unidade: string | null; projetos: number }[],
): string | null {
  for (const it of itens) {
    if (it.projetos !== 1) return `${it.rotulo} tem ${it.projetos} IfcProject; um IFC válido tem um só.`;
    if (familiaDoSchema(it.schema) === null) return `${it.rotulo}: ${MOTIVO_CABECALHO}`;
  }
  const [ref, ...resto] = itens;
  for (const it of resto) {
    const fam = familiaDoSchema(it.schema);
    const famRef = familiaDoSchema(ref.schema);
    if (fam !== famRef) return `${it.rotulo} é ${fam} e ${ref.rotulo} é ${famRef}. Exporte de novo em ${famRef}.`;
    if (it.unidade !== ref.unidade) {
      return `${it.rotulo} está em ${rotuloUnidade(it.unidade)} e ${ref.rotulo} em ${rotuloUnidade(ref.unidade)}. Exporte de novo na mesma unidade.`;
    }
  }
  return null;
}

export type SaidaFederar = { ok: true; tamanho: number; sha256: string; avisos: string[] } | { ok: false; erro: string };

export function lerSaidaDoFilho(stdout: string): SaidaFederar | null {
  const linhas = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]) as Record<string, unknown>;
      if (j.ok === true) {
        return { ok: true, tamanho: Number(j.tamanho), sha256: String(j.sha256), avisos: (j.avisos as string[]) ?? [] };
      }
      if (j.ok === false) return { ok: false, erro: String(j.erro ?? "Falha desconhecida.") };
    } catch {
      // linha que não é JSON: segue procurando
    }
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/coordenacao/federado/regras.test.ts`
Expected: PASS. Se "2 GB" sair como "2,0 GB" no motivo de tamanho, o `.replace(",0", "")` está no lugar certo — confira a expectativa literal do teste.

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/federado/regras.ts src/modules/coordenacao/federado/regras.test.ts
git commit -m "feat(coordenacao): regras de elegibilidade do IFC federado"
git show --stat HEAD
```

---

### Task 5: Child process e orquestrador do spawn

**Modelo:** implementa **Sonnet**, revisa **Opus** — segue o padrão do `deslocar-ifc.ts`; o revisor olha backpressure do stream e limpeza do `.parcial`.

**Files:**
- Create: `scripts/federar-ifc.ts`
- Create: `src/modules/coordenacao/federado/federacao.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - Contrato do child: `tsx --tsconfig tsconfig.server.json scripts/federar-ifc.ts <manifestoBase64>`; manifesto =
    `{ entradas: { caminho: string; rotulo: string }[]; saida: string; cabecalho: CabecalhoFederado }` (caminhos
    relativos a `STORAGE_BASE_PATH`); stdout = uma linha `SaidaFederar` em JSON; exit 0/1.
  - `type ManifestoFederar = { entradas: { caminho: string; rotulo: string }[]; saida: string; cabecalho: CabecalhoFederado }`
  - `type SpawnFederar = (manifesto: ManifestoFederar) => Promise<{ code: number | null; stdout: string; stderr: string }>`
  - `spawnFederarReal: SpawnFederar`
  - `federar(manifesto: ManifestoFederar, spawn?: SpawnFederar): Promise<SaidaFederar>` — nunca lança; erro de spawn/timeout vira `{ ok: false, erro }`.

- [ ] **Step 1: Escrever o child**

```ts
// scripts/federar-ifc.ts
/**
 * Junta IFCs num só (modelo federado) — CHILD PROCESS do job `gerar-ifc-federado`, mesmo isolamento do
 * scripts/deslocar-ifc.ts. Lê cada IFC DUAS vezes em streaming (análise, depois escrita), sem web-ifc: a
 * memória fica constante e a geometria sai byte a byte. Lê e escreve em latin1 para preservar os bytes.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/federar-ifc.ts <manifestoBase64>
 * stdout: {"ok":true,"tamanho":N,"sha256":"…","avisos":[…]} | {"ok":false,"erro":"…"}
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { resolverCaminho } from "../src/lib/storage";
import { analisarFonte, type FonteIfc } from "../src/modules/coordenacao/federado/analise";
import { avisoGuidsRepetidos, escreverFederado } from "../src/modules/coordenacao/federado/montagem";
import { conflitoEntreAnalises } from "../src/modules/coordenacao/federado/regras";
import type { ManifestoFederar } from "../src/modules/coordenacao/federado/federacao";

function emitir(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function fonteDoDisco(abs: string): FonteIfc {
  return () => createReadStream(abs, { encoding: "latin1", highWaterMark: 1 << 20 }) as AsyncIterable<string>;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Uso: federar-ifc.ts <manifestoBase64>");
  const manifesto = JSON.parse(Buffer.from(arg, "base64").toString("utf8")) as ManifestoFederar;
  const fontes = manifesto.entradas.map((e) => fonteDoDisco(resolverCaminho(e.caminho)));

  const analises = [];
  for (const f of fontes) analises.push(await analisarFonte(f));
  const conflito = conflitoEntreAnalises(
    analises.map((a, i) => ({ rotulo: manifesto.entradas[i].rotulo, schema: a.schema, unidade: a.unidade, projetos: a.projetos })),
  );
  if (conflito) throw new Error(conflito);

  const saidaAbs = resolverCaminho(manifesto.saida);
  const parcial = `${saidaAbs}.parcial`;
  await fs.mkdir(path.dirname(saidaAbs), { recursive: true });
  const hash = createHash("sha256");
  const out = createWriteStream(parcial);
  let tamanho = 0;
  try {
    let lote = "";
    const descarregar = async () => {
      const buf = Buffer.from(lote, "latin1");
      lote = "";
      hash.update(buf);
      tamanho += buf.length;
      if (!out.write(buf)) await once(out, "drain");
    };
    for await (const pedaco of escreverFederado(fontes, analises, manifesto.cabecalho)) {
      lote += pedaco;
      if (lote.length >= 1 << 20) await descarregar();
    }
    if (lote) await descarregar();
    out.end();
    await once(out, "finish");
    await fs.rename(parcial, saidaAbs);
  } catch (e) {
    out.destroy();
    await fs.rm(parcial, { force: true });
    throw e;
  }

  const aviso = avisoGuidsRepetidos(analises, manifesto.entradas.map((e) => e.rotulo));
  emitir({ ok: true, tamanho, sha256: hash.digest("hex"), avisos: aviso ? [aviso] : [] });
}

main().then(
  () => process.exit(0),
  (e) => {
    emitir({ ok: false, erro: e instanceof Error ? e.message : String(e) });
    process.exit(1);
  },
);
```

- [ ] **Step 2: Escrever o orquestrador**

```ts
// src/modules/coordenacao/federado/federacao.ts
import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import type { CabecalhoFederado } from "./montagem";
import { lerSaidaDoFilho, type SaidaFederar } from "./regras";

/** Manifesto do child `scripts/federar-ifc.ts` (caminhos relativos a STORAGE_BASE_PATH). */
export type ManifestoFederar = {
  entradas: { caminho: string; rotulo: string }[];
  saida: string;
  cabecalho: CabecalhoFederado;
};

export type SpawnFederar = (manifesto: ManifestoFederar) => Promise<{ code: number | null; stdout: string; stderr: string }>;

const TIMEOUT_MS = 30 * 60 * 1000;

/** Mesmo spawn de deslocamento.ts: node + tsx/dist/cli.mjs, sem shell. Manifesto em base64 (sem aspas no Windows). */
export const spawnFederarReal: SpawnFederar = (manifesto) =>
  new Promise((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const arg = Buffer.from(JSON.stringify(manifesto), "utf8").toString("base64");
    const proc = spawn(process.execPath, [tsxCli, "--tsconfig", "tsconfig.server.json", "scripts/federar-ifc.ts", arg], {
      cwd: process.cwd(),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`A geração do modelo federado passou de ${TIMEOUT_MS / 60000} min e foi interrompida.`));
    }, TIMEOUT_MS);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });

export async function federar(manifesto: ManifestoFederar, rodar: SpawnFederar = spawnFederarReal): Promise<SaidaFederar> {
  try {
    const r = await rodar(manifesto);
    const saida = lerSaidaDoFilho(r.stdout);
    if (saida) return saida;
    return { ok: false, erro: `O processo de junção terminou sem resposta (código ${r.code}). ${r.stderr.slice(-300)}`.trim() };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 3: Rodar o child à mão com duas fixtures**

Crie `scripts/tmp-federar-teste.ts` (NÃO vai para o commit; apague no fim):

```ts
import "dotenv/config";
import fs from "node:fs";
import { resolverCaminho } from "../src/lib/storage";
import { ifcDeTeste } from "../src/modules/coordenacao/federado/fixture-ifc";
import { federar } from "../src/modules/coordenacao/federado/federacao";

async function main() {
  const unidadeB = (process.argv[2] ?? "MILLI") as "MILLI" | "METRE";
  fs.mkdirSync(resolverCaminho("tmp/federado-teste"), { recursive: true });
  fs.writeFileSync(resolverCaminho("tmp/federado-teste/a.ifc"), ifcDeTeste({ semente: "A" }), "latin1");
  fs.writeFileSync(resolverCaminho("tmp/federado-teste/b.ifc"), ifcDeTeste({ semente: "B", dx: 5000, unidade: unidadeB }), "latin1");
  const r = await federar({
    entradas: [{ caminho: "tmp/federado-teste/a.ifc", rotulo: "a.ifc" }, { caminho: "tmp/federado-teste/b.ifc", rotulo: "b.ifc" }],
    saida: "tmp/federado-teste/fed.ifc",
    cabecalho: { nomeArquivo: "fed.ifc", autor: "Teste", quando: "2026-10-04T10:00:00", composicao: [] },
  });
  console.log(r, fs.readdirSync(resolverCaminho("tmp/federado-teste")));
}
main();
```

O `federacao.ts` importa `server-only`; o `tsconfig.server.json` faz o shim, então rode com ele:

Run: `npx tsx --tsconfig tsconfig.server.json scripts/tmp-federar-teste.ts`
Expected: `{ ok: true, tamanho: …, sha256: '…', avisos: [] }` e a pasta com `a.ifc, b.ifc, fed.ifc`.

Run: `npx tsx --tsconfig tsconfig.server.json scripts/tmp-federar-teste.ts METRE`
Expected: `{ ok: false, erro: 'b.ifc está em metros e a.ifc em milímetros. Exporte de novo na mesma unidade.' }`
e **nenhum** `fed.ifc.parcial` na listagem (o `fed.ifc` da rodada anterior pode continuar lá).

Apague `scripts/tmp-federar-teste.ts` e `STORAGE_BASE_PATH/tmp/federado-teste`.

- [ ] **Step 4: Typecheck e lint**

Run: `npx eslint scripts/federar-ifc.ts src/modules/coordenacao/federado/`
Expected: sem erros e sem avisos (rodar SEM `--quiet`).

- [ ] **Step 5: Commit**

```bash
git add scripts/federar-ifc.ts src/modules/coordenacao/federado/federacao.ts
git commit -m "feat(coordenacao): processo filho que junta IFCs em streaming"
git show --stat HEAD
```

---

### Task 6: Schema e migração

**Modelo:** implementa **Sonnet**, revisa **Sonnet** — schema + SQL prontos; atenção ao drift do banco de dev (migrate deploy, nunca migrate dev).

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261004120000_ifc_federado/migration.sql`

**Interfaces:**
- Produces: enum `OrigemDocumento.modelo_federado`; model `GeracaoModeloFederado` (`prisma.geracaoModeloFederado`);
  back-relations `Projeto.geracoesModeloFederado`, `DocumentoVersao.geracaoFederado`, `User.geracoesModeloFederado`.

- [ ] **Step 1: Schema**

Em `enum OrigemDocumento` (perto da linha 3410), depois de `base_arquitetonica`:

```prisma
  /// IFC único gerado na Compatibilização (spec 2026-10-04). Só nasce do job `gerar-ifc-federado`; cada
  /// geração é uma versão. Pasta própria no Desenvolvimento, fora de Recebidos — ver documentos-cliente/origens.ts.
  modelo_federado
```

Model novo (perto de `ConversaoModelo`):

```prisma
/// Uma geração do IFC federado (spec 2026-10-04 §7). A composição é congelada na solicitação: diz, para
/// sempre, quais versões entraram em cada revisão. Uma viva por projeto (índice único parcial na migração).
model GeracaoModeloFederado {
  id                String           @id @default(cuid())
  projetoId         String
  projeto           Projeto          @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  /// fila | processando | concluido | erro
  status            String           @default("fila")
  /// [{ modeloId, tipo, refId, caminho, nome, grupo, revisao, tamanho }]
  composicao        Json
  erro              String?
  avisos            Json?
  documentoVersaoId String?          @unique
  documentoVersao   DocumentoVersao? @relation(fields: [documentoVersaoId], references: [id], onDelete: SetNull)
  autorId           String
  autor             User             @relation("GeracaoFederadoAutor", fields: [autorId], references: [id])
  criadoEm          DateTime         @default(now())
  iniciadoEm        DateTime?
  concluidoEm       DateTime?

  @@index([projetoId, criadoEm])
  @@map("geracao_modelo_federado")
}
```

Back-relations: em `model Projeto` → `geracoesModeloFederado GeracaoModeloFederado[]`; em `model DocumentoVersao`
→ `geracaoFederado GeracaoModeloFederado?`; em `model User` → `geracoesModeloFederado GeracaoModeloFederado[] @relation("GeracaoFederadoAutor")`.

- [ ] **Step 2: Migração à mão**

```sql
-- IFC federado (spec docs/superpowers/specs/2026-10-04-ifc-federado-design.md). Aditiva.

-- AlterEnum
ALTER TYPE "OrigemDocumento" ADD VALUE 'modelo_federado';

-- CreateTable
CREATE TABLE "geracao_modelo_federado" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fila',
    "composicao" JSONB NOT NULL,
    "erro" TEXT,
    "avisos" JSONB,
    "documentoVersaoId" TEXT,
    "autorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    CONSTRAINT "geracao_modelo_federado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geracao_modelo_federado_documentoVersaoId_key" ON "geracao_modelo_federado"("documentoVersaoId");
CREATE INDEX "geracao_modelo_federado_projetoId_criadoEm_idx" ON "geracao_modelo_federado"("projetoId", "criadoEm");

-- Uma geração viva por projeto: dois cliques simultâneos não criam duas (o segundo leva P2002).
CREATE UNIQUE INDEX "geracao_modelo_federado_uma_viva_por_projeto"
    ON "geracao_modelo_federado"("projetoId") WHERE "status" IN ('fila', 'processando');

ALTER TABLE "geracao_modelo_federado" ADD CONSTRAINT "geracao_modelo_federado_projetoId_fkey"
    FOREIGN KEY ("projetoId") REFERENCES "projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geracao_modelo_federado" ADD CONSTRAINT "geracao_modelo_federado_documentoVersaoId_fkey"
    FOREIGN KEY ("documentoVersaoId") REFERENCES "documento_versao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "geracao_modelo_federado" ADD CONSTRAINT "geracao_modelo_federado_autorId_fkey"
    FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Aplicar e gerar o client**

Run: `npx prisma migrate deploy` e depois `npm run db:generate`
Expected: "1 migration applied"; client gerado sem erro. Depois: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW"`
não é viável no dev com drift — em vez disso confira que `npx prisma validate` passa e que `npx tsc --noEmit -p tsconfig.json`
compila (`NODE_OPTIONS=--max-old-space-size=8192`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261004120000_ifc_federado/migration.sql
git commit -m "feat(coordenacao): tabela de gerações e origem modelo_federado"
git show --stat HEAD
```

---

### Task 7: Origens de documento (filtros únicos + gate de leitura)

**Modelo:** implementa **Sonnet**, revisa **Opus** — troca mecânica de filtros, mas é gate de ACESSO — revisor forte confere vazamento.

**Files:**
- Create: `src/modules/documentos-cliente/origens.ts`
- Test: `src/modules/documentos-cliente/origens.test.ts`
- Modify: `src/modules/documentos-cliente/queries.ts:95-97` (`documentosDoCliente`) e `:170`
- Modify: `src/modules/arquivos/arvore-global-queries.ts:77`
- Modify: `src/modules/coordenacao/queries.ts:105`
- Modify: `src/modules/dwg/queries.ts:62`
- Modify: `src/modules/documentos-cliente/acesso.ts` (`podeLerDocumento`, `podeGerirDocumento`)

Depende da Task 6: o literal `"modelo_federado"` nos `where` só tipa depois do enum novo e do `db:generate`.

**Interfaces:**
- Produces:
  - `ORIGEM_MODELO_FEDERADO = "modelo_federado"`
  - `ORIGENS_FORA_DE_RECEBIDOS = ["interno", "base_arquitetonica", "modelo_federado"] as const`
  - `ORIGENS_FORA_DOS_MODELOS = ["interno", "modelo_federado"] as const` (lista de modelos da Compatibilização e de DWGs recebidos)

- [ ] **Step 1: Escrever o teste (constantes + guarda)**

```ts
// src/modules/documentos-cliente/origens.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORIGENS_FORA_DE_RECEBIDOS, ORIGENS_FORA_DOS_MODELOS, ORIGEM_MODELO_FEDERADO } from "./origens";

/**
 * Guarda: uma origem nova de Documento entra em toda consulta que filtra por exclusão. Foi assim que o modelo
 * federado quase apareceu em Recebidos, no portal e na lista de modelos da Compatibilização (spec 2026-10-04 §8).
 * Filtro por exclusão de origem passa pelas constantes de `origens.ts`, nunca por literal.
 */
const RAIZ = path.resolve(__dirname, "../..");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (/\.test\.tsx?$/.test(p)) return [];
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("origens de documento", () => {
  it("o federado fica fora de Recebidos e da lista de modelos", () => {
    expect(ORIGENS_FORA_DE_RECEBIDOS).toContain(ORIGEM_MODELO_FEDERADO);
    expect(ORIGENS_FORA_DOS_MODELOS).toContain(ORIGEM_MODELO_FEDERADO);
  });

  it("nenhuma consulta filtra origem por exclusão com literal", () => {
    const ruins = arquivos(RAIZ).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return /origem:\s*\{\s*(?:notIn:\s*\[\s*"|not:\s*")/.test(src) ? [path.relative(RAIZ, f)] : [];
    });
    expect(ruins).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/documentos-cliente/origens.test.ts`
Expected: FAIL — import não resolve (e, depois de criado o arquivo, o 2º teste lista os 4 arquivos com literal).

- [ ] **Step 3: Implementar as constantes**

```ts
// src/modules/documentos-cliente/origens.ts
/**
 * Origens de `Documento` que as consultas EXCLUEM — puro. Toda consulta que filtra origem por exclusão usa
 * estas listas (o teste-guarda recusa literal): uma origem nova entra aqui uma vez, não em cada `where`.
 */
export const ORIGEM_MODELO_FEDERADO = "modelo_federado" as const;

/** Fora de "Recebidos do cliente" (e do portal e da árvore global, que leem a mesma regra). */
export const ORIGENS_FORA_DE_RECEBIDOS = ["interno", "base_arquitetonica", ORIGEM_MODELO_FEDERADO] as const;

/** Fora da lista de modelos da Compatibilização e dos DWGs recebidos: o federado carregaria a obra duas vezes. */
export const ORIGENS_FORA_DOS_MODELOS = ["interno", ORIGEM_MODELO_FEDERADO] as const;
```

- [ ] **Step 4: Trocar os quatro literais e excluir da ficha do cliente**

- `src/modules/documentos-cliente/queries.ts:170`: `{ origem: { notIn: [...ORIGENS_FORA_DE_RECEBIDOS] }, OR: ancoras }`
- `src/modules/arquivos/arvore-global-queries.ts:77`: `origem: { notIn: [...ORIGENS_FORA_DE_RECEBIDOS] },`
- `src/modules/coordenacao/queries.ts:105`: `where: { origem: { notIn: [...ORIGENS_FORA_DOS_MODELOS] }, OR: ancoras },`
  (e o comentário da função: "origem fora de `ORIGENS_FORA_DOS_MODELOS`").
- `src/modules/dwg/queries.ts:62`: `where: { origem: { notIn: [...ORIGENS_FORA_DOS_MODELOS] }, OR: ancoras },`
- `documentosDoCliente` (`documentos-cliente/queries.ts:95`): `where: { clienteId, origem: { notIn: [ORIGEM_MODELO_FEDERADO] } },`
  — sim, isto também é exclusão por origem, mas com a constante, que a guarda aceita.

Cada arquivo ganha `import { … } from "@/modules/documentos-cliente/origens";`.

- [ ] **Step 5: Gate de leitura e escrita da origem nova**

Em `src/modules/documentos-cliente/acesso.ts`, no começo de `podeLerDocumento` (antes do `if (origem === "interno")`):

```ts
  // Modelo federado (spec 2026-10-04, D6): a regra é a da Compatibilização — `coordenacao:ver` e enxergar o
  // projeto —, não a muralha por disciplina: quem vê a maquete já vê todos os IFCs juntos.
  if (origem === ORIGEM_MODELO_FEDERADO) {
    const projetoId = await projetoEfetivo(ancora);
    return !!projetoId && (await can(user, "coordenacao", "ver")) && (await veModelosDoProjeto(user, projetoId));
  }
```

E no começo de `podeGerirDocumento`:

```ts
  // O federado só nasce da geração e só sai pelas ações dele (coordenação): nenhuma ação genérica de
  // documento (nova versão, editar, excluir) mexe nele — senão a composição gravada mentiria.
  if (origem === ORIGEM_MODELO_FEDERADO) return false;
```

Imports: `import { veModelosDoProjeto } from "@/modules/coordenacao/acesso";` e `import { ORIGEM_MODELO_FEDERADO } from "./origens";`.

- [ ] **Step 6: Rodar testes**

Run: `npx vitest run src/modules/documentos-cliente/ src/modules/coordenacao/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/documentos-cliente/origens.ts src/modules/documentos-cliente/origens.test.ts src/modules/documentos-cliente/queries.ts src/modules/documentos-cliente/acesso.ts src/modules/arquivos/arvore-global-queries.ts src/modules/coordenacao/queries.ts src/modules/dwg/queries.ts
git commit -m "refactor(documentos): filtros por origem em constantes únicas, prontos para o modelo federado"
git show --stat HEAD
```

---

### Task 8: Serviço, job e actions

**Modelo:** implementa **Opus**, revisa **Opus** — concorrência (índice parcial, travada), transação, job, actions e notificação juntos.

**Files:**
- Create: `src/modules/coordenacao/federado/inspecao.ts`
- Create: `src/modules/coordenacao/federado/service.ts`
- Create: `src/modules/coordenacao/federado/actions.ts`
- Modify: `src/modules/coordenacao/service.ts` (exportar `bossVivo`)
- Modify: `src/lib/jobs.ts` (fila), `src/lib/jobs-handlers.ts` (handler)

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6, 7; `modelosCoordenacao` (`coordenacao/queries.ts`), `veModelosDoProjeto`, `notificar`, `rotuloRevisao`, `formatarCodigo`.
- Produces:
  - `inspecionarIfc(caminhoRel: string): Promise<{ schema: string | null; unidade: string | null | undefined } | null>` (`null` = arquivo não existe)
  - `type ItemComposicao = { modeloId: string; tipo: "upload" | "documento"; refId: string; caminho: string; nome: string; grupo: string; revisao: string; tamanho: number }`
  - `candidatosDoProjeto(projetoId: string): Promise<(CandidatoFederado & { item: ItemComposicao })[]>`
  - `criarGeracao(a: { projetoId: string; modeloIds: string[]; autorId: string }): Promise<{ geracaoId: string }>` — revalida, libera travadas, grava em `fila`; `ActionError` com a frase da regra.
  - `processarGeracao(geracaoId: string, deps?: { rodar?: SpawnFederar; notificarAutor?: boolean }): Promise<void>`
  - `ultimaGeracao(projetoId: string)` e `versoesDoModeloFederado(projetoId: string): Promise<VersaoFederada[]>`
  - `type VersaoFederada = { versaoId: string; documentoId: string; numero: number; revisao: string; nomeArquivo: string; tamanho: number; criadoEm: string; autor: string | null; downloadUrl: string; composicao: { nome: string; grupo: string; revisao: string }[]; avisos: string[] }`
  - Actions: `listarCandidatosFederado({ projetoId })`, `gerarModeloFederado({ projetoId, modeloIds })`, `excluirVersaoModeloFederado({ versaoId })`, `excluirModeloFederado({ documentoId })`

- [ ] **Step 1: Exportar `bossVivo`**

Em `src/modules/coordenacao/service.ts`, troque `function bossVivo()` por `export function bossVivo()`.

- [ ] **Step 2: Inspeção (schema + unidade sem ler o arquivo inteiro)**

```ts
// src/modules/coordenacao/federado/inspecao.ts
import "server-only";

import { createReadStream } from "node:fs";
import { resolverCaminho, existeArquivo } from "@/lib/storage";
import { AnalisadorIfc } from "./analise";
import { LeitorStep } from "./step";

/** Para de ler aqui: o diálogo não pode varrer GBs; o job confere o arquivo inteiro de qualquer jeito. */
const LIMITE_LEITURA = 64 * 1024 * 1024;

/**
 * Schema e unidade de comprimento de um IFC em disco, para o diálogo. `unidade: undefined` = não achou nos
 * primeiros 64 MB (não bloqueia; o child decide). `null` = o arquivo não existe.
 */
export async function inspecionarIfc(caminhoRel: string): Promise<{ schema: string | null; unidade: string | null | undefined } | null> {
  if (!(await existeArquivo(caminhoRel))) return null;
  const leitor = new LeitorStep();
  const analisador = new AnalisadorIfc();
  const stream = createReadStream(resolverCaminho(caminhoRel), { encoding: "latin1", highWaterMark: 1 << 20, end: LIMITE_LEITURA });
  try {
    for await (const pedaco of stream as AsyncIterable<string>) {
      for (const instr of leitor.alimentar(pedaco)) analisador.instrucao(instr);
      if (analisador.unidadeResolvida()) break;
    }
  } finally {
    stream.destroy();
  }
  const r = analisador.resultado();
  return { schema: r.schema, unidade: analisador.unidadeResolvida() ? r.unidade : undefined };
}
```

- [ ] **Step 3: Serviço**

```ts
// src/modules/coordenacao/federado/service.ts
import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { existeArquivo, removerArquivo } from "@/lib/storage";
import { notificar } from "@/lib/notificar";
import { rotuloRevisao } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { modelosCoordenacao } from "@/modules/coordenacao/queries";
import { parseModeloId } from "@/modules/coordenacao/modelo-ref";
import { ORIGEM_MODELO_FEDERADO } from "@/modules/documentos-cliente/origens";
import { inspecionarIfc } from "./inspecao";
import { federar, type SpawnFederar } from "./federacao";
import { GRUPO_FEDERADO, MINUTOS_GERACAO_TRAVADA, avaliarSelecao, type CandidatoFederado } from "./regras";

export type ItemComposicao = {
  modeloId: string;
  tipo: "upload" | "documento";
  refId: string;
  caminho: string;
  nome: string;
  grupo: string;
  revisao: string;
  tamanho: number;
};

export type VersaoFederada = {
  versaoId: string;
  documentoId: string;
  numero: number;
  revisao: string;
  nomeArquivo: string;
  tamanho: number;
  criadoEm: string;
  autor: string | null;
  downloadUrl: string;
  composicao: { nome: string; grupo: string; revisao: string }[];
  avisos: string[];
};

/** Modelos da Compatibilização, com o caminho do IFC e a inspeção de schema/unidade — na ordem do painel. */
export async function candidatosDoProjeto(projetoId: string): Promise<(CandidatoFederado & { item: ItemComposicao })[]> {
  const modelos = await modelosCoordenacao(projetoId);
  const uploadIds = modelos.filter((m) => m.tipo === "upload").map((m) => m.uploadId);
  const versaoIds = modelos.filter((m) => m.tipo === "documento").map((m) => parseModeloId(m.uploadId).id);
  const [uploads, versoes] = [
    await prisma.upload.findMany({ where: { id: { in: uploadIds } }, select: { id: true, caminho: true } }),
    await prisma.documentoVersao.findMany({ where: { id: { in: versaoIds } }, select: { id: true, caminho: true } }),
  ];
  const caminhoDe = new Map([...uploads, ...versoes].map((x) => [x.id, x.caminho]));

  const saida: (CandidatoFederado & { item: ItemComposicao })[] = [];
  for (const m of modelos) {
    const refId = parseModeloId(m.uploadId).id;
    const caminho = caminhoDe.get(refId) ?? "";
    const inspecao = caminho ? await inspecionarIfc(caminho) : null;
    const revisao = rotuloRevisao(m.versao);
    saida.push({
      modeloId: m.uploadId,
      nome: m.nomeArquivo,
      grupo: m.disciplinaNome,
      revisao,
      tamanho: m.tamanho,
      convertido: m.conversao?.status === "concluido",
      arquivoExiste: inspecao !== null,
      schema: inspecao?.schema ?? null,
      unidade: inspecao ? inspecao.unidade : undefined,
      item: { modeloId: m.uploadId, tipo: m.tipo, refId, caminho, nome: m.nomeArquivo, grupo: m.disciplinaNome, revisao, tamanho: m.tamanho },
    });
  }
  return saida;
}

/** Libera geração que ficou viva demais (servidor reiniciou no meio): sem isso o projeto travaria para sempre. */
async function liberarTravadas(projetoId: string) {
  const limite = new Date(Date.now() - MINUTOS_GERACAO_TRAVADA * 60 * 1000);
  await prisma.geracaoModeloFederado.updateMany({
    where: { projetoId, status: { in: ["fila", "processando"] }, criadoEm: { lt: limite } },
    data: { status: "erro", erro: "Interrompida — o servidor reiniciou durante a geração.", concluidoEm: new Date() },
  });
}

export async function criarGeracao(a: { projetoId: string; modeloIds: string[]; autorId: string }): Promise<{ geracaoId: string }> {
  const candidatos = await candidatosDoProjeto(a.projetoId);
  const desconhecido = a.modeloIds.find((id) => !candidatos.some((c) => c.modeloId === id));
  if (desconhecido) throw new ActionError("Um dos modelos marcados não existe mais. Recarregue a página.");
  const avaliacao = avaliarSelecao(candidatos, a.modeloIds);
  const bloqueado = candidatos.find((c) => a.modeloIds.includes(c.modeloId) && avaliacao.motivos[c.modeloId]);
  if (bloqueado) throw new ActionError(`${bloqueado.nome}: ${avaliacao.motivos[bloqueado.modeloId]}`);
  if (!avaliacao.podeGerar) throw new ActionError(avaliacao.motivoGerar ?? "Não foi possível gerar.");

  await liberarTravadas(a.projetoId);
  // Ordem do painel, não a do clique: o primeiro é o mestre (schema, unidade, IfcProject).
  const composicao = candidatos.filter((c) => avaliacao.validos.includes(c.modeloId)).map((c) => c.item);
  try {
    const g = await prisma.geracaoModeloFederado.create({
      data: { projetoId: a.projetoId, autorId: a.autorId, composicao: composicao as unknown as Prisma.InputJsonValue, status: "fila" },
      select: { id: true },
    });
    return { geracaoId: g.id };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      throw new ActionError("Já há uma geração do modelo federado em andamento neste projeto.");
    }
    throw e;
  }
}

async function avisarAutor(autorId: string, projetoId: string, titulo: string, corpo: string) {
  await notificar(
    autorId,
    { titulo, corpo, href: `/projetos/${projetoId}/arquivos?pasta=desenvolvimento&area=federado` },
    { categoria: "coordenacao" },
  );
}

export async function processarGeracao(geracaoId: string, deps: { rodar?: SpawnFederar; notificarAutor?: boolean } = {}): Promise<void> {
  const tomada = await prisma.geracaoModeloFederado.updateMany({
    where: { id: geracaoId, status: "fila" },
    data: { status: "processando", iniciadoEm: new Date() },
  });
  if (tomada.count !== 1) return; // outra execução já pegou, ou foi liberada como travada

  const g = await prisma.geracaoModeloFederado.findUniqueOrThrow({
    where: { id: geracaoId },
    include: { projeto: { select: { codigo: true, clienteId: true } }, autor: { select: { name: true } } },
  });
  const composicao = g.composicao as ItemComposicao[];
  const notificarAutor = deps.notificarAutor !== false;

  const falhar = async (erro: string) => {
    await prisma.geracaoModeloFederado.update({ where: { id: geracaoId }, data: { status: "erro", erro, concluidoEm: new Date() } });
    if (notificarAutor) await avisarAutor(g.autorId, g.projetoId, "Não foi possível gerar o modelo federado", erro);
  };

  for (const item of composicao) {
    if (!(await existeArquivo(item.caminho))) return falhar(`O arquivo de ${item.nome} (${item.grupo}) não está mais no servidor.`);
  }

  const doc = await prisma.documento.findFirst({
    where: { projetoId: g.projetoId, origem: ORIGEM_MODELO_FEDERADO },
    select: { id: true, versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } } },
  });
  const numero = (doc?.versoes[0]?.numero ?? 0) + 1;
  const nomeArquivo = `${formatarCodigo(g.projeto.codigo)}-FEDERADO-${rotuloRevisao(numero)}.ifc`;
  const saida = `documentos/${g.projeto.clienteId}/${randomBytes(12).toString("hex")}.ifc`;

  const r = await federar(
    {
      entradas: composicao.map((c) => ({ caminho: c.caminho, rotulo: c.nome })),
      saida,
      cabecalho: {
        nomeArquivo,
        autor: g.autor.name ?? "SenaHub",
        quando: new Date().toISOString().slice(0, 19),
        composicao: composicao.map((c) => ({ nome: c.nome, grupo: c.grupo, revisao: c.revisao })),
      },
    },
    deps.rodar,
  );
  if (!r.ok) return falhar(r.erro);

  try {
    await prisma.$transaction(async (tx) => {
      const documentoId =
        doc?.id ??
        (
          await tx.documento.create({
            data: {
              clienteId: g.projeto.clienteId,
              projetoId: g.projetoId,
              origem: ORIGEM_MODELO_FEDERADO,
              canal: "interno",
              nome: GRUPO_FEDERADO,
              categoria: "modelo_federado",
              autorId: g.autorId,
            },
            select: { id: true },
          })
        ).id;
      const versao = await tx.documentoVersao.create({
        data: { documentoId, numero, caminho: saida, nomeArquivo, mime: "application/x-step", tamanho: r.tamanho, hashSha256: r.sha256, autorId: g.autorId },
        select: { id: true },
      });
      await tx.geracaoModeloFederado.update({
        where: { id: geracaoId },
        data: { status: "concluido", documentoVersaoId: versao.id, avisos: r.avisos, concluidoEm: new Date() },
      });
    });
  } catch (e) {
    await removerArquivo(saida);
    return falhar(e instanceof Error ? e.message : "Falha ao registrar o modelo federado.");
  }
  if (notificarAutor) {
    await avisarAutor(g.autorId, g.projetoId, `Modelo federado ${rotuloRevisao(numero)} pronto`, `${composicao.length} modelos em ${nomeArquivo}.`);
  }
}

export async function ultimaGeracao(projetoId: string) {
  return prisma.geracaoModeloFederado.findFirst({
    where: { projetoId },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true, status: true, erro: true, avisos: true, criadoEm: true, concluidoEm: true,
      autor: { select: { name: true } },
      documentoVersao: { select: { id: true, numero: true, nomeArquivo: true } },
    },
  });
}

export async function versoesDoModeloFederado(projetoId: string): Promise<VersaoFederada[]> {
  const doc = await prisma.documento.findFirst({
    where: { projetoId, origem: ORIGEM_MODELO_FEDERADO },
    select: {
      id: true,
      versoes: {
        orderBy: { numero: "desc" },
        select: {
          id: true, numero: true, nomeArquivo: true, tamanho: true, createdAt: true,
          geracaoFederado: { select: { composicao: true, avisos: true, autor: { select: { name: true } } } },
        },
      },
    },
  });
  if (!doc) return [];
  return doc.versoes.map((v) => ({
    versaoId: v.id,
    documentoId: doc.id,
    numero: v.numero,
    revisao: rotuloRevisao(v.numero),
    nomeArquivo: v.nomeArquivo,
    tamanho: v.tamanho,
    criadoEm: v.createdAt.toISOString(),
    autor: v.geracaoFederado?.autor.name ?? null,
    downloadUrl: `/api/documentos/${v.id}/download`,
    composicao: ((v.geracaoFederado?.composicao ?? []) as ItemComposicao[]).map((c) => ({ nome: c.nome, grupo: c.grupo, revisao: c.revisao })),
    avisos: (v.geracaoFederado?.avisos ?? []) as string[],
  }));
}
```

- [ ] **Step 4: Job**

Em `src/lib/jobs-handlers.ts`, perto de `processarConversaoIfc`:

```ts
/** IFC federado (spec 2026-10-04): o trabalho pesado roda em child process; aqui só orquestra. */
export async function processarGeracaoFederado(geracaoId: string): Promise<void> {
  await processarGeracao(geracaoId);
}
```

(com `import { processarGeracao } from "@/modules/coordenacao/federado/service";`).

Em `src/lib/jobs.ts`, depois do bloco do `FILA_CONVERTER_IFC` (linha ~156):

```ts
  // ── Coordenação BIM: IFC federado (ON-DEMAND) ──
  // Concorrência-1 padrão do pg-boss: uma junção por vez (lê GBs de disco; não pode competir com a conversão).
  await boss.createQueue(FILA_FEDERAR_IFC);
  await boss.work(FILA_FEDERAR_IFC, async ([job]) => {
    const { geracaoId } = job.data as { geracaoId: string };
    await processarGeracaoFederado(geracaoId);
  });
```

(imports: `FILA_FEDERAR_IFC` de `@/modules/coordenacao/federado/regras`, `processarGeracaoFederado` de `./jobs-handlers`).

- [ ] **Step 5: Actions**

```ts
// src/modules/coordenacao/federado/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { veModelosDoProjeto } from "@/modules/coordenacao/acesso";
import { bossVivo } from "@/modules/coordenacao/service";
import { ORIGEM_MODELO_FEDERADO } from "@/modules/documentos-cliente/origens";
import { candidatosDoProjeto, criarGeracao } from "./service";
import { FILA_FEDERAR_IFC, type CandidatoFederado } from "./regras";

const base = { modulo: "coordenacao", recurso: "coordenacao", permissao: "gerir" } as const;

async function exigirProjeto(user: Parameters<typeof veModelosDoProjeto>[0], projetoId: string | null) {
  if (!projetoId || !(await veModelosDoProjeto(user, projetoId))) {
    throw new ActionError("Você não participa deste projeto. Peça ao coordenador para incluir você como membro do projeto.");
  }
}

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/coordenacao`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
  revalidatePath("/arquivos");
}

/** Leitura do diálogo (sem auditoria): modelos com schema, unidade e o que impede cada um. */
export const listarCandidatosFederado = defineAction(
  { ...base, acao: "listar-candidatos-federado", audit: false, schema: z.object({ projetoId: z.string().min(1) }) },
  async (i, ctx) => {
    await exigirProjeto(ctx.user, i.projetoId);
    // Sem o `item` (caminho em disco): o navegador não precisa dele.
    return (await candidatosDoProjeto(i.projetoId)).map(
      (c): CandidatoFederado => ({
        modeloId: c.modeloId, nome: c.nome, grupo: c.grupo, revisao: c.revisao, tamanho: c.tamanho,
        convertido: c.convertido, arquivoExiste: c.arquivoExiste, schema: c.schema, unidade: c.unidade,
      }),
    );
  },
);

export const gerarModeloFederado = defineAction(
  {
    ...base,
    acao: "gerar-modelo-federado",
    entidade: "GeracaoModeloFederado",
    entidadeId: (d) => (d as { geracaoId?: string } | undefined)?.geracaoId,
    schema: z.object({ projetoId: z.string().min(1), modeloIds: z.array(z.string().min(1)).min(2).max(50) }),
  },
  async (i, ctx) => {
    await exigirProjeto(ctx.user, i.projetoId);
    const boss = bossVivo();
    if (!boss) throw new ActionError("A geração roda em segundo plano e o servidor de tarefas não está ativo.");
    const { geracaoId } = await criarGeracao({ projetoId: i.projetoId, modeloIds: i.modeloIds, autorId: ctx.user.id });
    await boss.send(FILA_FEDERAR_IFC, { geracaoId }, { singletonKey: i.projetoId });
    revalidar(i.projetoId);
    return { geracaoId };
  },
);

export const excluirVersaoModeloFederado = defineAction(
  { ...base, acao: "excluir-versao-modelo-federado", entidade: "DocumentoVersao", entidadeId: (_d, i) => i.versaoId, schema: z.object({ versaoId: z.string().min(1) }) },
  async (i, ctx) => {
    const v = await prisma.documentoVersao.findUnique({
      where: { id: i.versaoId },
      select: { caminho: true, documento: { select: { projetoId: true, origem: true, _count: { select: { versoes: true } } } } },
    });
    if (!v || v.documento.origem !== ORIGEM_MODELO_FEDERADO) throw new ActionError("Versão não encontrada.");
    await exigirProjeto(ctx.user, v.documento.projetoId);
    if (v.documento._count.versoes <= 1) throw new ActionError("Esta é a única versão. Exclua o modelo federado inteiro.");
    await prisma.documentoVersao.delete({ where: { id: i.versaoId } });
    await removerArquivo(v.caminho);
    revalidar(v.documento.projetoId!);
    return { versaoId: i.versaoId };
  },
);

export const excluirModeloFederado = defineAction(
  { ...base, acao: "excluir-modelo-federado", entidade: "Documento", entidadeId: (_d, i) => i.documentoId, schema: z.object({ documentoId: z.string().min(1) }) },
  async (i, ctx) => {
    const doc = await prisma.documento.findUnique({
      where: { id: i.documentoId },
      select: { projetoId: true, origem: true, versoes: { select: { caminho: true } } },
    });
    if (!doc || doc.origem !== ORIGEM_MODELO_FEDERADO) throw new ActionError("Modelo federado não encontrado.");
    await exigirProjeto(ctx.user, doc.projetoId);
    await prisma.documento.delete({ where: { id: i.documentoId } });
    for (const v of doc.versoes) await removerArquivo(v.caminho);
    revalidar(doc.projetoId!);
    return { documentoId: i.documentoId };
  },
);
```

**Atenção ("use server" só exporta função):** `base` e `exigirProjeto` NÃO podem ser exportados deste arquivo
(memória `use-server-export-nao-funcao`: quebra em runtime, não no build).

- [ ] **Step 6: Typecheck, lint e testes**

Run: `npx eslint src/modules/coordenacao src/lib/jobs.ts src/lib/jobs-handlers.ts` e `npm test`
Expected: sem erros/avisos; testes verdes. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.server.json` compila.

- [ ] **Step 7: Commit**

```bash
git add src/modules/coordenacao/federado/inspecao.ts src/modules/coordenacao/federado/service.ts src/modules/coordenacao/federado/actions.ts src/modules/coordenacao/service.ts src/lib/jobs.ts src/lib/jobs-handlers.ts
git commit -m "feat(coordenacao): geração do IFC federado em segundo plano"
git show --stat HEAD
```

---

### Task 9: Download em streaming

**Modelo:** implementa **Haiku**, revisa **Sonnet** — troca pontual de Buffer por stream numa rota, código pronto.

**Files:**
- Modify: `src/app/api/documentos/[id]/download/route.ts`

**Interfaces:**
- Consumes: `podeLerDocumento` com o ramo novo (Task 7).

- [ ] **Step 1: Trocar `lerArquivo` por stream**

Substitua o bloco `let conteudo: Buffer; try { conteudo = await lerArquivo(versao.caminho); } catch { … 410 }` e o
`return new NextResponse(new Uint8Array(conteudo), …)` por:

```ts
  // Streaming (spec do IFC federado, §8): o arquivo pode ter GBs — ler num Buffer derrubaria a memória.
  let caminhoAbs: string;
  let tamanho: number;
  try {
    caminhoAbs = resolverCaminho(versao.caminho);
    tamanho = (await stat(caminhoAbs)).size;
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível no disco." }, { status: 410 });
  }
```

(o `logAudit` fica onde está, entre os dois) e no fim:

```ts
  const stream = Readable.toWeb(createReadStream(caminhoAbs)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": versao.mime || "application/octet-stream",
      "Content-Length": String(tamanho),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(versao.nomeArquivo)}"`,
    },
  });
```

Imports: `createReadStream` de `node:fs`, `stat` de `node:fs/promises`, `Readable` de `node:stream`,
`resolverCaminho` de `@/lib/storage` (tire `lerArquivo` se ficar sem uso).

- [ ] **Step 2: Conferir num arquivo real**

Com `npm run dev -- -p 3001` no ar e logado (admin de teste do worktree, memória `admin-teste-dev`), baixe um
documento qualquer de Recebidos: `curl -s -o NUL -w "%{http_code} %{size_download}\n" -b cookies.txt http://localhost:3001/api/documentos/<versaoId>/download`
Expected: `200` e o tamanho do arquivo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/documentos/[id]/download/route.ts"
git commit -m "fix(documentos): download em streaming, sem carregar o arquivo inteiro na memória"
git show --stat HEAD
```

---

### Task 10: Compatibilização — diálogo e bloco da última geração

**Modelo:** implementa **Sonnet**, revisa **Sonnet** — UI com código pronto; conferir 390×844 e tela cheia do visualizador.

**Files:**
- Create: `src/components/coordenacao/exportar-federado-dialog.tsx`
- Create: `src/components/coordenacao/modelo-federado-bloco.tsx`
- Modify: `src/components/coordenacao/painel-disciplinas.tsx`, `src/components/coordenacao/coordenacao-view.tsx`, `src/app/(dashboard)/projetos/[id]/coordenacao/page.tsx`

**Interfaces:**
- Consumes: `listarCandidatosFederado`, `gerarModeloFederado` (Task 8), `avaliarSelecao`, `rotuloUnidade` (Task 4), `ultimaGeracao` (Task 8).
- Produces: `type GeracaoResumo = { status: string; erro: string | null; avisos: string[]; criadoEm: string; autor: string | null; versao: { id: string; revisao: string; nomeArquivo: string } | null }` (prop nova do `CoordenacaoView`, `ultimaGeracao`).

- [ ] **Step 1: Página passa a última geração**

Em `page.tsx`, some `ultimaGeracao(id)` ao `Promise.all` (com o import) e monte:

```ts
  const geracao = ultima
    ? {
        status: ultima.status,
        erro: ultima.erro,
        avisos: (ultima.avisos ?? []) as string[],
        criadoEm: ultima.criadoEm.toISOString(),
        autor: ultima.autor.name,
        versao: ultima.documentoVersao
          ? { id: ultima.documentoVersao.id, revisao: rotuloRevisao(ultima.documentoVersao.numero), nomeArquivo: ultima.documentoVersao.nomeArquivo }
          : null,
      }
    : null;
```

e passe `ultimaGeracao={geracao}` ao `CoordenacaoView`, que repassa a `PainelDisciplinas` junto com `projetoId`,
`podeGerir` e `carregados`.

- [ ] **Step 2: Bloco da última geração**

```tsx
// src/components/coordenacao/modelo-federado-bloco.tsx
"use client";

import { Download, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";

export type GeracaoResumo = {
  status: string;
  erro: string | null;
  avisos: string[];
  criadoEm: string;
  autor: string | null;
  versao: { id: string; revisao: string; nomeArquivo: string } | null;
};

/** Última geração do IFC federado no painel Disciplinas: andamento, erro, avisos e o download da versão. */
export function ModeloFederadoBloco({ geracao }: { geracao: GeracaoResumo | null }) {
  if (!geracao) return null;
  const andando = geracao.status === "fila" || geracao.status === "processando";
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2 text-xs">
      {andando && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Gerando o modelo federado… avisamos no sino quando terminar.
        </p>
      )}
      {geracao.status === "erro" && (
        <p className="flex items-start gap-1.5 text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {geracao.erro}
        </p>
      )}
      {geracao.status === "concluido" && geracao.versao && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium" title={geracao.versao.nomeArquivo}>Modelo federado {geracao.versao.revisao}</p>
            <p className="text-muted-foreground">
              {formatarDataHora(geracao.criadoEm)}{geracao.autor ? ` · ${geracao.autor}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" render={<a href={`/api/documentos/${geracao.versao.id}/download`} />}>
            <Download className="size-3.5" aria-hidden /> Baixar
          </Button>
        </div>
      )}
      {geracao.avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> {a}
        </p>
      ))}
    </div>
  );
}
```

Confira que `formatarDataHora` aceita string ISO (senão passe `new Date(...)`) e que o token `text-warning`
existe em `globals.css` (senão use `text-muted-foreground`; nunca cor crua).

- [ ] **Step 3: Diálogo**

```tsx
// src/components/coordenacao/exportar-federado-dialog.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Loader2 } from "lucide-react";
import { gerarModeloFederado, listarCandidatosFederado } from "@/modules/coordenacao/federado/actions";
import { avaliarSelecao, motivoIntrinseco, rotuloUnidade, type CandidatoFederado } from "@/modules/coordenacao/federado/regras";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * "Exportar IFC federado" (spec 2026-10-04 §6): lista de marcar que já abre com os modelos ligados no
 * visualizador. O que não pode entrar aparece desabilitado com o motivo — a mesma regra (`avaliarSelecao`)
 * que a action e o job usam.
 *
 * Só é montado aberto (o pai renderiza `{aberto && <… />}`): cada abertura começa do zero, e `ligados` é a foto
 * do momento do clique — ligar outro modelo com o diálogo aberto não desfaz o que a pessoa marcou.
 */
export function ExportarFederadoDialog({
  projetoId, ligados, onFechar, desabilitado,
}: {
  projetoId: string;
  ligados: readonly string[];
  onFechar: () => void;
  /** Geração em andamento: o botão de gerar fica inerte com este motivo. */
  desabilitado: string | null;
}) {
  const router = useRouter();
  const [candidatos, setCandidatos] = useState<CandidatoFederado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    void listarCandidatosFederado({ projetoId }).then((r) => {
      if (!vivo) return;
      if (!r.ok) return setErro(r.error);
      setCandidatos(r.data);
      setMarcados(r.data.filter((c) => ligados.includes(c.modeloId)).map((c) => c.modeloId));
    });
    return () => {
      vivo = false;
    };
  }, [projetoId, ligados]);

  const avaliacao = useMemo(() => (candidatos ? avaliarSelecao(candidatos, marcados) : null), [candidatos, marcados]);

  function alternar(id: string, ligar: boolean) {
    setMarcados((m) => (ligar ? [...m, id] : m.filter((x) => x !== id)));
  }

  function gerar() {
    start(async () => {
      const r = await gerarModeloFederado({ projetoId, modeloIds: avaliacao?.validos ?? [] });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Geração iniciada. Avisamos no sino quando o arquivo estiver pronto.");
      onFechar();
      router.refresh();
    });
  }

  const motivoBotao = desabilitado ?? avaliacao?.motivoGerar ?? null;

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar IFC federado</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Junta os modelos marcados num só IFC, guardado em Arquivos → Desenvolvimento → Modelo federado.
            O primeiro marcado define o schema e a unidade.
          </p>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {!candidatos && !erro && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Lendo os modelos…</p>
          )}
          {candidatos && avaliacao && (
            <ul className="space-y-1.5">
              {candidatos.map((c) => {
                const motivo = avaliacao.motivos[c.modeloId];
                const intrinseco = motivoIntrinseco(c) !== null;
                return (
                  <li key={c.modeloId} className="flex items-start gap-2 rounded-md border border-border p-2">
                    <Checkbox
                      checked={marcados.includes(c.modeloId)}
                      disabled={intrinseco}
                      onCheckedChange={(v: boolean) => alternar(c.modeloId, v)}
                      aria-label={`Incluir ${c.nome}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate text-sm font-medium" title={c.nome}>{c.grupo}</p>
                      <p className="truncate font-mono text-muted-foreground">
                        {c.nome} · {c.revisao} · {c.schema ?? "?"} · {c.unidade === undefined ? "unidade a conferir" : rotuloUnidade(c.unidade)} · {mb(c.tamanho)}
                      </p>
                      {motivo && <p className="text-destructive">{motivo}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap items-center gap-2">
          {avaliacao && <span className="mr-auto text-xs text-muted-foreground">{avaliacao.validos.length} modelos · {mb(avaliacao.totalBytes)}</span>}
          {motivoBotao && <span className="w-full text-xs text-muted-foreground sm:w-auto">{motivoBotao}</span>}
          <Button onClick={gerar} disabled={pending || !avaliacao || motivoBotao !== null}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Boxes className="size-4" aria-hidden />} Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Atenção: o `DialogContent` portala para o `body`. O visualizador pode estar em tela cheia, e aí o diálogo abre
invisível. O `pdf-viewer.tsx` resolve isso com `PortalContainerProvider`. Confira como o `coordenacao-view` trata
a tela cheia: se ele já envolve a subárvore com `PortalContainerProvider`, não precisa fazer nada; se não, monte o
diálogo **fora** do elemento que entra em tela cheia.

- [ ] **Step 4: Botão e bloco no painel Disciplinas**

Em `PainelDisciplinas`, adicione as props `projetoId`, `podeGerir`, `ultimaGeracao: GeracaoResumo | null` e, no
fim do `CardContent`:

```tsx
        <div className="space-y-2 border-t border-border pt-3">
          <ModeloFederadoBloco geracao={ultimaGeracao} />
          {podeGerir && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => { setLigadosNoClique([...carregados]); setExportarAberto(true); }}>
              <Boxes className="size-4" aria-hidden /> Exportar IFC federado
            </Button>
          )}
        </div>
```

Estados locais `exportarAberto` e `ligadosNoClique: string[]`; o botão guarda a foto dos ligados ao abrir. O
diálogo é montado só aberto:

```tsx
      {podeGerir && exportarAberto && (
        <ExportarFederadoDialog
          projetoId={projetoId}
          ligados={ligadosNoClique}
          onFechar={() => setExportarAberto(false)}
          desabilitado={
            ultimaGeracao && (ultimaGeracao.status === "fila" || ultimaGeracao.status === "processando")
              ? "Já há uma geração do modelo federado em andamento neste projeto."
              : null
          }
        />
      )}
```

Em `coordenacao-view.tsx`, repasse `projetoId`, `podeGerir` e `ultimaGeracao` no `<PainelDisciplinas …>`
(linha ~735). Enquanto `status` for `fila|processando`, a página precisa se atualizar sozinha: no `ModeloFederadoBloco`,
um `useEffect` com `router.refresh()` a cada 15 s **só** enquanto `andando` for verdadeiro (limpe o intervalo
no retorno).

- [ ] **Step 5: Ver na tela**

`npm run dev:server` (o job precisa do worker; porta 3001). Num projeto com 2+ IFCs convertidos do banco de dev:
abra Compatibilização → Disciplinas, ligue dois modelos, "Exportar IFC federado", confira que os dois vêm marcados,
gere, espere o sino e baixe. Confira a 390×844 que `document.documentElement.scrollWidth === 390` com o diálogo aberto.

- [ ] **Step 6: Commit**

```bash
git add src/components/coordenacao/exportar-federado-dialog.tsx src/components/coordenacao/modelo-federado-bloco.tsx src/components/coordenacao/painel-disciplinas.tsx src/components/coordenacao/coordenacao-view.tsx "src/app/(dashboard)/projetos/[id]/coordenacao/page.tsx"
git commit -m "feat(coordenacao): exportar IFC federado pelo painel Disciplinas"
git show --stat HEAD
```

---

### Task 11: Aba Arquivos — pasta "Modelo federado" no Desenvolvimento

**Modelo:** implementa **Sonnet**, revisa **Opus** — UI em 6 arquivos da aba Arquivos (shell, árvore, trilha): fácil quebrar navegação existente.

**Files:**
- Create: `src/modules/coordenacao/federado/acoes.ts` + `acoes.test.ts`
- Create: `src/components/projetos/arquivos/tabela-modelo-federado.tsx`
- Modify: `src/modules/uploads/areas-projeto.ts`, `src/modules/uploads/pastas-da-lista.ts` (+ `pastas-da-lista.test.ts`)
- Modify: `src/components/projetos/arquivos/{painel-areas-projeto,conteudo-area-projeto,documentos-shell,arvore-documentos,tela-documentos-projeto}.tsx`

**Interfaces:**
- Consumes: `versoesDoModeloFederado`, `VersaoFederada`, `excluirVersaoModeloFederado`, `excluirModeloFederado` (Task 8).
- Produces:
  - `AREAS_PROJETO` ganha `"federado"`; `AREAS_NA_RAIZ: AreaProjeto[]` (todas menos `federado`).
  - `pastaDoModeloFederado(total: number): PastaNaLista`
  - `ACAO_FED_BAIXAR`, `ACAO_FED_EXCLUIR_VERSAO`, `ACAO_FED_EXCLUIR_TUDO`; `itensDaVersaoFederada(v: { revisao: string; downloadUrl: string; vigente: boolean }, ctx: { podeGerir: boolean; totalVersoes: number }): AcaoItem[]`

- [ ] **Step 1: Teste do descritor**

```ts
// src/modules/coordenacao/federado/acoes.test.ts
import { describe, expect, it } from "vitest";
import { ACAO_FED_BAIXAR, ACAO_FED_EXCLUIR_TUDO, ACAO_FED_EXCLUIR_VERSAO, itensDaVersaoFederada } from "./acoes";

const ids = (itens: { id: string }[]) => itens.filter((i) => !i.id.startsWith("sep")).map((i) => i.id);
const v = { revisao: "R01", downloadUrl: "/api/documentos/x/download", vigente: true };

describe("itensDaVersaoFederada", () => {
  it("sem gerir: só baixar", () => {
    expect(ids(itensDaVersaoFederada(v, { podeGerir: false, totalVersoes: 3 }))).toEqual([ACAO_FED_BAIXAR]);
  });
  it("com gerir e várias versões: excluir só esta", () => {
    expect(ids(itensDaVersaoFederada(v, { podeGerir: true, totalVersoes: 3 }))).toEqual([ACAO_FED_BAIXAR, ACAO_FED_EXCLUIR_VERSAO]);
  });
  it("a única versão só sai excluindo o modelo inteiro", () => {
    expect(ids(itensDaVersaoFederada(v, { podeGerir: true, totalVersoes: 1 }))).toEqual([ACAO_FED_BAIXAR, ACAO_FED_EXCLUIR_TUDO]);
  });
  it("todo item destrutivo pede confirmação", () => {
    for (const total of [1, 3]) {
      const destrutivos = itensDaVersaoFederada(v, { podeGerir: true, totalVersoes: total }).filter(
        (i) => i.tipo === "acao" && i.variant === "destructive",
      );
      expect(destrutivos.every((i) => i.tipo === "acao" && i.confirmar)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Descritor**

```ts
// src/modules/coordenacao/federado/acoes.ts
import { Download, Trash2 } from "lucide-react";
import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma versão do modelo federado (ADR-0002) — puro. Não tem "nova versão" nem editar: a versão só nasce
 * da geração na Compatibilização, senão a composição gravada mentiria (spec 2026-10-04 §8).
 */
export const ACAO_FED_BAIXAR = "fed-baixar";
export const ACAO_FED_EXCLUIR_VERSAO = "fed-excluir-versao";
export const ACAO_FED_EXCLUIR_TUDO = "fed-excluir-tudo";

export function itensDaVersaoFederada(
  v: { revisao: string; downloadUrl: string; vigente: boolean },
  ctx: { podeGerir: boolean; totalVersoes: number },
): AcaoItem[] {
  const unica = ctx.totalVersoes <= 1;
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: ACAO_FED_BAIXAR, rotulo: v.vigente ? "Baixar" : "Baixar esta versão", icone: Download, href: v.downloadUrl },
    ctx.podeGerir ? { tipo: "separador", id: "sep-excluir" } : null,
    ctx.podeGerir && !unica
      ? {
          tipo: "acao", id: ACAO_FED_EXCLUIR_VERSAO, rotulo: "Excluir esta versão", icone: Trash2, variant: "destructive",
          confirmar: { titulo: `Excluir a versão ${v.revisao}?`, descricao: "Só esta versão é excluída; as outras ficam. Não dá para desfazer.", rotuloConfirmar: "Excluir" },
        }
      : null,
    ctx.podeGerir && unica
      ? {
          tipo: "acao", id: ACAO_FED_EXCLUIR_TUDO, rotulo: "Excluir o modelo federado", icone: Trash2, variant: "destructive",
          confirmar: { titulo: "Excluir o modelo federado?", descricao: "A pasta some até a próxima geração. Não dá para desfazer.", rotuloConfirmar: "Excluir" },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
```

Run: `npx vitest run src/modules/coordenacao/federado/acoes.test.ts` → PASS.

- [ ] **Step 3: Área nova e pasta no Desenvolvimento (puro, com teste)**

`src/modules/uploads/areas-projeto.ts`:

```ts
export const AREAS_PROJETO = ["recebidos", "base", "geral", "arts", "lixeira", "federado"] as const;
// …
/** Áreas listadas na raiz e no painel "Áreas do projeto". O federado mora DENTRO do Desenvolvimento (spec 2026-10-04 D4). */
export const AREAS_NA_RAIZ: readonly AreaProjeto[] = AREAS_PROJETO.filter((a) => a !== "federado");
```

e em `AREA_ROTULO`: `federado: { rotulo: "Modelo federado", descricao: "IFC único com as disciplinas, gerado na Compatibilização" },`.

`src/modules/uploads/pastas-da-lista.ts`, depois de `pastasDaRaiz`:

```ts
/**
 * A pasta "Modelo federado" (spec 2026-10-04 D4): no Desenvolvimento, no nível das disciplinas, mas é uma ÁREA
 * (Documento, não DocumentoDisciplina) — o destino abre a área mantendo a pasta-mãe na URL, para a trilha e a
 * árvore continuarem dentro do Desenvolvimento. Sem .zip: é um arquivo só.
 */
export function pastaDoModeloFederado(total: number): PastaNaLista {
  return {
    tipo: "area",
    chave: "area:federado",
    rotulo: "Modelo federado",
    titulo: "IFC único com as disciplinas, gerado na Compatibilização",
    status: null,
    disciplinaNome: null,
    total,
    destino: { disciplinaId: null, fase: null, ext: null, area: "federado", situacao: null, pasta: PASTA_DESENVOLVIMENTO },
    zip: null,
  };
}
```

Teste em `pastas-da-lista.test.ts`:

```ts
  it("pasta do modelo federado: área dentro do Desenvolvimento, sem .zip", () => {
    const p = pastaDoModeloFederado(3);
    expect(p).toMatchObject({ tipo: "area", rotulo: "Modelo federado", total: 3, zip: null });
    expect(p.destino).toMatchObject({ area: "federado", pasta: "desenvolvimento", disciplinaId: null, situacao: null });
  });
```

Run: `npx vitest run src/modules/uploads/` → PASS.

- [ ] **Step 4: Painel de áreas e conteúdo**

- `painel-areas-projeto.tsx`: `ICONE_AREA` ganha `federado: Boxes` (import de `lucide-react`); `visiveis` passa a
  `areas.filter((a) => a.visivel && AREAS_NA_RAIZ.includes(a.id))`.
- `conteudo-area-projeto.tsx`: `DadosAreas` ganha `modeloFederado: VersaoFederada[]` e `podeGerirFederado: boolean`;
  novo `case "federado": return <TabelaModeloFederado versoes={dados.modeloFederado} podeGerir={dados.podeGerirFederado} />;`

- [ ] **Step 5: Tabela das versões**

```tsx
// src/components/projetos/arquivos/tabela-modelo-federado.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { excluirModeloFederado, excluirVersaoModeloFederado } from "@/modules/coordenacao/federado/actions";
import { ACAO_FED_EXCLUIR_TUDO, ACAO_FED_EXCLUIR_VERSAO, itensDaVersaoFederada } from "@/modules/coordenacao/federado/acoes";
import type { VersaoFederada } from "@/modules/coordenacao/federado/service";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData } from "@/lib/utils";

function mb(n: number) {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Versões do IFC federado (spec 2026-10-04 §8): cada linha diz o que entrou nela. */
export function TabelaModeloFederado({ versoes, podeGerir }: { versoes: VersaoFederada[]; podeGerir: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  if (versoes.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nenhum modelo federado"
        description="Gere o IFC único na aba Compatibilização, pelo painel Disciplinas."
      />
    );
  }

  async function aoAcao(v: VersaoFederada, item: AcaoItemAcao) {
    // confirm SEMPRE antes do startTransition (React 19 trava o setState de dentro da action).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar", variant: "destructive" }))) return;
    start(async () => {
      const r =
        item.id === ACAO_FED_EXCLUIR_VERSAO
          ? await excluirVersaoModeloFederado({ versaoId: v.versaoId })
          : item.id === ACAO_FED_EXCLUIR_TUDO
            ? await excluirModeloFederado({ documentoId: v.documentoId })
            : null;
      if (r && !r.ok) return void toast.error(r.error);
      if (r) {
        toast.success("Excluído.");
        router.refresh();
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Arquivo</TableHead>
          <TableHead>Modelos</TableHead>
          <TableHead className="hidden md:table-cell">Gerado</TableHead>
          <TableHead className="w-10"><span className="sr-only">Ações</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versoes.map((v, i) => {
          const itens = itensDaVersaoFederada({ revisao: v.revisao, downloadUrl: v.downloadUrl, vigente: i === 0 }, { podeGerir, totalVersoes: versoes.length });
          return (
            <LinhaComMenu key={v.versaoId} itens={itens} onSelect={(item) => void aoAcao(v, item)} render={<TableRow className={i > 0 ? "text-muted-foreground" : undefined} />}>
              <TableCell className="max-w-[24rem]">
                <p className="truncate font-medium" title={v.nomeArquivo}>{v.nomeArquivo}</p>
                <p className="text-xs text-muted-foreground">{v.revisao}{i === 0 ? " · vigente" : ""} · {mb(v.tamanho)}</p>
                {v.avisos.map((a) => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
              </TableCell>
              <TableCell className="text-xs">
                {v.composicao.map((c) => <p key={`${c.grupo}-${c.nome}`} className="truncate" title={c.nome}>{c.grupo} · {c.revisao}</p>)}
              </TableCell>
              <TableCell className="hidden text-xs md:table-cell">{formatarData(v.criadoEm)}{v.autor ? ` · ${v.autor}` : ""}</TableCell>
              <TableCell>
                <BotaoAcoes itens={itens} onSelect={(item) => void aoAcao(v, item)} rotulo={`Ações de ${v.nomeArquivo}`} />
              </TableCell>
            </LinhaComMenu>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

A chamada de `confirm(...)` segue `tabela-area-documentos.tsx:216` (`title`, `description`, `confirmLabel`, `variant`).
Use `pending` como o `tabela-area-documentos.tsx` usa (desabilita as ações enquanto a exclusão roda).

- [ ] **Step 6: Árvore, lista, trilha e página**

`tela-documentos-projeto.tsx` (depois do bloco `podeCoordenacao…`):

```ts
  // Modelo federado (spec 2026-10-04 D6): quem vê a Compatibilização vê a pasta, sem a muralha por disciplina.
  const modeloFederado = podeCoordenacao ? await versoesDoModeloFederado(id) : [];
  const podeGerirFederado = podeCoordenacao && (await can(user, "coordenacao", "gerir"));
```

e em `areas`: `{ id: "federado", total: modeloFederado.length, visivel: modeloFederado.length > 0 },`;
`dadosAreas` ganha `modeloFederado, podeGerirFederado`.

`documentos-shell.tsx`:

```ts
  const federado = areas.find((a) => a.id === "federado" && a.visivel) ?? null;
  const trilha =
    areaSelecionada === "federado"
      ? [segmentoDaRaiz(PASTA_DESENVOLVIMENTO)!, { chave: "area:federado", rotulo: rotuloArea("federado"), titulo: null, destino: pastaDoModeloFederado(0).destino }]
      : areaSelecionada
        ? [/* como hoje */]
        : /* como hoje */;
  const areasComoPasta = areas
    .filter((a) => a.visivel && a.id !== "lixeira" && AREAS_NA_RAIZ.includes(a.id))
    .map(/* como hoje */);
```

e no cálculo de `pastas`, no ramo `pastasDoNivel(...)`: quando `raiz === PASTA_DESENVOLVIMENTO && nivel === "raiz" && federado`,
acrescente `pastaDoModeloFederado(federado.total)` no FIM da lista (depois das disciplinas). Passe
`modeloFederado={federado ? { total: federado.total, ativo: areaSelecionada === "federado" } : null}` às duas
`<ArvoreDocumentos …>`.

`arvore-documentos.tsx`: prop nova `modeloFederado?: { total: number; ativo: boolean } | null`. Dentro do
`<ul role="group">` da pasta-mãe, logo depois do `filtradas.map(...)`, só quando `r.id === PASTA_DESENVOLVIMENTO`:

```tsx
            {r.id === PASTA_DESENVOLVIMENTO && modeloFederado && !termo && (
              <li role="treeitem" aria-selected={modeloFederado.ativo}>
                <button
                  type="button"
                  onClick={() =>
                    setParams({ area: "federado", pasta: PASTA_DESENVOLVIMENTO, disciplinaId: null, fase: null, ext: null, listaId: null, situacao: null })
                  }
                  title="IFC único com as disciplinas, gerado na Compatibilização"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-[1.375rem] text-left text-xs transition-colors",
                    modeloFederado.ativo ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
                  )}
                >
                  <Boxes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Modelo federado</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{modeloFederado.total}</span>
                </button>
              </li>
            )}
```

Com o federado aberto, a raiz é o Desenvolvimento (a URL tem `pasta=desenvolvimento`), então a árvore já abre esse
ramo. Confira que o nó "Desenvolvimento" NÃO fica destacado (`selecionada` usa `!areaAtiva`).

- [ ] **Step 7: Ver na tela**

Com o `dev` no ar (porta 3001) e um federado gerado (Task 10):
- Arquivos do projeto → Desenvolvimento: "Modelo federado" aparece depois das disciplinas, na lista e na árvore.
- Clicar abre a tabela de versões; a trilha mostra "Desenvolvimento › Modelo federado".
- O botão direito na linha abre o mesmo menu do `⋯`.
- O "Modelo federado" **não** aparece na raiz geral nem em "Áreas do projeto".
- O mesmo vale em `/arquivos` (diretório geral) → ano → projeto.
- Logado como alguém sem `coordenacao:ver`: a pasta some.
- Em 390×844: `scrollWidth === 390`. Em 1366×768 com o menu aberto: o cabeçalho não sobrepõe a barra.

- [ ] **Step 8: Commit**

```bash
git add src/modules/coordenacao/federado/acoes.ts src/modules/coordenacao/federado/acoes.test.ts src/components/projetos/arquivos/tabela-modelo-federado.tsx src/modules/uploads/areas-projeto.ts src/modules/uploads/pastas-da-lista.ts src/modules/uploads/pastas-da-lista.test.ts src/components/projetos/arquivos/painel-areas-projeto.tsx src/components/projetos/arquivos/conteudo-area-projeto.tsx src/components/projetos/arquivos/documentos-shell.tsx src/components/projetos/arquivos/arvore-documentos.tsx src/components/projetos/arquivos/tela-documentos-projeto.tsx
git commit -m "feat(arquivos): pasta Modelo federado dentro do Desenvolvimento"
git show --stat HEAD
```

---

### Task 12: Smoke, verificação com IFC real e documentação

**Modelo:** implementa **Sonnet**, revisa **Opus** — smoke e verificação com IFC real; revisor lê o resultado do IFC real e decide se está pronto.

**Files:**
- Create: `scripts/smoke-ifc-federado.ts`, `scripts/verificar-ifc-federado.ts`
- Modify: `package.json`, `CLAUDE.md`, `docs/manual/` (página da Compatibilização + `novidades.md`)

**Interfaces:**
- Consumes: `criarGeracao`, `processarGeracao`, `versoesDoModeloFederado`, `candidatosDoProjeto` (Task 8), `ifcDeTeste` (Task 2), `modelosCoordenacao`, `recebidosDoProjeto`.

- [ ] **Step 1: Smoke**

```ts
// scripts/smoke-ifc-federado.ts
/**
 * Smoke do IFC federado (spec docs/superpowers/specs/2026-10-04-ifc-federado-design.md) contra o banco de dev.
 * O vitest cobre o motor puro; aqui vai o I/O: o child de verdade, Documento/versões, a trava de uma geração viva,
 * o arquivo que some, a recusa de unidade e o federado fora de Recebidos e da Compatibilização. Abre a saída com
 * web-ifc e roda o converter-ifc sobre ela (prova que a geometria é legível).
 *
 * Uso: npm run smoke:ifc-federado
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { IfcAPI, IFCPROJECT, IFCWALL } from "web-ifc";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";
import { ifcDeTeste } from "../src/modules/coordenacao/federado/fixture-ifc";
import { candidatosDoProjeto, criarGeracao, processarGeracao, versoesDoModeloFederado } from "../src/modules/coordenacao/federado/service";
import { modelosCoordenacao } from "../src/modules/coordenacao/queries";
import { recebidosDoProjeto } from "../src/modules/documentos-cliente/queries";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}
async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-federado-${Date.now()}`;
const dir = `tmp/${tag}`;

function gravar(nome: string, texto: string): { caminho: string; tamanho: number } {
  const rel = `${dir}/${nome}`;
  fs.mkdirSync(path.dirname(resolverCaminho(rel)), { recursive: true });
  fs.writeFileSync(resolverCaminho(rel), texto, "latin1");
  return { caminho: rel, tamanho: Buffer.byteLength(texto, "latin1") };
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  try {
    const novoModelo = async (disc: string, nome: string, texto: string) => {
      const d = await prisma.disciplina.create({ data: { projetoId: projeto.id, disciplinaTextoLegado: disc } });
      const f = gravar(nome, texto);
      const u = await prisma.upload.create({
        data: { disciplinaId: d.id, pacote: "A", nomeArquivo: nome, caminho: f.caminho, hashSha256: "x", tamanho: f.tamanho, autorId: admin.id },
      });
      await prisma.conversaoModelo.create({ data: { uploadId: u.id, status: "concluido", caminhoFrag: `${dir}/${u.id}.frag` } });
      return u;
    };
    const est = await novoModelo("Estrutural", "est.ifc", ifcDeTeste({ semente: "E" }));
    const ele = await novoModelo("Elétrica", "ele.ifc", ifcDeTeste({ semente: "L", dx: 5000 }));
    const met = await novoModelo("Hidráulica", "hid.ifc", ifcDeTeste({ semente: "H", unidade: "METRE" }));

    // ── elegibilidade ──
    const cand = await candidatosDoProjeto(projeto.id);
    check("lê schema e unidade dos três", cand.every((c) => c.schema === "IFC4" && c.unidade !== undefined), cand);
    const recusa = await erroDe(() => criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, met.id], autorId: admin.id }));
    check("unidade diferente é recusada com a frase da regra", /Em metros — os marcados estão em milímetros/.test(recusa ?? ""), recusa);

    // ── geração 1 ──
    const g1 = await criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id });
    const dupla = await erroDe(() => criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id }));
    check("segunda geração viva é recusada", dupla === "Já há uma geração do modelo federado em andamento neste projeto.", dupla);
    await processarGeracao(g1.geracaoId, { notificarAutor: false });
    const v1 = await versoesDoModeloFederado(projeto.id);
    check("primeira geração vira R00", v1.length === 1 && v1[0].revisao === "R00" && /-FEDERADO-R00\.ifc$/.test(v1[0].nomeArquivo), v1);
    check("composição gravada na versão", v1[0]?.composicao.map((c) => c.grupo).join(",") === "Estrutural,Elétrica", v1[0]?.composicao);

    // ── a saída é IFC válido ──
    const versao = await prisma.documentoVersao.findUniqueOrThrow({ where: { id: v1[0].versaoId }, select: { caminho: true } });
    const api = new IfcAPI();
    api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
    await api.Init();
    const modelo = api.OpenModel(new Uint8Array(fs.readFileSync(resolverCaminho(versao.caminho))));
    check("web-ifc abre: um IfcProject", api.GetLineIDsWithType(modelo, IFCPROJECT).size() === 1);
    check("web-ifc abre: as duas paredes", api.GetLineIDsWithType(modelo, IFCWALL).size() === 2);
    api.CloseModel(modelo);
    const conv = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "--tsconfig", "tsconfig.server.json", "scripts/converter-ifc.ts", versao.caminho, `${dir}/federado.frag`], { encoding: "utf8" });
    check("converter-ifc converte o federado", conv.status === 0 && /"ok":true/.test(conv.stdout), conv.stdout.slice(-300));

    // ── fora de Recebidos e da Compatibilização ──
    check("federado fora de Recebidos", (await recebidosDoProjeto(projeto.id)).every((d) => d.nome !== "Modelo federado"));
    check("federado fora da lista de modelos", (await modelosCoordenacao(projeto.id)).length === 3);

    // ── geração 2 vira R01 ──
    const g2 = await criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id });
    await processarGeracao(g2.geracaoId, { notificarAutor: false });
    check("segunda geração vira R01 do mesmo documento", (await versoesDoModeloFederado(projeto.id)).map((v) => v.revisao).join(",") === "R01,R00");

    // ── arquivo que some entre o pedido e o job ──
    const g3 = await criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id });
    fs.rmSync(resolverCaminho(`${dir}/ele.ifc`));
    await processarGeracao(g3.geracaoId, { notificarAutor: false });
    const g3db = await prisma.geracaoModeloFederado.findUniqueOrThrow({ where: { id: g3.geracaoId } });
    check("arquivo sumido: erro dizendo qual, sem versão nova", g3db.status === "erro" && /ele\.ifc \(Elétrica\)/.test(g3db.erro ?? "") && (await versoesDoModeloFederado(projeto.id)).length === 2, g3db.erro);

    // ── geração travada é liberada ──
    gravar("ele.ifc", ifcDeTeste({ semente: "L", dx: 5000 }));
    const presa = await criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id });
    await prisma.geracaoModeloFederado.update({ where: { id: presa.geracaoId }, data: { status: "processando", criadoEm: new Date(Date.now() - 46 * 60 * 1000) } });
    const nova = await erroDe(() => criarGeracao({ projetoId: projeto.id, modeloIds: [est.id, ele.id], autorId: admin.id }));
    const presaDb = await prisma.geracaoModeloFederado.findUniqueOrThrow({ where: { id: presa.geracaoId } });
    check("travada há 46 min é liberada e a nova entra", nova === null && presaDb.status === "erro", { nova, status: presaDb.status });
  } finally {
    const docs = await prisma.documento.findMany({ where: { projetoId: projeto.id }, select: { versoes: { select: { caminho: true } } } });
    await prisma.geracaoModeloFederado.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.documento.deleteMany({ where: { projetoId: projeto.id } });
    for (const d of docs) for (const v of d.versoes) fs.rmSync(resolverCaminho(v.caminho), { force: true });
    await prisma.conversaoModelo.deleteMany({ where: { upload: { disciplina: { projetoId: projeto.id } } } });
    await prisma.upload.deleteMany({ where: { disciplina: { projetoId: projeto.id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    fs.rmSync(resolverCaminho(dir), { recursive: true, force: true });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
```

`Upload` exige `autorId` e (sem `pastaId`) `pacote` — o `create` acima passa os dois. `recebidosDoProjeto(projetoId, opts?)`
funciona só com o id.

`package.json`:

```json
    "smoke:ifc-federado": "tsx --tsconfig tsconfig.server.json scripts/smoke-ifc-federado.ts",
    "verify:ifc-federado": "tsx --tsconfig tsconfig.server.json scripts/verificar-ifc-federado.ts",
```

Run: `npm run smoke:ifc-federado`
Expected: todas as linhas `ok` e "Smoke OK".

- [ ] **Step 2: Verificação com IFC real**

```ts
// scripts/verificar-ifc-federado.ts
/**
 * Junta os modelos vigentes de um projeto REAL do banco de dev (sem gravar Documento), converte o resultado para
 * .frag e compara: a contagem de IfcProduct do federado tem de ser a soma das dos modelos. Rodar em ao menos um
 * projeto Revit (mm) com 3+ disciplinas antes do merge (spec §9).
 *
 * Uso: npm run verify:ifc-federado -- <projetoId>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { IfcAPI, IFCPRODUCT } from "web-ifc";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";
import { candidatosDoProjeto } from "../src/modules/coordenacao/federado/service";
import { avaliarSelecao } from "../src/modules/coordenacao/federado/regras";
import { federar } from "../src/modules/coordenacao/federado/federacao";

async function contarProdutos(api: IfcAPI, rel: string): Promise<number> {
  const id = api.OpenModel(new Uint8Array(fs.readFileSync(resolverCaminho(rel))));
  try {
    return api.GetLineIDsWithType(id, IFCPRODUCT, true).size();
  } finally {
    api.CloseModel(id);
  }
}

async function main() {
  const projetoId = process.argv[2];
  if (!projetoId) throw new Error("Uso: npm run verify:ifc-federado -- <projetoId>");
  const cand = await candidatosDoProjeto(projetoId);
  const av = avaliarSelecao(cand, cand.map((c) => c.modeloId));
  for (const c of cand) console.log(`${av.validos.includes(c.modeloId) ? "  entra" : "  fora "} ${c.grupo} · ${c.nome} · ${c.schema} · ${c.unidade} ${av.motivos[c.modeloId] ?? ""}`);
  if (!av.podeGerar) throw new Error(av.motivoGerar ?? "nada a juntar");
  const itens = cand.filter((c) => av.validos.includes(c.modeloId)).map((c) => c.item);
  const saida = `tmp/verificar-federado-${Date.now()}.ifc`;
  const inicio = Date.now();
  const r = await federar({ entradas: itens.map((i) => ({ caminho: i.caminho, rotulo: i.nome })), saida, cabecalho: { nomeArquivo: "verificacao.ifc", autor: "verificação", quando: new Date().toISOString().slice(0, 19), composicao: itens } });
  if (!r.ok) throw new Error(r.erro);
  console.log(`federado: ${(r.tamanho / 1024 / 1024).toFixed(1)} MB em ${((Date.now() - inicio) / 1000).toFixed(1)} s; avisos: ${r.avisos.join(" | ") || "nenhum"}`);

  const api = new IfcAPI();
  api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
  await api.Init();
  let soma = 0;
  for (const i of itens) soma += await contarProdutos(api, i.caminho);
  const total = await contarProdutos(api, saida);
  console.log(`IfcProduct: soma dos modelos ${soma}, federado ${total} → ${soma === total ? "OK" : "DIFERENTE"}`);
  fs.rmSync(resolverCaminho(saida), { force: true });
  process.exitCode = soma === total ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
```

`GetLineIDsWithType(modelo, tipo, includeInherited)`: confira no `node_modules/web-ifc/web-ifc-api.d.ts` que o 3º
parâmetro existe na 0.0.77; se não existir, some as contagens de `IFCWALL`, `IFCSLAB`, `IFCBEAM`, `IFCCOLUMN`,
`IFCDOOR`, `IFCWINDOW`, `IFCPIPESEGMENT`, `IFCDUCTSEGMENT` e `IFCFLOWTERMINAL` (amostra suficiente para a comparação).

Run: `npm run verify:ifc-federado -- <id de um projeto do dev com 3+ IFCs>` (liste com
`SELECT p.id, count(*) FROM upload u JOIN disciplina d ON d.id=u."disciplinaId" JOIN projeto p ON p.id=d."projetoId" WHERE u."nomeArquivo" ILIKE '%.ifc' GROUP BY p.id ORDER BY 2 DESC LIMIT 5;`).
Expected: `IfcProduct: … → OK`. Anote tamanho e tempo no relato final. O `IfcProject` absorvido não é `IfcProduct`,
então não entra na diferença.

- [ ] **Step 3: Documentação**

- `CLAUDE.md`: na lista de comandos, `npm run smoke:ifc-federado` e `npm run verify:ifc-federado -- <projetoId>`;
  no parágrafo da Coordenação BIM, uma frase: "**IFC federado** (`coordenacao/federado/`): junção no texto STEP em
  child process (`scripts/federar-ifc.ts`, job `gerar-ifc-federado`), vira `Documento` origem `modelo_federado`
  na pasta Modelo federado do Desenvolvimento; filtros por origem só via `documentos-cliente/origens.ts`."
- `docs/manual/`: na página da Compatibilização (ache com `grep -ril compatibiliza docs/manual`), uma seção
  "Exportar o modelo federado" (o que faz, schema/unidade iguais, onde fica, quem vê); em `novidades.md`, uma entrada
  em linguagem de usuário.

- [ ] **Step 4: Verificar tudo**

Run: `npm run lint` (sem `--quiet`), `npm test`, e — com o `next dev` desta pasta PARADO — `npm run build`.
Expected: os três verdes. Depois `npm run smoke:ifc-federado` de novo.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-ifc-federado.ts scripts/verificar-ifc-federado.ts package.json CLAUDE.md docs/manual/
git commit -m "test(coordenacao): smoke e verificação com IFC real do modelo federado"
git show --stat HEAD
```

---

## Fora deste plano (Fase 2, spec §10)

Ponteiros Compartilhado/Liberado no `Documento`, a pasta "Modelo federado" dentro das pastas do cliente e
`LinkPublicoArquivos.incluirModeloFederado` nas quatro rotas do link. Plano próprio depois da Fase 1 em dev.
