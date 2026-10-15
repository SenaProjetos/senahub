# Link projeto × ficha do funil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Linkar um projeto existente a uma ficha do funil em Contratado, importando para a pasta Geral os anexos escolhidos (e preenchendo só os campos vazios do projeto), sem sobrescrever nada.

**Architecture:** Módulo novo `src/modules/comercial/vinculo/` em camadas — `regras.ts` (puro, testado), `queries.ts` (leitura e prévia, server-only), `service.ts` (cópia de arquivos + uma transação), `actions.ts` (`defineAction`). Um diálogo cliente (`LinkarProjetoDialog`) serve dois pontos de entrada: a ficha contratada e o ⋯ do projeto. Sem migração: usa `Projeto.negociacaoId`, `Documento` (origem `interno`) e `Documento.exibirEmRecebidos`, que já existem.

**Tech Stack:** Next 15 / React 19 Server Actions, Prisma 7 (`@/generated/prisma/client`), Zod, vitest (env node), base-ui (não Radix), `tsx` para o smoke.

**Spec:** [docs/superpowers/specs/2026-10-15-vinculo-projeto-ficha-design.md](../specs/2026-10-15-vinculo-projeto-ficha-design.md)

## Global Constraints

- Código e identificadores em inglês só onde o repositório já faz assim; nomes de domínio e **toda string de UI em pt-BR**. Commits Conventional em pt-BR, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Worktree VS Code: pasta `SENAHub-remake-vscode`, branch `dev-vscode`, banco `senahub_remake_vscode` (porta 5433), dev server na porta **3001** (`npm run dev -- -p 3001`). Nunca mexer na outra pasta/branch/banco.
- Stage só arquivos específicos (`git add <caminho>`), nunca `git add -A`/`.`; conferir com `git show --stat` depois de cada commit. Nunca `2>/dev/null` em `git add`.
- Toda mutação passa por `defineAction` (auditoria automática); erro de negócio = `throw new ActionError("msg")`. Leitura via action usa `audit: false`.
- `await confirm()` SEMPRE antes de `startTransition`. Nunca `Promise.all` em cliente de `$transaction` (aguardar uma a uma).
- Arquivo do funil **nunca** é compartilhado por caminho: o link **copia** o arquivo para `documentos/<clienteId>/<hex><ext>` (excluir o anexo no funil apaga o arquivo do disco).
- Nunca sobrescrever dado do projeto: só preenche `valorContrato`, `areaM2`, `tipoEmpreendimentoId`, `descricao` quando vazios.
- Disciplinas da ficha **não** são importadas (decisão do dono, 2026-10-15). Reimportar anexos novos depois do link está fora do escopo.
- Permissão do link = `comercial:gerir` **e** `projetos:gerir`; importar para o Geral dispensa `arquivos_gerais:gerir`. Escopo de dados do projeto: `escopoProjeto(user)`.
- Sem `export` de não-função em arquivo `"use server"`. Arquivos puros (`regras.ts`) não importam Prisma/server-only/Next (só `import type`).
- Componentes: `*-dialog.tsx` = modal. `Dialog` é base-ui (`render={…}`, não `asChild`). Formulário longo em `DialogBody`.
- Antes de declarar pronto: rodar `docs/PROTOCOLO_AUDITORIA_FINAL.md` (Task 8).

## Review Focus

Entradas e condições que o spec implica e que nenhuma tarefa de "caminho feliz" exercitaria — cada uma tem teste na tarefa dona:

1. **Anexo do funil excluído depois do link** → o projeto mantém o arquivo (cópia, não referência). Smoke check 5 (Task 4).
2. **Dois cliques / duas pessoas linkando o mesmo projeto** → só um grava e nenhum arquivo copiado fica órfão no disco. Smoke check 8 (Task 4).
3. **Arquivo do anexo sumiu do disco** → aparece desabilitado na prévia e o servidor recusa a chave. Teste `marcarArquivos` (Task 2) + smoke check 11 (Task 4).
4. **Responsável da ficha externo, inativo ou já membro** → não cria coordenador. Testes de `planejarCampos` (Task 2).
5. **Ficha sem lead de origem e sem PDF** (lista de arquivos vazia) → prévia e link funcionam com zero arquivos. Smoke check 12 (Task 4).
6. **Extensão do arquivo em maiúscula ou com caractere estranho** → vira extensão minúscula e segura no caminho copiado. Teste `extensaoDe` (Task 2).
7. **Projeto criado pelo aceite de proposta** (tem `Proposta.projetoId`) → desfazer link é recusado, para não quebrar a invariante "os dois caminhos gravados juntos". Smoke check 13 (Task 4), condicional a existir um no banco de dev.

---

### Task 1: Eventos de timeline `PROJETO_LINKADO` / `PROJETO_DESLINKADO`

**Files:**
- Modify: `src/modules/comercial/atividade-eventos.ts:29` (união) e `:140` (switch)
- Test: `src/modules/comercial/atividade-eventos.test.ts:16-23`

**Interfaces:**
- Produces: dois membros novos em `EventoAtividade`:
  `{ evento: "PROJETO_LINKADO"; codigo: string; nome: string }` e `{ evento: "PROJETO_DESLINKADO"; codigo: string; nome: string }` — consumidos por `registrarAtividade` na Task 4.

- [ ] **Step 1: Escrever o teste que falha**

Em `atividade-eventos.test.ts`, no array `todos` (logo após a linha do `PROJETO_CRIADO`), acrescentar:

```ts
    { evento: "PROJETO_LINKADO", codigo: "260031", nome: "Residencial Aurora" },
    { evento: "PROJETO_DESLINKADO", codigo: "260031", nome: "Residencial Aurora" },
```

Trocar o título do primeiro `it` e acrescentar um bloco de descrição exata ao final do arquivo:

```ts
  it("os 15 eventos produzem tipo SISTEMA", () => {
```

```ts
describe("PROJETO_LINKADO / PROJETO_DESLINKADO", () => {
  it("narram o link e o desfazer com código e nome do projeto", () => {
    expect(
      descreverEvento({ evento: "PROJETO_LINKADO", codigo: "260031", nome: "Aurora" }).descricao,
    ).toBe("Projeto 260031 linkado a esta ficha: Aurora");
    expect(
      descreverEvento({ evento: "PROJETO_DESLINKADO", codigo: "260031", nome: "Aurora" }).descricao,
    ).toBe("Link com o projeto 260031 desfeito: Aurora");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/comercial/atividade-eventos.test.ts`
Expected: FAIL (erro de tipo/`switch` sem os casos novos — `descricao` indefinida).

- [ ] **Step 3: Implementar**

Em `atividade-eventos.ts`, na união, logo após a linha de `PROJETO_CRIADO`:

```ts
  | { evento: "PROJETO_LINKADO"; codigo: string; nome: string }
  | { evento: "PROJETO_DESLINKADO"; codigo: string; nome: string }
```

No `switch`, logo após o `case "PROJETO_CRIADO"`:

```ts
    case "PROJETO_LINKADO":
      return {
        tipo: "SISTEMA",
        descricao: `Projeto ${ev.codigo} linkado a esta ficha: ${ev.nome}`,
        metadata: { evento: ev.evento, codigo: ev.codigo },
      };

    case "PROJETO_DESLINKADO":
      return {
        tipo: "SISTEMA",
        descricao: `Link com o projeto ${ev.codigo} desfeito: ${ev.nome}`,
        metadata: { evento: ev.evento, codigo: ev.codigo },
      };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/comercial/atividade-eventos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/comercial/atividade-eventos.ts src/modules/comercial/atividade-eventos.test.ts
git commit -m "feat(comercial): eventos de timeline para link e desfazer link de projeto

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 2: Regras puras do link (`regras.ts`)

**Files:**
- Create: `src/modules/comercial/vinculo/regras.ts`
- Test: `src/modules/comercial/vinculo/regras.test.ts`

**Interfaces:**
- Produces (consumidos pelas Tasks 3–6; nomes exatos):
  - constantes de mensagem: `MOTIVO_FICHA_EXCLUIDA`, `MOTIVO_NAO_CONTRATADA`, `MOTIVO_CLIENTE_DIFERENTE`, `MOTIVO_JA_LINKADO_ESTA`, `MOTIVO_JA_LINKADO_OUTRA`, `MOTIVO_CRIADO_PELO_ACEITE`, `MOTIVO_SEM_ARQUIVO`, `MOTIVO_JA_NO_PROJETO`, `MOTIVO_REPETIDO`
  - tipos: `CampoVinculo`, `ProjetoParaVinculo`, `NegociacaoParaVinculo`, `PlanoCampos`, `ItemArquivo`, `ItemArquivoPrevia`, `AtividadeParaResumo`, `PreviaVinculo`
  - `ROTULO_CAMPO: Record<CampoVinculo, string>`
  - `motivoParaNaoVincular(p: ProjetoParaVinculo, n: NegociacaoParaVinculo): string | null`
  - `planejarCampos(p, n, responsavelEhInterno: boolean): PlanoCampos`
  - `marcarArquivos(itens: ItemArquivo[], hashesNoProjeto: ReadonlySet<string>): ItemArquivoPrevia[]`
  - `resumoHistorico(atividades: AtividadeParaResumo[], hojeTexto: string): string | null`
  - `descricaoComResumo(descricaoAtual: string | null, resumo: string | null): string | null`
  - `extensaoDe(nomeArquivo: string): string`
  - `dataBr(d: Date): string`

- [ ] **Step 1: Escrever os testes**

Criar `src/modules/comercial/vinculo/regras.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MOTIVO_CLIENTE_DIFERENTE,
  MOTIVO_FICHA_EXCLUIDA,
  MOTIVO_JA_LINKADO_ESTA,
  MOTIVO_JA_LINKADO_OUTRA,
  MOTIVO_JA_NO_PROJETO,
  MOTIVO_NAO_CONTRATADA,
  MOTIVO_REPETIDO,
  MOTIVO_SEM_ARQUIVO,
  dataBr,
  descricaoComResumo,
  extensaoDe,
  marcarArquivos,
  motivoParaNaoVincular,
  planejarCampos,
  resumoHistorico,
  type ItemArquivo,
  type NegociacaoParaVinculo,
  type ProjetoParaVinculo,
} from "./regras";

const projeto = (o: Partial<ProjetoParaVinculo> = {}): ProjetoParaVinculo => ({
  id: "p1",
  clienteId: "c1",
  negociacaoId: null,
  valorContrato: null,
  areaM2: null,
  tipoEmpreendimentoId: null,
  descricao: null,
  membrosIds: [],
  ...o,
});

const ficha = (o: Partial<NegociacaoParaVinculo> = {}): NegociacaoParaVinculo => ({
  id: "n1",
  titulo: "Residencial Aurora",
  clienteId: "c1",
  estagio: "CONTRATADO",
  excluida: false,
  valorNegociado: 150000,
  areaM2: 320.5,
  tipoEmpreendimentoId: "t1",
  responsavelId: "u1",
  ...o,
});

const item = (o: Partial<ItemArquivo> = {}): ItemArquivo => ({
  chave: "lead:a1",
  origem: "anexo_lead",
  nome: "Solicitação",
  nomeArquivo: "solicitacao.pdf",
  caminho: "comercial/leads/aa.pdf",
  mime: "application/pdf",
  tamanho: 10,
  hashSha256: "h1",
  existe: true,
  ...o,
});

describe("motivoParaNaoVincular", () => {
  it("ficha contratada, mesmo cliente, projeto livre: pode", () => {
    expect(motivoParaNaoVincular(projeto(), ficha())).toBeNull();
  });
  it("ficha excluída", () => {
    expect(motivoParaNaoVincular(projeto(), ficha({ excluida: true }))).toBe(MOTIVO_FICHA_EXCLUIDA);
  });
  it("só Contratado", () => {
    expect(motivoParaNaoVincular(projeto(), ficha({ estagio: "PERDIDO" }))).toBe(MOTIVO_NAO_CONTRATADA);
    expect(motivoParaNaoVincular(projeto(), ficha({ estagio: "ORCAMENTO" }))).toBe(MOTIVO_NAO_CONTRATADA);
  });
  it("cliente diferente", () => {
    expect(motivoParaNaoVincular(projeto({ clienteId: "c2" }), ficha())).toBe(MOTIVO_CLIENTE_DIFERENTE);
  });
  it("projeto já linkado: a esta ficha ou a outra", () => {
    expect(motivoParaNaoVincular(projeto({ negociacaoId: "n1" }), ficha())).toBe(MOTIVO_JA_LINKADO_ESTA);
    expect(motivoParaNaoVincular(projeto({ negociacaoId: "n9" }), ficha())).toBe(MOTIVO_JA_LINKADO_OUTRA);
  });
});

describe("planejarCampos", () => {
  it("projeto vazio recebe tudo o que a ficha tem", () => {
    const plano = planejarCampos(projeto(), ficha(), true);
    expect(plano.preenche).toEqual({ valorContrato: 150000, areaM2: 320.5, tipoEmpreendimentoId: "t1" });
    expect(plano.mantem).toEqual([]);
  });
  it("nunca sobrescreve: campo já preenchido vai para 'mantém'", () => {
    const plano = planejarCampos(projeto({ valorContrato: 99, areaM2: 10 }), ficha(), true);
    expect(plano.preenche).toEqual({ tipoEmpreendimentoId: "t1" });
    expect(plano.mantem).toEqual(["valorContrato", "areaM2"]);
  });
  it("campo que a ficha não tem não é oferecido nem listado como mantido", () => {
    const plano = planejarCampos(projeto(), ficha({ valorNegociado: null, areaM2: null, tipoEmpreendimentoId: null }), true);
    expect(plano.preenche).toEqual({});
    expect(plano.mantem).toEqual([]);
  });
  it("coordenador: responsável interno que ainda não é membro", () => {
    expect(planejarCampos(projeto(), ficha(), true).coordenadorId).toBe("u1");
  });
  it("coordenador: já é membro (qualquer papel) fica como está", () => {
    expect(planejarCampos(projeto({ membrosIds: ["u1"] }), ficha(), true).coordenadorId).toBeNull();
  });
  it("coordenador: externo ou inativo não entra", () => {
    expect(planejarCampos(projeto(), ficha(), false).coordenadorId).toBeNull();
  });
  it("coordenador: ficha sem responsável", () => {
    expect(planejarCampos(projeto(), ficha({ responsavelId: null }), true).coordenadorId).toBeNull();
  });
});

describe("marcarArquivos", () => {
  it("arquivo normal vem marcado para importar", () => {
    const [a] = marcarArquivos([item()], new Set());
    expect(a.importarPadrao).toBe(true);
    expect(a.motivoNaoImportar).toBeNull();
  });
  it("hash já no projeto: desmarcado com o motivo", () => {
    const [a] = marcarArquivos([item()], new Set(["h1"]));
    expect(a.importarPadrao).toBe(false);
    expect(a.motivoNaoImportar).toBe(MOTIVO_JA_NO_PROJETO);
  });
  it("hash repetido dentro da própria lista: só o segundo é marcado como repetido", () => {
    const [a, b] = marcarArquivos([item({ chave: "x1" }), item({ chave: "x2" })], new Set());
    expect(a.importarPadrao).toBe(true);
    expect(b.motivoNaoImportar).toBe(MOTIVO_REPETIDO);
  });
  it("arquivo ausente no disco: desmarcado, motivo próprio, vence a deduplicação", () => {
    const [a] = marcarArquivos([item({ existe: false })], new Set(["h1"]));
    expect(a.importarPadrao).toBe(false);
    expect(a.motivoNaoImportar).toBe(MOTIVO_SEM_ARQUIVO);
  });
  it("sem hash nunca conta como duplicado", () => {
    const r = marcarArquivos([item({ chave: "x1", hashSha256: null }), item({ chave: "x2", hashSha256: null })], new Set(["h1"]));
    expect(r.every((a) => a.importarPadrao)).toBe(true);
  });
});

describe("resumoHistorico", () => {
  const nota = (dia: number, descricao = `nota ${dia}`, tipo = "NOTA") => ({
    tipo,
    descricao,
    createdAt: new Date(Date.UTC(2026, 9, dia, 15)),
  });

  it("sem nota nem reunião: null", () => {
    expect(resumoHistorico([], "15/10/2026")).toBeNull();
    expect(resumoHistorico([nota(1, "x", "SISTEMA"), nota(2, "y", "LIGACAO")], "15/10/2026")).toBeNull();
  });
  it("ignora descrição em branco", () => {
    expect(resumoHistorico([nota(1, "   ")], "15/10/2026")).toBeNull();
  });
  it("cabeçalho com a data de importação e linhas com data, tipo e texto", () => {
    const r = resumoHistorico([nota(3, "Cliente pediu revisão"), nota(5, "Reunião de kickoff", "REUNIAO")], "15/10/2026")!;
    const linhas = r.split("\n");
    expect(linhas[0]).toBe("Histórico comercial (importado em 15/10/2026)");
    expect(linhas[1]).toBe("- 03/10/2026 · Nota: Cliente pediu revisão");
    expect(linhas[2]).toBe("- 05/10/2026 · Reunião: Reunião de kickoff");
  });
  it("máximo de 10 linhas: as 10 mais recentes, em ordem cronológica", () => {
    const todas = Array.from({ length: 12 }, (_, i) => nota(i + 1));
    const linhas = resumoHistorico(todas, "15/10/2026")!.split("\n");
    expect(linhas).toHaveLength(11);
    expect(linhas[1]).toContain("03/10/2026");
    expect(linhas[10]).toContain("12/10/2026");
  });
  it("corta cada linha em 200 caracteres com reticências e colapsa espaços", () => {
    const r = resumoHistorico([nota(1, "x".repeat(300))], "15/10/2026")!;
    const texto = r.split("\n")[1].split(": ")[1];
    expect(texto).toHaveLength(200);
    expect(texto.endsWith("…")).toBe(true);
    const r2 = resumoHistorico([nota(1, "a   b\n\nc")], "15/10/2026")!;
    expect(r2.split("\n")[1]).toBe("- 01/10/2026 · Nota: a b c");
  });
  it("nota legada do lead conta como Nota", () => {
    const r = resumoHistorico([nota(2, "antiga", "NOTA_LEGADA")], "15/10/2026")!;
    expect(r.split("\n")[1]).toBe("- 02/10/2026 · Nota: antiga");
  });
});

describe("descricaoComResumo", () => {
  it("sem resumo, nada a gravar", () => {
    expect(descricaoComResumo(null, null)).toBeNull();
  });
  it("descrição já preenchida não é tocada", () => {
    expect(descricaoComResumo("Casa de praia", "Histórico…")).toBeNull();
  });
  it("descrição vazia ou só espaços recebe o resumo", () => {
    expect(descricaoComResumo(null, "Histórico…")).toBe("Histórico…");
    expect(descricaoComResumo("   ", "Histórico…")).toBe("Histórico…");
  });
});

describe("extensaoDe", () => {
  it("minúscula e com ponto", () => {
    expect(extensaoDe("Planta.PDF")).toBe(".pdf");
    expect(extensaoDe("arquivo.tar.gz")).toBe(".gz");
  });
  it("sem extensão: vazio", () => {
    expect(extensaoDe("sem-extensao")).toBe("");
  });
  it("tira caractere que não seja letra, número ou ponto", () => {
    expect(extensaoDe("x.p$f")).toBe(".pf");
  });
});

describe("dataBr", () => {
  it("dd/mm/aaaa no fuso de São Paulo", () => {
    expect(dataBr(new Date("2026-10-15T12:00:00Z"))).toBe("15/10/2026");
    // 01:00 UTC ainda é o dia anterior em São Paulo.
    expect(dataBr(new Date("2026-10-15T01:00:00Z"))).toBe("14/10/2026");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/comercial/vinculo/regras.test.ts`
Expected: FAIL ("Cannot find module './regras'").

- [ ] **Step 3: Implementar `regras.ts`**

Criar `src/modules/comercial/vinculo/regras.ts`:

```ts
import type { EstagioNegociacao } from "@/generated/prisma/client";

/**
 * Link projeto × ficha do funil (spec 2026-10-15-vinculo-projeto-ficha-design.md) — regras PURAS.
 * Sem Prisma, sem server-only: a tela usa as mesmas frases como motivo de item desabilitado, e o servidor
 * como `ActionError` (a mesma sentença nos dois lugares, ADR-0002).
 */

export const MOTIVO_FICHA_EXCLUIDA = "Esta ficha foi excluída.";
export const MOTIVO_NAO_CONTRATADA = "Só dá para linkar uma ficha em Contratado.";
export const MOTIVO_CLIENTE_DIFERENTE = "O cliente do projeto é diferente do cliente da ficha.";
export const MOTIVO_JA_LINKADO_ESTA = "Este projeto já está linkado a esta ficha.";
export const MOTIVO_JA_LINKADO_OUTRA = "Este projeto já está linkado a outra ficha. Desfaça o link antes.";
export const MOTIVO_CRIADO_PELO_ACEITE =
  "Este projeto nasceu do aceite de uma proposta; o link com a ficha não pode ser desfeito.";
export const MOTIVO_SEM_ARQUIVO = "Arquivo não encontrado no disco.";
export const MOTIVO_JA_NO_PROJETO = "Já está no projeto.";
export const MOTIVO_REPETIDO = "Repetido nesta lista.";

export type CampoVinculo = "valorContrato" | "areaM2" | "tipoEmpreendimentoId";

export const ROTULO_CAMPO: Record<CampoVinculo, string> = {
  valorContrato: "Valor do contrato",
  areaM2: "Área (m²)",
  tipoEmpreendimentoId: "Tipo de empreendimento",
};

export type ProjetoParaVinculo = {
  id: string;
  clienteId: string;
  negociacaoId: string | null;
  valorContrato: number | null;
  areaM2: number | null;
  tipoEmpreendimentoId: string | null;
  descricao: string | null;
  membrosIds: string[];
};

export type NegociacaoParaVinculo = {
  id: string;
  titulo: string;
  clienteId: string;
  estagio: EstagioNegociacao;
  excluida: boolean;
  valorNegociado: number | null;
  areaM2: number | null;
  tipoEmpreendimentoId: string | null;
  responsavelId: string | null;
};

/** `null` = pode linkar. Qualquer outra coisa é a frase para mostrar a quem tentou. */
export function motivoParaNaoVincular(p: ProjetoParaVinculo, n: NegociacaoParaVinculo): string | null {
  if (n.excluida) return MOTIVO_FICHA_EXCLUIDA;
  if (n.estagio !== "CONTRATADO") return MOTIVO_NAO_CONTRATADA;
  if (p.clienteId !== n.clienteId) return MOTIVO_CLIENTE_DIFERENTE;
  if (p.negociacaoId) return p.negociacaoId === n.id ? MOTIVO_JA_LINKADO_ESTA : MOTIVO_JA_LINKADO_OUTRA;
  return null;
}

export type PlanoCampos = {
  /** Só o que o projeto ainda não tem E a ficha tem. */
  preenche: { valorContrato?: number; areaM2?: number; tipoEmpreendimentoId?: string };
  /** Campos que a ficha tem e o projeto já tinha: ficam como estão. */
  mantem: CampoVinculo[];
  /** Quem vira coordenador, ou `null` (sem responsável, externo/inativo, ou já é membro). */
  coordenadorId: string | null;
};

export function planejarCampos(
  p: ProjetoParaVinculo,
  n: NegociacaoParaVinculo,
  responsavelEhInterno: boolean,
): PlanoCampos {
  const preenche: PlanoCampos["preenche"] = {};
  const mantem: CampoVinculo[] = [];

  if (n.valorNegociado != null) {
    if (p.valorContrato == null) preenche.valorContrato = n.valorNegociado;
    else mantem.push("valorContrato");
  }
  if (n.areaM2 != null) {
    if (p.areaM2 == null) preenche.areaM2 = n.areaM2;
    else mantem.push("areaM2");
  }
  if (n.tipoEmpreendimentoId != null) {
    if (p.tipoEmpreendimentoId == null) preenche.tipoEmpreendimentoId = n.tipoEmpreendimentoId;
    else mantem.push("tipoEmpreendimentoId");
  }

  const coordenadorId =
    n.responsavelId && responsavelEhInterno && !p.membrosIds.includes(n.responsavelId) ? n.responsavelId : null;

  return { preenche, mantem, coordenadorId };
}

export type ItemArquivo = {
  /** `lead:<AnexoLead.id>` ou `pv:<PropostaVersao.id>` — o servidor resolve a chave, nunca confia em caminho do cliente. */
  chave: string;
  origem: "anexo_lead" | "proposta_pdf";
  nome: string;
  nomeArquivo: string;
  caminho: string;
  mime: string;
  tamanho: number;
  hashSha256: string | null;
  existe: boolean;
};

export type ItemArquivoPrevia = ItemArquivo & {
  importarPadrao: boolean;
  /** Por que NÃO vem marcado (ou null quando vem). */
  motivoNaoImportar: string | null;
};

/** Marca o que vem selecionado: ausente no disco, já no projeto (mesmo hash) ou repetido na lista não vêm. */
export function marcarArquivos(itens: ItemArquivo[], hashesNoProjeto: ReadonlySet<string>): ItemArquivoPrevia[] {
  const vistos = new Set<string>();
  return itens.map((i) => {
    let motivo: string | null = null;
    if (!i.existe) motivo = MOTIVO_SEM_ARQUIVO;
    else if (i.hashSha256 && hashesNoProjeto.has(i.hashSha256)) motivo = MOTIVO_JA_NO_PROJETO;
    else if (i.hashSha256 && vistos.has(i.hashSha256)) motivo = MOTIVO_REPETIDO;
    if (i.hashSha256) vistos.add(i.hashSha256);
    return { ...i, importarPadrao: motivo === null, motivoNaoImportar: motivo };
  });
}

export type AtividadeParaResumo = {
  /** `NOTA`, `REUNIAO` ou `NOTA_LEGADA` entram; qualquer outro tipo é ignorado. */
  tipo: string;
  descricao: string;
  createdAt: Date;
};

const MAX_LINHAS = 10;
const MAX_CARACTERES = 200;
const ROTULO_TIPO: Record<string, string> = { NOTA: "Nota", NOTA_LEGADA: "Nota", REUNIAO: "Reunião" };

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function dataBr(d: Date): string {
  return FORMATO_DATA.format(d);
}

function cortar(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > MAX_CARACTERES ? `${limpo.slice(0, MAX_CARACTERES - 1).trimEnd()}…` : limpo;
}

/** Bloco curto para `Projeto.descricao`: as 10 notas/reuniões mais recentes, em ordem cronológica. */
export function resumoHistorico(atividades: AtividadeParaResumo[], hojeTexto: string): string | null {
  const linhas = atividades
    .filter((a) => a.tipo in ROTULO_TIPO && a.descricao.trim() !== "")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_LINHAS)
    .reverse()
    .map((a) => `- ${dataBr(a.createdAt)} · ${ROTULO_TIPO[a.tipo]}: ${cortar(a.descricao)}`);
  if (linhas.length === 0) return null;
  return [`Histórico comercial (importado em ${hojeTexto})`, ...linhas].join("\n");
}

/** O texto a gravar em `Projeto.descricao`, ou `null` = não mexe (sem resumo, ou a descrição já tem conteúdo). */
export function descricaoComResumo(descricaoAtual: string | null, resumo: string | null): string | null {
  if (!resumo) return null;
  if (descricaoAtual && descricaoAtual.trim() !== "") return null;
  return resumo;
}

/** Extensão segura para o caminho copiado: minúscula, com ponto, só letras/números. */
export function extensaoDe(nomeArquivo: string): string {
  const i = nomeArquivo.lastIndexOf(".");
  if (i < 0) return "";
  return `.${nomeArquivo.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "")}`.replace(/^\.$/, "");
}

export type PreviaVinculo = {
  projeto: { id: string; codigo: string; nome: string; clienteId: string; descricao: string | null };
  ficha: { id: string; titulo: string };
  /** Se não for `null`, o link está recusado e o resto vem vazio. */
  motivo: string | null;
  plano: PlanoCampos;
  preencheTexto: { campo: CampoVinculo; rotulo: string; valor: string }[];
  mantemTexto: { campo: CampoVinculo; rotulo: string }[];
  coordenador: { id: string; nome: string } | null;
  arquivos: ItemArquivoPrevia[];
  /** O bloco que seria gravado na descrição (ou null se não há o que resumir). */
  resumo: string | null;
  /** Descrição do projeto está vazia — só então o resumo é gravado. */
  descricaoVazia: boolean;
  /** `descricaoComResumo(...)`: o texto final a gravar, ou null. */
  novaDescricao: string | null;
};
```

Nota sobre `extensaoDe`: o `.replace(/^\.$/, "")` cobre o caso "arquivo." (ponto sem extensão → vazio).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/comercial/vinculo/regras.test.ts`
Expected: PASS (todos). Se `dataBr` falhar por ICU do Node, rodar `node -e "console.log(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(new Date()))"`; Node 18+ traz ICU completo e deve imprimir a data.

- [ ] **Step 5: Commit**

```bash
git add src/modules/comercial/vinculo/regras.ts src/modules/comercial/vinculo/regras.test.ts
git commit -m "feat(comercial): regras puras do link projeto × ficha

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 3: Leituras e prévia (`queries.ts`)

**Files:**
- Create: `src/modules/comercial/vinculo/queries.ts`

**Interfaces:**
- Consumes (Task 2): `motivoParaNaoVincular`, `planejarCampos`, `marcarArquivos`, `resumoHistorico`, `descricaoComResumo`, `dataBr`, `ROTULO_CAMPO`, tipos `ItemArquivo`, `PreviaVinculo`, `CampoVinculo`, `AtividadeParaResumo`.
- Produces:
  - `projetosLinkaveis(user: SessionUser, negociacaoId: string): Promise<{ id: string; codigo: string; nome: string }[]>`
  - `fichasLinkaveis(user: SessionUser, projetoId: string): Promise<{ id: string; titulo: string; valorNegociado: number | null }[]>`
  - `previaVinculo(user: SessionUser, projetoId: string, negociacaoId: string): Promise<PreviaVinculo>` (lança `ActionError` se projeto/ficha não existem ou fora do escopo)
  - `origemComercialDoProjeto(projetoId: string): Promise<{ ficha: { id: string; titulo: string } | null; criadoPeloAceite: boolean }>`

Sem teste unitário próprio (só SQL): a cobertura é o smoke da Task 4.

- [ ] **Step 1: Criar o arquivo**

Criar `src/modules/comercial/vinculo/queries.ts`:

```ts
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { existeArquivo, lerArquivo } from "@/lib/storage";
import { brl } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { escopoProjeto } from "@/modules/projetos/queries";
import {
  ROTULO_CAMPO,
  dataBr,
  descricaoComResumo,
  marcarArquivos,
  motivoParaNaoVincular,
  planejarCampos,
  resumoHistorico,
  type AtividadeParaResumo,
  type ItemArquivo,
  type PlanoCampos,
  type PreviaVinculo,
} from "./regras";

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v));

/** Projetos do MESMO cliente da ficha, sem ficha ainda, dentro do escopo de quem pede. */
export async function projetosLinkaveis(user: SessionUser, negociacaoId: string) {
  const n = await prisma.negociacao.findUnique({ where: { id: negociacaoId }, select: { clienteId: true } });
  if (!n) return [];
  return prisma.projeto.findMany({
    where: { clienteId: n.clienteId, negociacaoId: null, AND: [escopoProjeto(user)] },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, codigo: true, nome: true },
  });
}

/** Fichas Contratado do MESMO cliente do projeto. */
export async function fichasLinkaveis(user: SessionUser, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto(user)] },
    select: { clienteId: true },
  });
  if (!p) return [];
  const fichas = await prisma.negociacao.findMany({
    where: { clienteId: p.clienteId, estagio: "CONTRATADO" },
    orderBy: { dataFechamento: "desc" },
    take: 100,
    select: { id: true, titulo: true, valorNegociado: true },
  });
  return fichas.map((f) => ({ id: f.id, titulo: f.titulo, valorNegociado: num(f.valorNegociado) }));
}

async function carregarProjeto(user: SessionUser, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto(user)] },
    select: {
      id: true,
      codigo: true,
      nome: true,
      clienteId: true,
      negociacaoId: true,
      valorContrato: true,
      areaM2: true,
      tipoEmpreendimentoId: true,
      descricao: true,
      membros: { select: { userId: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    clienteId: p.clienteId,
    negociacaoId: p.negociacaoId,
    valorContrato: num(p.valorContrato),
    areaM2: num(p.areaM2),
    tipoEmpreendimentoId: p.tipoEmpreendimentoId,
    descricao: p.descricao,
    membrosIds: p.membros.map((m) => m.userId),
  };
}

async function carregarFicha(negociacaoId: string) {
  return prisma.negociacao.findUnique({
    where: { id: negociacaoId },
    select: {
      id: true,
      titulo: true,
      clienteId: true,
      estagio: true,
      excluidoEm: true,
      valorNegociado: true,
      areaM2: true,
      tipoEmpreendimentoId: true,
      responsavelId: true,
      leadId: true,
      tipoEmpreendimento: { select: { nome: true } },
      lead: {
        select: {
          anexos: {
            orderBy: { createdAt: "asc" },
            select: { id: true, nome: true, nomeArquivo: true, caminho: true, mime: true, tamanho: true, hashSha256: true },
          },
        },
      },
      propostas: {
        orderBy: { createdAt: "asc" },
        select: {
          numero: true,
          versoes: {
            where: { pdfPath: { not: null } },
            orderBy: { numero: "desc" },
            take: 1,
            select: { id: true, numero: true, pdfPath: true },
          },
        },
      },
    },
  });
}
type FichaCarregada = NonNullable<Awaited<ReturnType<typeof carregarFicha>>>;

/** Anexos do lead de origem + o PDF vigente de cada proposta da ficha. */
async function itensDaFicha(ficha: FichaCarregada): Promise<ItemArquivo[]> {
  const itens: ItemArquivo[] = [];
  for (const a of ficha.lead?.anexos ?? []) {
    itens.push({
      chave: `lead:${a.id}`,
      origem: "anexo_lead",
      nome: a.nome,
      nomeArquivo: a.nomeArquivo,
      caminho: a.caminho,
      mime: a.mime,
      tamanho: a.tamanho,
      hashSha256: a.hashSha256,
      existe: await existeArquivo(a.caminho),
    });
  }
  for (const pr of ficha.propostas) {
    const v = pr.versoes[0];
    if (!v?.pdfPath) continue;
    const base = {
      chave: `pv:${v.id}`,
      origem: "proposta_pdf" as const,
      nome: `Proposta ${pr.numero} v${v.numero} (PDF)`,
      nomeArquivo: `${pr.numero}-v${v.numero}.pdf`,
      caminho: v.pdfPath,
      mime: "application/pdf",
    };
    try {
      const buffer = await lerArquivo(v.pdfPath);
      itens.push({
        ...base,
        tamanho: buffer.length,
        hashSha256: createHash("sha256").update(buffer).digest("hex"),
        existe: true,
      });
    } catch {
      itens.push({ ...base, tamanho: 0, hashSha256: null, existe: false });
    }
  }
  return itens;
}

async function atividadesParaResumo(ficha: FichaCarregada): Promise<AtividadeParaResumo[]> {
  const novas = await prisma.atividade.findMany({
    where: {
      tipo: { in: ["NOTA", "REUNIAO"] },
      OR: [{ negociacaoId: ficha.id }, ...(ficha.leadId ? [{ leadId: ficha.leadId }] : [])],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { tipo: true, descricao: true, createdAt: true },
  });
  const legadas = ficha.leadId
    ? await prisma.atividadeLead.findMany({
        where: { leadId: ficha.leadId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { nota: true, createdAt: true },
      })
    : [];
  return [
    ...novas.map((a) => ({ tipo: a.tipo as string, descricao: a.descricao, createdAt: a.createdAt })),
    ...legadas.map((a) => ({ tipo: "NOTA_LEGADA", descricao: a.nota, createdAt: a.createdAt })),
  ];
}

const PLANO_VAZIO: PlanoCampos = { preenche: {}, mantem: [], coordenadorId: null };

/**
 * Tudo o que o diálogo mostra E o que o serviço usa para gravar — a prévia é a única fonte, então o
 * que a pessoa viu é exatamente o que será feito. Só leitura.
 */
export async function previaVinculo(
  user: SessionUser,
  projetoId: string,
  negociacaoId: string,
): Promise<PreviaVinculo> {
  const projeto = await carregarProjeto(user, projetoId);
  if (!projeto) throw new ActionError("Projeto não encontrado.");
  const ficha = await carregarFicha(negociacaoId);
  if (!ficha) throw new ActionError("Ficha não encontrada.");

  const motivo = motivoParaNaoVincular(projeto, {
    id: ficha.id,
    titulo: ficha.titulo,
    clienteId: ficha.clienteId,
    estagio: ficha.estagio,
    excluida: ficha.excluidoEm != null,
    valorNegociado: num(ficha.valorNegociado),
    areaM2: num(ficha.areaM2),
    tipoEmpreendimentoId: ficha.tipoEmpreendimentoId,
    responsavelId: ficha.responsavelId,
  });

  const cabecalho = {
    projeto: {
      id: projeto.id,
      codigo: projeto.codigo,
      nome: projeto.nome,
      clienteId: projeto.clienteId,
      descricao: projeto.descricao,
    },
    ficha: { id: ficha.id, titulo: ficha.titulo },
    motivo,
  };
  if (motivo) {
    return {
      ...cabecalho,
      plano: PLANO_VAZIO,
      preencheTexto: [],
      mantemTexto: [],
      coordenador: null,
      arquivos: [],
      resumo: null,
      descricaoVazia: false,
      novaDescricao: null,
    };
  }

  const responsavel = ficha.responsavelId
    ? await prisma.user.findFirst({
        where: { id: ficha.responsavelId, tipo: "interno", ativo: true },
        select: { id: true, name: true },
      })
    : null;

  const plano = planejarCampos(
    projeto,
    {
      id: ficha.id,
      titulo: ficha.titulo,
      clienteId: ficha.clienteId,
      estagio: ficha.estagio,
      excluida: false,
      valorNegociado: num(ficha.valorNegociado),
      areaM2: num(ficha.areaM2),
      tipoEmpreendimentoId: ficha.tipoEmpreendimentoId,
      responsavelId: ficha.responsavelId,
    },
    responsavel != null,
  );

  const preencheTexto: PreviaVinculo["preencheTexto"] = [];
  if (plano.preenche.valorContrato != null)
    preencheTexto.push({ campo: "valorContrato", rotulo: ROTULO_CAMPO.valorContrato, valor: brl(plano.preenche.valorContrato) });
  if (plano.preenche.areaM2 != null)
    preencheTexto.push({
      campo: "areaM2",
      rotulo: ROTULO_CAMPO.areaM2,
      valor: `${plano.preenche.areaM2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`,
    });
  if (plano.preenche.tipoEmpreendimentoId != null)
    preencheTexto.push({
      campo: "tipoEmpreendimentoId",
      rotulo: ROTULO_CAMPO.tipoEmpreendimentoId,
      valor: ficha.tipoEmpreendimento?.nome ?? "—",
    });

  const existentes = await prisma.documentoVersao.findMany({
    where: { documento: { projetoId } },
    select: { hashSha256: true },
  });
  const arquivos = marcarArquivos(await itensDaFicha(ficha), new Set(existentes.map((e) => e.hashSha256)));

  const resumo = resumoHistorico(await atividadesParaResumo(ficha), dataBr(new Date()));
  const novaDescricao = descricaoComResumo(projeto.descricao, resumo);

  return {
    ...cabecalho,
    plano,
    preencheTexto,
    mantemTexto: plano.mantem.map((campo) => ({ campo, rotulo: ROTULO_CAMPO[campo] })),
    coordenador: plano.coordenadorId && responsavel ? { id: responsavel.id, nome: responsavel.name } : null,
    arquivos,
    resumo,
    descricaoVazia: !projeto.descricao || projeto.descricao.trim() === "",
    novaDescricao,
  };
}

/** De onde veio o projeto, do lado comercial — para o cabeçalho e para o ⋯ do projeto. */
export async function origemComercialDoProjeto(projetoId: string) {
  const p = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: {
      negociacao: { select: { id: true, titulo: true } },
      proposta: { select: { id: true } },
    },
  });
  return {
    ficha: p?.negociacao ? { id: p.negociacao.id, titulo: p.negociacao.titulo } : null,
    criadoPeloAceite: p?.proposta != null,
  };
}
```

- [ ] **Step 2: Conferir tipos**

Run: `npx tsc -p tsconfig.server.json --noEmit` com `NODE_OPTIONS=--max-old-space-size=8192` (PowerShell: `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit`).
Expected: sem erros novos em `vinculo/`. Se `escopoProjeto(user)` reclamar do tipo de `user`, ver como `modules/documentos-cliente/acesso.ts` chama a mesma função com `SessionUser` e copiar a assinatura.

- [ ] **Step 3: Commit**

```bash
git add src/modules/comercial/vinculo/queries.ts
git commit -m "feat(comercial): leituras e prévia do link projeto × ficha

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 4: Serviço (cópia + transação) e smoke

**Files:**
- Create: `src/modules/comercial/vinculo/service.ts`
- Create: `scripts/smoke-vinculo-projeto-ficha.ts`
- Modify: `package.json` (script, perto de `"smoke:pastas-cliente"`, linha ~66)

**Interfaces:**
- Consumes (Task 3): `previaVinculo`. (Task 2): `MOTIVO_CRIADO_PELO_ACEITE`, `extensaoDe`, `ItemArquivoPrevia`. (Task 1): evento `PROJETO_LINKADO`/`PROJETO_DESLINKADO` via `registrarAtividade` de `@/modules/comercial/service`.
- Produces:
  - `type EntradaVinculo = { projetoId: string; negociacaoId: string; arquivos: { chave: string; exibirEmRecebidos: boolean }[]; incluirResumo: boolean }`
  - `vincularProjetoNaFicha(user: SessionUser, input: EntradaVinculo): Promise<{ arquivos: number; preencheu: string[]; coordenadorCriado: boolean; descricaoGravada: boolean }>`
  - `desvincularProjetoDaFicha(user: SessionUser, projetoId: string): Promise<{ negociacaoId: string }>`

- [ ] **Step 1: Escrever o smoke (falha porque o serviço não existe)**

Criar `scripts/smoke-vinculo-projeto-ficha.ts`:

```ts
/**
 * Smoke do link projeto × ficha do funil (spec 2026-10-15-vinculo-projeto-ficha-design.md) contra o banco de dev.
 * O vitest cobre as regras puras (`vinculo/regras.ts`); aqui vai o SQL e o disco: recusas, preenchimento só de campo
 * vazio, cópia do arquivo (excluir o anexo do funil não quebra o projeto), corrida de dois cliques sem arquivo órfão,
 * deduplicação por hash, arquivo ausente, ficha sem lead, desfazer link e a trava do projeto criado pelo aceite.
 *
 * Cria cliente + lead + fichas + projetos + arquivos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:vinculo-projeto-ficha
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { existeArquivo, listarArquivos, removerArquivo, salvarArquivo } from "../src/lib/storage";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import {
  desvincularProjetoDaFicha,
  vincularProjetoNaFicha,
} from "../src/modules/comercial/vinculo/service";
import { previaVinculo } from "../src/modules/comercial/vinculo/queries";
import type { SessionUser } from "../src/lib/session";

async function main() {
  const tag = `SMKVINC_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const rejeita = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true, tipo: "interno" }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem superusuário interno ativo.");
  const etapa = await prisma.funilEtapa.findFirst({ select: { id: true } });
  if (!etapa) throw new Error("Banco de dev sem FunilEtapa.");
  const user = { id: usuario.id, tipo: "interno", superUsuario: true, ativo: true } as unknown as SessionUser;

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const cliente2 = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli2` } });
  const caminhos: string[] = [];

  const novoProjeto = (nome: string, extra: { valorContrato?: number } = {}) =>
    prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${nome}`, clienteId: cliente.id, ...extra },
      });
    });

  const lead = await prisma.lead.create({ data: { nome: `${tag}_lead`, etapaId: etapa.id, clienteId: cliente.id } });
  const anexo = async (nome: string, conteudo: string) => {
    const salvo = await salvarArquivo(`comercial/leads/${tag}-${randomBytes(4).toString("hex")}.txt`, Buffer.from(conteudo));
    caminhos.push(salvo.caminho);
    return prisma.anexoLead.create({
      data: { leadId: lead.id, nome, caminho: salvo.caminho, nomeArquivo: `${nome}.txt`, mime: "text/plain", tamanho: salvo.tamanho, hashSha256: salvo.hashSha256 },
    });
  };
  const anexoA = await anexo("Solicitacao", `${tag} A`);
  const anexoB = await anexo("Referencias", `${tag} B`);

  const ficha = await prisma.negociacao.create({
    data: { titulo: `${tag}_ficha`, clienteId: cliente.id, leadId: lead.id, estagio: "CONTRATADO", valorNegociado: 150000, areaM2: 320.5, responsavelId: usuario.id },
  });
  const fichaAberta = await prisma.negociacao.create({
    data: { titulo: `${tag}_aberta`, clienteId: cliente.id, estagio: "ORCAMENTO" },
  });
  const fichaOutroCliente = await prisma.negociacao.create({
    data: { titulo: `${tag}_outro`, clienteId: cliente2.id, estagio: "CONTRATADO" },
  });
  const fichaSemLead = await prisma.negociacao.create({
    data: { titulo: `${tag}_sem_lead`, clienteId: cliente.id, estagio: "CONTRATADO" },
  });

  const p1 = await novoProjeto("p1");
  const p2 = await novoProjeto("p2", { valorContrato: 99 });
  const p3 = await novoProjeto("p3");
  const p4 = await novoProjeto("p4");

  try {
    // 1-2. Recusas
    check("1. ficha que não está em Contratado é recusada", ((await previaVinculo(user, p1.id, fichaAberta.id)).motivo ?? "").includes("Contratado"));
    check("2. cliente diferente é recusado", ((await previaVinculo(user, p1.id, fichaOutroCliente.id)).motivo ?? "").includes("cliente"));

    // 3. Prévia
    const previa = await previaVinculo(user, p1.id, ficha.id);
    check("3a. prévia sem recusa", previa.motivo === null);
    check("3b. prévia preenche valor e área", previa.plano.preenche.valorContrato === 150000 && previa.plano.preenche.areaM2 === 320.5);
    check("3c. prévia lista os 2 anexos, ambos marcados", previa.arquivos.length === 2 && previa.arquivos.every((a) => a.importarPadrao));
    check("3d. prévia traz o coordenador (responsável da ficha)", previa.coordenador?.id === usuario.id);

    // 4. Link de verdade: A aparece em Recebidos, B não
    const r1 = await vincularProjetoNaFicha(user, {
      projetoId: p1.id,
      negociacaoId: ficha.id,
      arquivos: [
        { chave: `lead:${anexoA.id}`, exibirEmRecebidos: true },
        { chave: `lead:${anexoB.id}`, exibirEmRecebidos: false },
      ],
      incluirResumo: false,
    });
    const p1depois = await prisma.projeto.findUnique({ where: { id: p1.id }, select: { negociacaoId: true, valorContrato: true, areaM2: true, descricao: true } });
    const docs = await prisma.documento.findMany({ where: { projetoId: p1.id }, include: { versoes: true }, orderBy: { createdAt: "asc" } });
    check("4a. projeto ficou linkado", p1depois?.negociacaoId === ficha.id);
    check("4b. valor e área preenchidos", Number(p1depois?.valorContrato) === 150000 && Number(p1depois?.areaM2) === 320.5);
    check("4c. 2 documentos na Geral (origem interno), categoria Comercial", docs.length === 2 && docs.every((d) => d.origem === "interno" && d.categoria === "Comercial"));
    check("4d. exibirEmRecebidos só no marcado", docs.filter((d) => d.exibirEmRecebidos).length === 1 && docs.find((d) => d.exibirEmRecebidos)?.nome === "Solicitacao");
    check("4e. coordenador criado como membro", (await prisma.projetoMembro.count({ where: { projetoId: p1.id, userId: usuario.id, papel: "coordenador" } })) === 1);
    check("4f. evento na timeline da ficha", (await prisma.atividade.count({ where: { negociacaoId: ficha.id, descricao: { contains: "linkado" } } })) === 1);
    check("4g. resultado informa 2 arquivos", r1.arquivos === 2 && r1.coordenadorCriado);

    // 5. Cópia ≠ original: apagar o anexo do funil não quebra o projeto
    const copiaA = docs.find((d) => d.nome === "Solicitacao")!.versoes[0].caminho;
    check("5a. caminho copiado é outro", copiaA !== anexoA.caminho && copiaA.startsWith(`documentos/${cliente.id}/`));
    await removerArquivo(anexoA.caminho);
    await prisma.anexoLead.delete({ where: { id: anexoA.id } });
    check("5b. copia segue no disco depois de apagar o anexo do funil", await existeArquivo(copiaA));

    // 6. Segundo link do mesmo projeto
    const m6 = await rejeita(vincularProjetoNaFicha(user, { projetoId: p1.id, negociacaoId: ficha.id, arquivos: [], incluirResumo: false }));
    check("6. segundo link do mesmo projeto é recusado", (m6 ?? "").includes("já está linkado"));

    // 7. Não sobrescreve
    await vincularProjetoNaFicha(user, { projetoId: p2.id, negociacaoId: ficha.id, arquivos: [], incluirResumo: false });
    const p2depois = await prisma.projeto.findUnique({ where: { id: p2.id }, select: { valorContrato: true, areaM2: true } });
    check("7. valor existente mantido; área vazia preenchida", Number(p2depois?.valorContrato) === 99 && Number(p2depois?.areaM2) === 320.5);

    // 8. Corrida: dois cliques no mesmo projeto, um arquivo
    const antes = (await listarArquivos(`documentos/${cliente.id}`)).length;
    const corrida = await Promise.allSettled([
      vincularProjetoNaFicha(user, { projetoId: p3.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoB.id}`, exibirEmRecebidos: false }], incluirResumo: false }),
      vincularProjetoNaFicha(user, { projetoId: p3.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoB.id}`, exibirEmRecebidos: false }], incluirResumo: false }),
    ]);
    const depois = (await listarArquivos(`documentos/${cliente.id}`)).length;
    check("8a. só um dos dois cliques grava", corrida.filter((c) => c.status === "fulfilled").length === 1);
    check("8b. um único documento no projeto", (await prisma.documento.count({ where: { projetoId: p3.id } })) === 1);
    check("8c. nenhum arquivo órfão no disco (só 1 cópia nova)", depois - antes === 1);

    // 9. Desfazer link: mantém o importado
    await desvincularProjetoDaFicha(user, p1.id);
    check("9a. link desfeito", (await prisma.projeto.findUnique({ where: { id: p1.id }, select: { negociacaoId: true } }))?.negociacaoId === null);
    check("9b. documentos importados continuam", (await prisma.documento.count({ where: { projetoId: p1.id } })) === 2);
    check("9c. evento de desfazer na timeline", (await prisma.atividade.count({ where: { negociacaoId: ficha.id, descricao: { contains: "desfeito" } } })) === 1);
    check("9d. desfazer sem link é recusado", ((await rejeita(desvincularProjetoDaFicha(user, p1.id))) ?? "").includes("não está linkado"));

    // 10. Deduplicação por hash (B já está em P1)
    const reprevia = await previaVinculo(user, p1.id, ficha.id);
    const itemB = reprevia.arquivos.find((a) => a.chave === `lead:${anexoB.id}`);
    check("10. arquivo já no projeto vem desmarcado", itemB?.importarPadrao === false && (itemB?.motivoNaoImportar ?? "").includes("projeto"));

    // 11. Arquivo sumiu do disco
    const anexoC = await anexo("Sumiu", `${tag} C`);
    await removerArquivo(anexoC.caminho);
    const previaC = await previaVinculo(user, p1.id, ficha.id);
    const itemC = previaC.arquivos.find((a) => a.chave === `lead:${anexoC.id}`);
    check("11a. arquivo ausente vem desabilitado", itemC?.existe === false && itemC?.importarPadrao === false);
    const m11 = await rejeita(vincularProjetoNaFicha(user, { projetoId: p1.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoC.id}`, exibirEmRecebidos: false }], incluirResumo: false }));
    check("11b. o servidor recusa a chave do arquivo ausente", (m11 ?? "").includes("não foi encontrado"));
    check("11c. a recusa não deixa o projeto linkado", (await prisma.projeto.findUnique({ where: { id: p1.id }, select: { negociacaoId: true } }))?.negociacaoId === null);

    // 12. Ficha sem lead: lista vazia e o link funciona
    const previaSemLead = await previaVinculo(user, p4.id, fichaSemLead.id);
    check("12a. ficha sem lead e sem PDF: lista de arquivos vazia", previaSemLead.arquivos.length === 0 && previaSemLead.motivo === null);
    await vincularProjetoNaFicha(user, { projetoId: p4.id, negociacaoId: fichaSemLead.id, arquivos: [], incluirResumo: false });
    check("12b. link com zero arquivos grava o vínculo", (await prisma.projeto.findUnique({ where: { id: p4.id }, select: { negociacaoId: true } }))?.negociacaoId === fichaSemLead.id);

    // 13. Projeto criado pelo aceite não desfaz (só se o banco de dev tiver um)
    const doAceite = await prisma.proposta.findFirst({
      where: { projetoId: { not: null }, projeto: { negociacaoId: { not: null } } },
      select: { projetoId: true },
    });
    if (doAceite?.projetoId) {
      const m13 = await rejeita(desvincularProjetoDaFicha(user, doAceite.projetoId));
      check("13. projeto criado pelo aceite: desfazer recusado", (m13 ?? "").includes("aceite"));
    } else {
      console.log("[PULOU] 13. banco de dev sem projeto criado pelo aceite");
    }
  } finally {
    // Limpeza: documentos (e os arquivos copiados), atividades, vínculos, projetos, fichas, lead, clientes.
    const versoes = await prisma.documentoVersao.findMany({ where: { documento: { clienteId: { in: [cliente.id, cliente2.id] } } }, select: { caminho: true } });
    for (const v of versoes) await removerArquivo(v.caminho).catch(() => undefined);
    for (const c of caminhos) await removerArquivo(c).catch(() => undefined);
    await prisma.atividade.deleteMany({ where: { clienteId: { in: [cliente.id, cliente2.id] } } });
    await prisma.documento.deleteMany({ where: { clienteId: { in: [cliente.id, cliente2.id] } } });
    await prisma.projeto.deleteMany({ where: { id: { in: [p1.id, p2.id, p3.id, p4.id] } } });
    await prisma.anexoLead.deleteMany({ where: { leadId: lead.id } });
    await prisma.negociacao.deleteMany({ where: { id: { in: [ficha.id, fichaAberta.id, fichaOutroCliente.id, fichaSemLead.id] } } });
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
    await prisma.cliente.deleteMany({ where: { id: { in: [cliente.id, cliente2.id] } } });
  }

  console.log(ok ? "\nTUDO OK" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Adicionar em `package.json`, junto de `"smoke:pastas-cliente"`:

```json
    "smoke:vinculo-projeto-ficha": "tsx --tsconfig tsconfig.server.json scripts/smoke-vinculo-projeto-ficha.ts",
```

Run: `npm run smoke:vinculo-projeto-ficha`
Expected: FAIL com "Cannot find module .../vinculo/service" (o serviço ainda não existe).

- [ ] **Step 2: Implementar `service.ts`**

Criar `src/modules/comercial/vinculo/service.ts`:

```ts
import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { lerArquivo, removerArquivo, salvarArquivo } from "@/lib/storage";
import type { SessionUser } from "@/lib/session";
import { escopoProjeto } from "@/modules/projetos/queries";
import { registrarAtividade } from "@/modules/comercial/service";
import { enfileirarConversaoDwgDocumento } from "@/modules/dwg/service";
import { enfileirarConversaoDocumento } from "@/modules/coordenacao/service";
import { previaVinculo } from "./queries";
import { MOTIVO_CRIADO_PELO_ACEITE, extensaoDe, type ItemArquivoPrevia } from "./regras";

export type EntradaVinculo = {
  projetoId: string;
  negociacaoId: string;
  arquivos: { chave: string; exibirEmRecebidos: boolean }[];
  incluirResumo: boolean;
};

type Copiado = { caminho: string; tamanho: number; hashSha256: string; item: ItemArquivoPrevia; exibir: boolean };

/**
 * Linka um projeto a uma ficha Contratado: copia os arquivos escolhidos para a Geral do projeto (origem
 * `interno`) e preenche só o que está vazio. Ordem: (1) copia os arquivos, (2) UMA transação com todo o resto,
 * (3) se a transação falha, apaga as cópias — nunca sobra arquivo órfão. O original do funil não é tocado.
 */
export async function vincularProjetoNaFicha(user: SessionUser, input: EntradaVinculo) {
  const previa = await previaVinculo(user, input.projetoId, input.negociacaoId);
  if (previa.motivo) throw new ActionError(previa.motivo);

  const porChave = new Map(previa.arquivos.map((a) => [a.chave, a]));
  const vistos = new Set<string>();
  const escolhidos = input.arquivos.map((e) => {
    const item = porChave.get(e.chave);
    if (!item) throw new ActionError("A lista de arquivos mudou. Reabra o diálogo.");
    if (!item.existe) throw new ActionError(`O arquivo "${item.nome}" não foi encontrado no disco.`);
    if (vistos.has(e.chave)) throw new ActionError("Arquivo repetido na seleção.");
    vistos.add(e.chave);
    return { item, exibir: e.exibirEmRecebidos };
  });

  const copiados: Copiado[] = [];
  let criadas: { versaoId: string; nomeArquivo: string }[] = [];
  try {
    for (const { item, exibir } of escolhidos) {
      const buffer = await lerArquivo(item.caminho);
      const rel = `documentos/${previa.projeto.clienteId}/${randomBytes(12).toString("hex")}${extensaoDe(item.nomeArquivo)}`;
      const salvo = await salvarArquivo(rel, buffer);
      copiados.push({ ...salvo, item, exibir });
    }

    criadas = await prisma.$transaction(async (tx) => {
      const { plano } = previa;
      const data: Prisma.ProjetoUncheckedUpdateManyInput = { negociacaoId: input.negociacaoId };
      // O `where` repete "estava vazio": se alguém preencheu o campo no meio do caminho, o count ≠ 1 e nada grava.
      const where: Prisma.ProjetoWhereInput = { id: input.projetoId, negociacaoId: null };
      if (plano.preenche.valorContrato != null) {
        data.valorContrato = plano.preenche.valorContrato;
        where.valorContrato = null;
      }
      if (plano.preenche.areaM2 != null) {
        data.areaM2 = plano.preenche.areaM2;
        where.areaM2 = null;
      }
      if (plano.preenche.tipoEmpreendimentoId != null) {
        data.tipoEmpreendimentoId = plano.preenche.tipoEmpreendimentoId;
        where.tipoEmpreendimentoId = null;
      }
      if (input.incluirResumo && previa.novaDescricao) {
        data.descricao = previa.novaDescricao;
        where.descricao = previa.projeto.descricao;
      }
      const r = await tx.projeto.updateMany({ where, data });
      if (r.count !== 1) {
        throw new ActionError("O projeto mudou enquanto você montava o link (ou já foi linkado). Reabra o diálogo e tente de novo.");
      }

      if (plano.coordenadorId) {
        await tx.projetoMembro.createMany({
          data: [{ projetoId: input.projetoId, userId: plano.coordenadorId, papel: "coordenador" }],
          skipDuplicates: true,
        });
      }

      const feitas: { versaoId: string; nomeArquivo: string }[] = [];
      for (const c of copiados) {
        const doc = await tx.documento.create({
          data: {
            clienteId: previa.projeto.clienteId,
            projetoId: input.projetoId,
            origem: "interno",
            canal: "interno",
            nome: c.item.nome,
            categoria: "Comercial",
            descricao: `Importado da ficha ${previa.ficha.titulo}`,
            exibirEmRecebidos: c.exibir,
            autorId: user.id,
            versoes: {
              create: {
                numero: 1,
                caminho: c.caminho,
                nomeArquivo: c.item.nomeArquivo,
                mime: c.item.mime,
                tamanho: c.tamanho,
                hashSha256: c.hashSha256,
                autorId: user.id,
              },
            },
          },
          select: { versoes: { select: { id: true } } },
        });
        feitas.push({ versaoId: doc.versoes[0].id, nomeArquivo: c.item.nomeArquivo });
      }

      await registrarAtividade(
        { evento: "PROJETO_LINKADO", codigo: previa.projeto.codigo, nome: previa.projeto.nome },
        { autorId: user.id, clienteId: previa.projeto.clienteId, negociacaoId: input.negociacaoId, tx },
      );
      return feitas;
    });
  } catch (erro) {
    for (const c of copiados) await removerArquivo(c.caminho).catch(() => undefined);
    throw erro;
  }

  // Fire-and-forget, como em `criarDocumento`: nunca derruba o link já gravado.
  for (const c of criadas) {
    if (/\.dwg$/i.test(c.nomeArquivo)) {
      void enfileirarConversaoDwgDocumento(c.versaoId).catch((e) => console.error("[vinculo] DWG:", e));
    }
    if (/\.ifc$/i.test(c.nomeArquivo)) {
      void enfileirarConversaoDocumento(c.versaoId).catch((e) => console.error("[vinculo] IFC:", e));
    }
  }

  return {
    arquivos: criadas.length,
    preencheu: Object.keys(previa.plano.preenche),
    coordenadorCriado: previa.plano.coordenadorId != null,
    descricaoGravada: input.incluirResumo && previa.novaDescricao != null,
  };
}

/** Só zera `negociacaoId`; o que foi importado fica (já é do projeto). Projeto do aceite não desfaz. */
export async function desvincularProjetoDaFicha(user: SessionUser, projetoId: string) {
  const p = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto(user)] },
    select: { id: true, codigo: true, nome: true, clienteId: true, negociacaoId: true },
  });
  if (!p) throw new ActionError("Projeto não encontrado.");
  const negociacaoId = p.negociacaoId;
  if (!negociacaoId) throw new ActionError("Este projeto não está linkado a nenhuma ficha.");
  if (await prisma.proposta.findFirst({ where: { projetoId }, select: { id: true } })) {
    throw new ActionError(MOTIVO_CRIADO_PELO_ACEITE);
  }
  await prisma.$transaction(async (tx) => {
    const r = await tx.projeto.updateMany({ where: { id: p.id, negociacaoId }, data: { negociacaoId: null } });
    if (r.count !== 1) throw new ActionError("O link mudou enquanto você olhava. Recarregue a página.");
    await registrarAtividade(
      { evento: "PROJETO_DESLINKADO", codigo: p.codigo, nome: p.nome },
      { autorId: user.id, clienteId: p.clienteId, negociacaoId, tx },
    );
  });
  return { negociacaoId };
}
```

- [ ] **Step 3: Rodar o smoke**

Run: `npm run smoke:vinculo-projeto-ficha`
Expected: todas as linhas `[OK]` (e `[PULOU] 13` se o banco de dev não tiver projeto do aceite), terminando em `TUDO OK`.
Se a corrida (8c) falhar com `depois - antes === 2`: o `catch` do serviço não está apagando as cópias do perdedor — conferir que o `throw` do `r.count !== 1` acontece DENTRO do `try`.
Se a limpeza do `finally` reclamar de FK: apagar primeiro a tabela que bloqueia (a mensagem do Prisma diz qual) e manter a ordem do restante.

- [ ] **Step 4: Tipos**

Run (PowerShell): `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/comercial/vinculo/service.ts scripts/smoke-vinculo-projeto-ficha.ts package.json
git commit -m "feat(comercial): serviço do link projeto × ficha com cópia de anexos e smoke

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 5: Actions (`schemas.ts` + `actions.ts`)

**Files:**
- Create: `src/modules/comercial/vinculo/schemas.ts`
- Create: `src/modules/comercial/vinculo/actions.ts`

**Interfaces:**
- Consumes (Task 4): `vincularProjetoNaFicha`, `desvincularProjetoDaFicha`, `EntradaVinculo`. (Task 3): `projetosLinkaveis`, `fichasLinkaveis`, `previaVinculo`. (Task 2): `PreviaVinculo`.
- Produces (Server Actions, todas `(input) => Promise<ActionResult<T>>`):
  - `candidatosParaVinculo({ modo: "ficha" | "projeto"; id: string }): { id: string; rotulo: string; detalhe: string | null }[]` — `modo "ficha"` = `id` é a negociação (lista projetos); `modo "projeto"` = `id` é o projeto (lista fichas).
  - `previaDoVinculo({ projetoId; negociacaoId }): PreviaVinculo`
  - `linkarProjeto(EntradaVinculo): { arquivos: number; ... }`
  - `desfazerLinkProjeto({ projetoId }): { negociacaoId: string }`

- [ ] **Step 1: Schemas**

Criar `src/modules/comercial/vinculo/schemas.ts`:

```ts
import { z } from "zod";

const id = z.string().min(1);

export const candidatosSchema = z.object({ modo: z.enum(["ficha", "projeto"]), id });

export const previaSchema = z.object({ projetoId: id, negociacaoId: id });

export const linkarSchema = z.object({
  projetoId: id,
  negociacaoId: id,
  arquivos: z.array(z.object({ chave: id, exibirEmRecebidos: z.boolean() })).max(100),
  incluirResumo: z.boolean(),
});

export const desfazerSchema = z.object({ projetoId: id });
```

- [ ] **Step 2: Actions**

Criar `src/modules/comercial/vinculo/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { brl } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { refletirSincroniaCanais } from "@/lib/socket";
import { fichasLinkaveis, previaVinculo, projetosLinkaveis } from "./queries";
import { desvincularProjetoDaFicha, vincularProjetoNaFicha } from "./service";
import { candidatosSchema, desfazerSchema, linkarSchema, previaSchema } from "./schemas";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;

/** Linkar mexe num projeto: além de `comercial:gerir` (do `base`), exige `projetos:gerir`. */
async function exigirProjetosGerir(user: SessionUser) {
  if (!(await can(user, "projetos", "gerir"))) throw new ActionError("Sem permissão para alterar projetos.");
}

function revalidar(projetoId: string) {
  revalidatePath("/comercial/funil");
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
}

export const candidatosParaVinculo = defineAction(
  { ...base, acao: "candidatos-vinculo", entidade: "Projeto", schema: candidatosSchema, audit: false },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    if (i.modo === "ficha") {
      const projetos = await projetosLinkaveis(ctx.user, i.id);
      return projetos.map((p) => ({ id: p.id, rotulo: `${p.codigo} · ${p.nome}`, detalhe: null as string | null }));
    }
    const fichas = await fichasLinkaveis(ctx.user, i.id);
    return fichas.map((f) => ({
      id: f.id,
      rotulo: f.titulo,
      detalhe: f.valorNegociado != null ? brl(f.valorNegociado) : (null as string | null),
    }));
  },
);

export const previaDoVinculo = defineAction(
  { ...base, acao: "previa-vinculo", entidade: "Projeto", schema: previaSchema, audit: false },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    return previaVinculo(ctx.user, i.projetoId, i.negociacaoId);
  },
);

export const linkarProjeto = defineAction(
  {
    ...base,
    acao: "linkar-projeto-ficha",
    entidade: "Projeto",
    schema: linkarSchema,
    entidadeId: (_d, i) => i.projetoId,
  },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    const r = await vincularProjetoNaFicha(ctx.user, i);
    // Novo coordenador entra no chat do projeto (mesma sincronia das outras mudanças de equipe).
    if (r.coordenadorCriado) refletirSincroniaCanais(await ensureCanaisProjeto(i.projetoId));
    revalidar(i.projetoId);
    return r;
  },
);

export const desfazerLinkProjeto = defineAction(
  {
    ...base,
    acao: "desfazer-link-projeto-ficha",
    entidade: "Projeto",
    schema: desfazerSchema,
    entidadeId: (_d, i) => i.projetoId,
  },
  async (i, ctx) => {
    await exigirProjetosGerir(ctx.user);
    const r = await desvincularProjetoDaFicha(ctx.user, i.projetoId);
    revalidar(i.projetoId);
    return r;
  },
);
```

Se `defineAction` reclamar de `audit: false` ou de `entidadeId: (_d, i) =>` com o tipo de `S`, copiar a forma usada em `src/modules/comercial/actions.ts` (grep por `audit: false` e por `entidadeId:`).

- [ ] **Step 3: Tipos e lint**

Run (PowerShell): `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit` e `npx eslint src/modules/comercial/vinculo` (sem `--quiet`).
Expected: sem erros nem avisos novos.

- [ ] **Step 4: Commit**

```bash
git add src/modules/comercial/vinculo/schemas.ts src/modules/comercial/vinculo/actions.ts
git commit -m "feat(comercial): actions do link projeto × ficha

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 6: Interface — diálogo e ponto de entrada na ficha

**Files:**
- Create: `src/components/comercial/linkar-projeto-dialog.tsx`
- Create: `src/components/comercial/projetos-linkados.tsx`
- Modify: `src/modules/comercial/queries.ts` (`fichaNegociacao`, ~linhas 1514–1591)
- Modify: `src/components/comercial/ficha-card-dialog.tsx` (props de `FichaCardDialog` e `FichaNegociacaoAbas`, bloco "Dados")
- Modify: `src/app/(dashboard)/comercial/funil/page.tsx` (~linhas 77 e 165)

**Interfaces:**
- Consumes (Task 5): `candidatosParaVinculo`, `previaDoVinculo`, `linkarProjeto`, `desfazerLinkProjeto`. (Task 2): `PreviaVinculo`, `MOTIVO_CRIADO_PELO_ACEITE`.
- Produces:
  - `LinkarProjetoDialog({ alvo: { modo: "ficha"; negociacaoId: string } | { modo: "projeto"; projetoId: string }; aberto: boolean; onAbertoChange: (v: boolean) => void })` — usado também pela Task 7.
  - `ProjetosLinkados({ negociacaoId: string; contratada: boolean; podeVincular: boolean; projetos: { id: string; codigo: string; nome: string; criadoPeloAceite: boolean }[] })`
  - `FichaNegociacao` ganha `projetos: { id; codigo; nome; criadoPeloAceite }[]`; `FichaCardDialog` ganha a prop `podeVincular: boolean`.

- [ ] **Step 1: A ficha traz os projetos linkados**

Em `fichaNegociacao` (`src/modules/comercial/queries.ts`), dentro do `select` da negociação, logo após `disciplinas: { … },` (antes de `propostas:`), acrescentar:

```ts
      projetos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, codigo: true, nome: true, proposta: { select: { id: true } } },
      },
```

No objeto retornado (`return { ...n, … }`), acrescentar depois de `anexos: n.lead?.anexos ?? [],`:

```ts
    // `criadoPeloAceite` trava o "Desfazer link": esse projeto tem os DOIS caminhos gravados (Proposta.projetoId).
    projetos: n.projetos.map((p) => ({ id: p.id, codigo: p.codigo, nome: p.nome, criadoPeloAceite: p.proposta != null })),
```

(`...n` já espalha `projetos` cru com `proposta`; o campo explícito abaixo o sobrescreve com a forma limpa.)

- [ ] **Step 2: Diálogo de link**

Criar `src/components/comercial/linkar-projeto-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { candidatosParaVinculo, linkarProjeto, previaDoVinculo } from "@/modules/comercial/vinculo/actions";
import type { PreviaVinculo } from "@/modules/comercial/vinculo/regras";

export type AlvoLink = { modo: "ficha"; negociacaoId: string } | { modo: "projeto"; projetoId: string };

type Candidato = { id: string; rotulo: string; detalhe: string | null };
type Escolha = { importar: boolean; exibir: boolean };

const ROTULO_ORIGEM = { anexo_lead: "Anexo", proposta_pdf: "Proposta" } as const;

/**
 * Um diálogo, dois pontos de entrada (ficha contratada e ⋯ do projeto). Passo 1: escolher o outro lado
 * (projeto ou ficha do MESMO cliente). Passo 2: prévia — o que será preenchido/mantido e os arquivos, cada um
 * com "importar" (marcado) e "mostrar em Recebidos" (desmarcado: nada vai ao projetista sem decisão).
 */
export function LinkarProjetoDialog({
  alvo,
  aberto,
  onAbertoChange,
}: {
  alvo: AlvoLink;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-xl">
        {/* Monta só quando aberto: estado limpo a cada abertura e a lista de candidatos sempre fresca. */}
        {aberto && <Conteudo alvo={alvo} fechar={() => onAbertoChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ alvo, fechar }: { alvo: AlvoLink; fechar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [previa, setPrevia] = useState<PreviaVinculo | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [incluirResumo, setIncluirResumo] = useState(true);

  const modo = alvo.modo;
  const idDoAlvo = alvo.modo === "ficha" ? alvo.negociacaoId : alvo.projetoId;

  useEffect(() => {
    let vivo = true;
    candidatosParaVinculo({ modo, id: idDoAlvo }).then((r) => {
      if (!vivo) return;
      if (r.ok) setCandidatos(r.data);
      else {
        toast.error(r.error);
        setCandidatos([]);
      }
    });
    return () => {
      vivo = false;
    };
  }, [modo, idDoAlvo]);

  async function escolher(c: Candidato) {
    setCarregandoPrevia(true);
    const ids =
      alvo.modo === "ficha"
        ? { projetoId: c.id, negociacaoId: alvo.negociacaoId }
        : { projetoId: alvo.projetoId, negociacaoId: c.id };
    const r = await previaDoVinculo(ids);
    setCarregandoPrevia(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setPrevia(r.data);
    setEscolhas(Object.fromEntries(r.data.arquivos.map((a) => [a.chave, { importar: a.importarPadrao, exibir: false }])));
    setIncluirResumo(r.data.novaDescricao != null);
  }

  function atualizar(chave: string, parte: Partial<Escolha>) {
    setEscolhas((atual) => ({ ...atual, [chave]: { ...atual[chave], ...parte } }));
  }

  function confirmar() {
    if (!previa) return;
    start(async () => {
      const r = await linkarProjeto({
        projetoId: previa.projeto.id,
        negociacaoId: previa.ficha.id,
        arquivos: previa.arquivos
          .filter((a) => escolhas[a.chave]?.importar)
          .map((a) => ({ chave: a.chave, exibirEmRecebidos: escolhas[a.chave].exibir })),
        incluirResumo: incluirResumo && previa.novaDescricao != null,
      });
      if (r.ok) {
        toast.success(
          r.data.arquivos > 0
            ? `Projeto linkado. ${r.data.arquivos} arquivo(s) na pasta Geral do projeto.`
            : "Projeto linkado.",
        );
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const nadaMarcado = previa ? previa.arquivos.every((a) => !escolhas[a.chave]?.importar) : true;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{alvo.modo === "ficha" ? "Linkar projeto a esta ficha" : "Linkar a uma ficha do funil"}</DialogTitle>
        <DialogDescription>
          {previa
            ? `${previa.projeto.codigo} · ${previa.projeto.nome}  ↔  ${previa.ficha.titulo}`
            : alvo.modo === "ficha"
              ? "Escolha o projeto do mesmo cliente que corresponde a esta ficha."
              : "Escolha a ficha Contratado do mesmo cliente que originou este projeto."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        {!previa && (
          <div className="space-y-2">
            {candidatos === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {candidatos?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {alvo.modo === "ficha"
                  ? "Nenhum projeto deste cliente está livre para linkar."
                  : "Nenhuma ficha Contratado deste cliente encontrada."}
              </p>
            )}
            {candidatos?.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={carregandoPrevia}
                onClick={() => escolher(c)}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
              >
                <span className="min-w-0 truncate font-medium">{c.rotulo}</span>
                {c.detalhe && <span className="shrink-0 text-xs text-muted-foreground">{c.detalhe}</span>}
              </button>
            ))}
          </div>
        )}

        {previa?.motivo && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{previa.motivo}</p>}

        {previa && !previa.motivo && (
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados do projeto</h3>
              {previa.preencheTexto.map((f) => (
                <p key={f.campo}>
                  <span className="text-muted-foreground">Vai preencher:</span> {f.rotulo} — <strong>{f.valor}</strong>
                </p>
              ))}
              {previa.mantemTexto.map((f) => (
                <p key={f.campo} className="text-muted-foreground">
                  Vai manter: {f.rotulo} (o projeto já tem)
                </p>
              ))}
              {previa.coordenador && (
                <p>
                  <span className="text-muted-foreground">Vai incluir como coordenador:</span> {previa.coordenador.nome}
                </p>
              )}
              {previa.preencheTexto.length === 0 && previa.mantemTexto.length === 0 && !previa.coordenador && (
                <p className="text-muted-foreground">A ficha não traz dados novos para o projeto.</p>
              )}
            </section>

            {previa.resumo && (
              <section>
                {previa.descricaoVazia ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50">
                    <Checkbox checked={incluirResumo} onCheckedChange={(v) => setIncluirResumo(v as boolean)} />
                    <span>
                      Resumir o histórico comercial na descrição do projeto
                      <span className="mt-1 block whitespace-pre-wrap text-xs text-muted-foreground">{previa.resumo}</span>
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A descrição do projeto já está preenchida: o resumo do histórico não será gravado.
                  </p>
                )}
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Arquivos para a pasta Geral
              </h3>
              {previa.arquivos.length === 0 && <p className="text-muted-foreground">Esta ficha não tem arquivos para importar.</p>}
              {previa.arquivos.map((a) => {
                const e = escolhas[a.chave] ?? { importar: false, exibir: false };
                return (
                  <div key={a.chave} className="min-w-0 space-y-1.5 rounded-md border px-3 py-2.5">
                    <label className="flex min-w-0 cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={e.importar}
                        disabled={!a.existe}
                        onCheckedChange={(v) => atualizar(a.chave, { importar: v as boolean, exibir: v ? e.exibir : false })}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{a.nome}</span>
                      <Badge variant="outline" className="shrink-0">
                        {ROTULO_ORIGEM[a.origem]}
                      </Badge>
                    </label>
                    {a.motivoNaoImportar && <p className="pl-7 text-xs text-muted-foreground">{a.motivoNaoImportar}</p>}
                    <label className="flex cursor-pointer items-center gap-3 pl-7 text-xs text-muted-foreground">
                      <Checkbox
                        checked={e.exibir}
                        disabled={!e.importar}
                        onCheckedChange={(v) => atualizar(a.chave, { exibir: v as boolean })}
                      />
                      Mostrar também em &ldquo;Recebidos do cliente&rdquo; (os projetistas passam a ver)
                    </label>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {previa ? (
          <Button variant="outline" onClick={() => setPrevia(null)} disabled={pending}>
            Voltar
          </Button>
        ) : (
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
        )}
        {previa && !previa.motivo && (
          <Button onClick={confirmar} disabled={pending}>
            {pending ? "Linkando…" : nadaMarcado ? "Linkar sem arquivos" : "Linkar e importar"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
```

- [ ] **Step 3: Bloco "Projetos linkados" da ficha**

Criar `src/components/comercial/projetos-linkados.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { desfazerLinkProjeto } from "@/modules/comercial/vinculo/actions";
import { MOTIVO_CRIADO_PELO_ACEITE } from "@/modules/comercial/vinculo/regras";
import { LinkarProjetoDialog } from "./linkar-projeto-dialog";

type Projeto = { id: string; codigo: string; nome: string; criadoPeloAceite: boolean };

/** Bloco da ficha contratada: os projetos já linkados (com atalho) e o botão de linkar mais um. */
export function ProjetosLinkados({
  negociacaoId,
  contratada,
  podeVincular,
  projetos,
}: {
  negociacaoId: string;
  contratada: boolean;
  podeVincular: boolean;
  projetos: Projeto[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);

  if (!contratada && projetos.length === 0) return null;

  // confirm SEMPRE antes do start().
  async function desfazer(p: Projeto) {
    const ok = await confirm({
      title: "Desfazer o link com este projeto?",
      description: `${p.codigo} deixa de apontar para esta ficha. Os arquivos e dados que já foram importados continuam no projeto.`,
      confirmLabel: "Desfazer link",
    });
    if (!ok) return;
    start(async () => {
      const r = await desfazerLinkProjeto({ projetoId: p.id });
      if (r.ok) {
        toast.success("Link desfeito.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2 rounded-sm border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Projetos linkados</h3>
        {podeVincular && contratada && (
          <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
            <Link2 className="size-3.5" /> Linkar projeto
          </Button>
        )}
      </div>
      {projetos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum projeto linkado a esta ficha ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {projetos.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
              <Link href={`/projetos/${p.id}`} className="min-w-0 truncate font-medium hover:underline">
                {p.codigo} · {p.nome}
              </Link>
              {podeVincular && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => desfazer(p)}
                  disabled={pending || p.criadoPeloAceite}
                  title={p.criadoPeloAceite ? MOTIVO_CRIADO_PELO_ACEITE : undefined}
                >
                  <Unlink className="size-3.5" /> Desfazer link
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeVincular && <LinkarProjetoDialog alvo={{ modo: "ficha", negociacaoId }} aberto={aberto} onAbertoChange={setAberto} />}
    </div>
  );
}
```

- [ ] **Step 4: Ligar na ficha e no funil**

Em `ficha-card-dialog.tsx`:
1. Import: `import { ProjetosLinkados } from "./projetos-linkados";`
2. `FichaCardDialog({ ficha, opcoes, podeGerir, podeVincular }: { …; podeVincular: boolean })` — acrescentar a prop na assinatura e no tipo, e repassar: `<FichaNegociacaoAbas negociacao={ficha.negociacao} opcoes={opcoes} podeGerir={podeGerir} podeVincular={podeVincular} />`.
3. `FichaNegociacaoAbas({ negociacao: n, opcoes, podeGerir, podeVincular }: { …; podeVincular: boolean })`.
4. No bloco `dados` da negociação, imediatamente ANTES de `<NegociacaoDisciplinasForm`, inserir:

```tsx
      <ProjetosLinkados
        negociacaoId={n.id}
        contratada={n.estagio === "CONTRATADO"}
        podeVincular={podeVincular}
        projetos={n.projetos}
      />
```

Em `src/app/(dashboard)/comercial/funil/page.tsx`:
- Após `const podeGerir = await can(user, "comercial", "gerir");` (linha ~77): `const podeVincular = podeGerir && (await can(user, "projetos", "gerir"));`
- Na linha do `FichaCardDialog` (~165): `<FichaCardDialog key={card} ficha={ficha} opcoes={opcoesFicha} podeGerir={podeGerir} podeVincular={podeVincular} />`

- [ ] **Step 5: Tipos e lint**

Run (PowerShell): `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit; npx eslint src/components/comercial src/modules/comercial src/app/(dashboard)/comercial`
Expected: sem erros nem avisos novos. Se algum outro lugar renderiza `FichaCardDialog`, o `tsc` aponta a prop faltando (hoje só o `funil/page.tsx` renderiza).

- [ ] **Step 6: Commit**

```bash
git add src/components/comercial/linkar-projeto-dialog.tsx src/components/comercial/projetos-linkados.tsx src/components/comercial/ficha-card-dialog.tsx src/modules/comercial/queries.ts "src/app/(dashboard)/comercial/funil/page.tsx"
git commit -m "feat(comercial): linkar projeto na ficha contratada com prévia e importação de anexos

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 7: Interface — ponto de entrada no projeto

**Files:**
- Modify: `src/app/(dashboard)/projetos/[id]/layout.tsx`
- Modify: `src/components/projetos/projeto-acoes-menu.tsx`

**Interfaces:**
- Consumes (Task 3): `origemComercialDoProjeto`. (Task 6): `LinkarProjetoDialog`. (Task 5): `desfazerLinkProjeto`. (Task 2): `MOTIVO_CRIADO_PELO_ACEITE`.
- Produces: prop `vinculo?: { podeVincular: boolean; ficha: { id: string; titulo: string } | null; criadoPeloAceite: boolean }` em `ProjetoAcoesMenu`.

- [ ] **Step 1: Layout do projeto**

Em `src/app/(dashboard)/projetos/[id]/layout.tsx`:

1. Import: `import { origemComercialDoProjeto } from "@/modules/comercial/vinculo/queries";`
2. No destructuring do `Promise.all` (linha ~43), acrescentar ao final da lista `podeComercialGerir, podeComercialVer, origemComercial,` e, no array de promessas, ao final (depois do `prisma.tipoEmpreendimento.findMany({…})`):

```ts
    can(user, "comercial", "gerir"),
    can(user, "comercial", "ver"),
    origemComercialDoProjeto(id),
```

3. Depois de `const clientes = …`, definir:

```ts
  const vinculo = {
    podeVincular: podeGerir && podeComercialGerir,
    ficha: origemComercial.ficha,
    criadoPeloAceite: origemComercial.criadoPeloAceite,
  };
```

4. No cabeçalho, logo após o `<Link href={`/clientes/…`}>` do cliente, inserir a origem comercial:

```tsx
        {origemComercial.ficha &&
          (podeComercialVer ? (
            <Link
              href={`/comercial/funil?card=NEGOCIACAO:${origemComercial.ficha.id}`}
              title="Ficha do funil comercial"
              className="min-w-0 shrink truncate text-xs text-muted-foreground hover:underline"
            >
              · Ficha: {origemComercial.ficha.titulo}
            </Link>
          ) : (
            <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
              · Ficha: {origemComercial.ficha.titulo}
            </span>
          ))}
```

5. Nas DUAS ocorrências de `<ProjetoAcoesMenu …>` (desktop e `celular`), acrescentar `vinculo={vinculo}`.

- [ ] **Step 2: Item no ⋯ do projeto**

Em `src/components/projetos/projeto-acoes-menu.tsx`:

1. Imports: acrescentar `Link2, Unlink` ao import de `lucide-react`; `import { useRouter } from "next/navigation";`; `import { desfazerLinkProjeto } from "@/modules/comercial/vinculo/actions";`; `import { MOTIVO_CRIADO_PELO_ACEITE } from "@/modules/comercial/vinculo/regras";`; `import { LinkarProjetoDialog } from "@/components/comercial/linkar-projeto-dialog";`.
2. Na assinatura/tipo, acrescentar a prop:

```ts
  vinculo?: { podeVincular: boolean; ficha: { id: string; titulo: string } | null; criadoPeloAceite: boolean };
```

3. Dentro do componente, junto dos outros `useState`:

```ts
  const router = useRouter();
  const [linkar, setLinkar] = useState(false);
```

e a função (confirm ANTES do `startTransition`), junto de `handleReativar`:

```ts
  const handleDesfazerLink = async () => {
    const ok = await confirm({
      title: "Desfazer o link com a ficha?",
      description: "O projeto deixa de apontar para a ficha do funil. Os arquivos e dados que já foram importados continuam no projeto.",
      confirmLabel: "Desfazer link",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await desfazerLinkProjeto({ projetoId });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Link desfeito.");
        router.refresh();
      }
    });
  };
```

4. No `DropdownMenuContent`, logo depois do item "Duplicar projeto" (`{podeGerir && (… Duplicar projeto …)}`):

```tsx
          {vinculo?.podeVincular &&
            (vinculo.ficha ? (
              <DropdownMenuItem
                className="gap-2"
                onClick={handleDesfazerLink}
                disabled={vinculo.criadoPeloAceite || pending}
              >
                <Unlink className="size-4" />
                <span className="flex flex-col">
                  Desfazer link com a ficha
                  {vinculo.criadoPeloAceite && (
                    <span className="text-xs text-muted-foreground">{MOTIVO_CRIADO_PELO_ACEITE}</span>
                  )}
                </span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="gap-2" onClick={() => setLinkar(true)}>
                <Link2 className="size-4" /> Linkar a uma ficha do funil
              </DropdownMenuItem>
            ))}
```

5. Depois do `{podeGerir && <DuplicarProjetoButton … />}`:

```tsx
      {vinculo?.podeVincular && !vinculo.ficha && (
        <LinkarProjetoDialog alvo={{ modo: "projeto", projetoId }} aberto={linkar} onAbertoChange={setLinkar} />
      )}
```

- [ ] **Step 3: Tipos e lint**

Run (PowerShell): `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit; npx eslint "src/app/(dashboard)/projetos" src/components/projetos` (sem `--quiet`).
Expected: sem erros nem avisos novos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/projetos/[id]/layout.tsx" src/components/projetos/projeto-acoes-menu.tsx
git commit -m "feat(projetos): linkar o projeto a uma ficha do funil pelo menu e mostrar a origem comercial

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

### Task 8: Documentação e auditoria final

**Files:**
- Modify: `CLAUDE.md` (lista de comandos e parágrafo do Comercial)
- Modify: `docs/manual/clientes-comercial/comercial.md`, `docs/manual/projetos/projetos.md`, `docs/manual/novidades.md`

- [ ] **Step 1: Documentar**

- `CLAUDE.md`: na lista de comandos, depois da linha de `smoke:pastas-cliente`, acrescentar:
  `npm run smoke:vinculo-projeto-ficha # link projeto × ficha: recusas, só preenche vazio, anexos copiados (apagar o do funil não quebra), corrida sem arquivo órfão, dedupe por hash, desfazer, trava do projeto do aceite`
  E, no bloco "Comercial / CRM", um parágrafo curto: **Link projeto × ficha** (`modules/comercial/vinculo/`, spec `docs/superpowers/specs/2026-10-15-vinculo-projeto-ficha-design.md`): como o comercial não usa proposta, o projeto nasce à mão; o link grava `Projeto.negociacaoId` de uma ficha Contratado do mesmo cliente, preenche só campo vazio, COPIA os anexos escolhidos (anexos do lead + PDF vigente de cada proposta) para a Geral (`Documento` origem `interno`, categoria "Comercial") com `exibirEmRecebidos` por arquivo; desfazer só zera o `negociacaoId` e é recusado quando o projeto tem `Proposta.projetoId`.
- `docs/manual/clientes-comercial/comercial.md`: seção "Linkar um projeto à ficha" (passo a passo da ficha contratada: Linkar projeto → escolher → conferir a prévia → marcar arquivos → Linkar e importar; o que NÃO vem: disciplinas, contrato, parcelas).
- `docs/manual/projetos/projetos.md`: "Origem comercial" no cabeçalho do projeto e o item "Linkar a uma ficha do funil" / "Desfazer link" no ⋯.
- `docs/manual/novidades.md`: entrada em linguagem de usuário, no formato das entradas existentes.

- [ ] **Step 2: Ler e seguir o protocolo**

Ler `docs/PROTOCOLO_AUDITORIA_FINAL.md` (relê toda vez, ele muda), escolher o nível pelo risco real (esta mudança toca permissão, escrita em disco e transação → nível 3) e seguir a Seção 13 (comandos reais, subagentes revisores `action-guardian`, `upload-storage-auditor`, `prisma-migration-reviewer` NÃO se aplica — sem migração —, e verificação em tela).

Comandos mínimos, nesta ordem:
```
npm run lint
npm test
$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc -p tsconfig.server.json --noEmit
npm run smoke:vinculo-projeto-ficha
```
(`npm run build` só depois de parar qualquer `next dev` desta pasta.)

- [ ] **Step 3: Verificação em tela (feita pelo agente)**

Subir `npm run dev -- -p 3001` nesta pasta. Login com o admin de teste do dev (memória `admin-teste-dev`). Em um cliente de teste: criar lead com 2 anexos, qualificar até uma ficha Contratado, criar uma proposta externa com PDF, criar um projeto do mesmo cliente. Verificar e fotografar (1366×768 com o menu aberto e 390×844; `document.documentElement.scrollWidth` = 390 no celular):
1. Ficha contratada → "Linkar projeto" → lista só projetos do mesmo cliente → prévia com "Vai preencher / Vai manter", lista com anexo e PDF da proposta, "Mostrar em Recebidos" desmarcado → Linkar.
2. Projeto → aba Arquivos → pasta Geral com os documentos (categoria Comercial); o marcado também em "Recebidos do cliente".
3. Usuário projetista (sem `arquivos_gerais:ver`) vê em Recebidos só o marcado.
4. Cabeçalho do projeto mostra "Ficha: …" com link; ⋯ mostra "Desfazer link com a ficha"; desfazer pede confirmação e o projeto some do bloco da ficha.
5. Segundo projeto: item "Linkar a uma ficha do funil" no ⋯ lista só fichas Contratado do cliente.

Salvar em `prints-auditoria/2026-10-15_vinculo-projeto-ficha/` (gitignored) com `LEIAME.md` descrevendo cada print. Entregar o relatório em pt-BR conforme o protocolo.

- [ ] **Step 4: Commit da documentação**

```bash
git add CLAUDE.md docs/manual/clientes-comercial/comercial.md docs/manual/projetos/projetos.md docs/manual/novidades.md
git commit -m "docs(comercial): documenta o link projeto × ficha do funil

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git show --stat --oneline HEAD
```

---

## Self-Review (feita ao escrever)

- **Cobertura do spec:** R1–R3 → `motivoParaNaoVincular` (Task 2) + prévia/serviço (3, 4); R4–R5 → `planejarCampos` (2) e transação (4); R6 → `resumoHistorico`/`descricaoComResumo` (2) e prévia (3); R7 (dedupe) → `marcarArquivos` (2) e prévia (3); arquivos oferecidos (anexos + PDF vigente) → `itensDaFicha` (3); execução em duas fases com limpeza → Task 4; desfazer + trava do aceite → Task 4; permissões e auditoria → Task 5; interface nos dois pontos → Tasks 6 e 7; testes/smoke/tela/auditoria → Tasks 2, 4 e 8. Disciplinas ficaram de fora, como decidido.
- **Placeholders:** nenhum; os dois pontos com "se o `tsc` reclamar" (assinatura de `escopoProjeto` e forma de `audit`/`entidadeId`) indicam o arquivo exato onde copiar a forma que já compila.
- **Consistência de nomes:** `previaVinculo`, `vincularProjetoNaFicha`, `desvincularProjetoDaFicha`, `EntradaVinculo`, `linkarProjeto`, `desfazerLinkProjeto`, `candidatosParaVinculo`, `previaDoVinculo`, `LinkarProjetoDialog`, `ProjetosLinkados`, `origemComercialDoProjeto` e as constantes `MOTIVO_*` batem entre as tarefas.
- **Revisão de foco:** os 7 itens estão ligados a teste (Tasks 2 e 4); o 7 é condicional ao banco de dev.
