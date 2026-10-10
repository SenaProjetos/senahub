# Verificação de requisitos do modelo (IDS) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conferir cada revisão de IFC do escritório contra os arquivos .ids do projeto, guardar o relatório,
e — se o projeto ligar — impedir a publicação da revisão reprovada (salvo justificativa).

**Architecture:** núcleo PURO em `src/modules/coordenacao/ids/` (leitor do .ids, restrições, avaliação contra
uma interface `AcessoModelo`); adaptador web-ifc que implementa `AcessoModelo` lendo o IFC; processo separado
`scripts/verificar-ids.ts` (mesmo padrão de `converter-ifc.ts`) chamado por uma fila pg-boss; tabelas
`RequisitoIds`/`VerificacaoIds`; painel na aba Compatibilização; regra nova em `decidirPublicacao`.

**Tech Stack:** Next 15 + React 19, Prisma 7, pg-boss, web-ifc 0.0.77 (WASM, já instalado),
fast-xml-parser 5.11.1 (já instalado), vitest (env node).

**Spec:** `docs/superpowers/specs/2026-10-10-verificacao-ids-design.md` (D1–D10 aprovadas em 2026-10-10).

## Global Constraints

- Código em inglês só nos nomes técnicos que o projeto já usa assim; identificadores do domínio, textos de tela, mensagens e commits em **pt-BR** (CLAUDE.md).
- Toda mutação por `defineAction` (`lib/with-action.ts`) com `recurso: "coordenacao"`; auditoria automática. Erro de negócio = `ActionError` com frase para o usuário.
- REST só para multipart: o envio do .ids é `POST /api/coordenacao/ids` (rota fora do middleware: autentica sozinha, como `/api/coordenacao/snapshot`).
- Caminhos de arquivo sempre por `resolverCaminho()` (`lib/storage.ts`).
- Prisma: importar de `@/generated/prisma/client`; nada de `Promise.all` dentro de `$transaction`.
- Migração: escrever o SQL à mão em `prisma/migrations/<timestamp>_verificacao_ids/migration.sql`, aplicar com `npx prisma db push` + `npx prisma migrate resolve --applied <nome>` (o `migrate dev` deste banco pede reset — memória "Drift de migração → reset").
- pg-boss e socket em `globalThis` (não criar variável de módulo); jobs só rodam no `npm run dev:server`.
- Arquivos puros (`ids/*.ts` exceto `acesso-web-ifc.ts`, `service.ts`, `queries.ts`, `actions.ts`) não importam Prisma, `server-only`, Next nem web-ifc.
- Precisão de float do IDS: igual se estiver entre `x*(1-1e-6)-1e-6` e `x*(1+1e-6)+1e-6` (exclusivo).
- Casos oficiais: licença CC BY-ND 4.0 — **não** copiar para o repositório; o script baixa para `test-data/ids-casos/` (ignorado pelo git) e o teste de conformidade pula com aviso quando a pasta não existe.
- Telas: `CabecalhoPagina` não se aplica (painel do dock). Menu de contexto pelo padrão ADR-0002 (descritor puro `itensDe…` + `LinhaComMenu`/`BotaoAcoes`). Nada de `contextmenu` à mão.

## Review Focus

1. **.ids com especificação em IFC4X3 ou IFC2X3 e IFC do arquivo em IFC4** — a especificação não se aplica àquele arquivo; deve aparecer como "não se aplica a esta versão do IFC", não reprovada (Task 5).
2. **Propriedade herdada do tipo (IfcRelDefinesByType) e sobrescrita na ocorrência** — vale a da ocorrência; sem ela, a do tipo (Task 7, caso oficial e teste próprio).
3. **IFC em milímetros com requisito de comprimento em metros** — 3000 mm cumpre "= 3"; pé/polegada vira "não verificado" (Task 7).
4. **Requisito com padrão XSD que não existe em JavaScript** (`\i`, `\c`, classes `\p{IsBasicLatin}`) — leitor marca a restrição como não suportada e o requisito sai "não verificado", sem lançar erro (Task 3).
5. **Modelo grande (milhares de elementos reprovados)** — `falhas` corta em 500 por requisito, `total` guarda o número real, o relatório diz "mostrando 500 de N" (Task 10).

---

### Task 1: Casos oficiais e tabela de tipos de dado

**Files:**
- Create: `scripts/baixar-casos-ids.ts`
- Create: `scripts/gerar-tipos-ids.ts`
- Create: `src/modules/coordenacao/ids/tipos-de-dado.ts` (gerado e commitado — são fatos da norma: nome do tipo IFC → tipo XSD base)
- Modify: `.gitignore` (acrescentar `/test-data/`)
- Modify: `package.json` (scripts `ids:baixar-casos`, `ids:gerar-tipos`)

**Interfaces:**
- Produces: `TIPO_BASE_IDS: Record<string, "string" | "double" | "integer" | "boolean" | "date" | "dateTime" | "time" | "duration" | null>` e `tipoBaseDoDado(dataType: string): ... | undefined` em `ids/tipos-de-dado.ts`; pasta `test-data/ids-casos/<faceta>/{pass,fail,invalid}-*.{ids,ifc}`.

- [ ] **Step 1: Script de download**

```ts
// scripts/baixar-casos-ids.ts
/**
 * Baixa os casos de teste oficiais do IDS (buildingSMART/IDS, CC BY-ND 4.0) para test-data/ids-casos/.
 * NÃO vai para o git (licença sem derivadas): cada máquina baixa. Uso: npm run ids:baixar-casos
 */
import fs from "node:fs/promises";
import path from "node:path";

const REPO = "buildingSMART/IDS";
const RAMO = "development";
const BASE = "Documentation/ImplementersDocumentation/TestCases";
const PASTAS = ["entity", "attribute", "property", "classification", "material", "partof", "restriction", "tolerance", "ids"];
const DESTINO = path.resolve("test-data/ids-casos");

async function listar(pasta: string): Promise<{ name: string; download_url: string }[]> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${BASE}/${pasta}?ref=${RAMO}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "senahub" },
  });
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} para ${pasta}`);
  return (await r.json()) as { name: string; download_url: string }[];
}

async function main() {
  for (const pasta of PASTAS) {
    const dir = path.join(DESTINO, pasta);
    await fs.mkdir(dir, { recursive: true });
    const itens = (await listar(pasta)).filter((i) => /\.(ids|ifc)$/.test(i.name));
    for (const item of itens) {
      const r = await fetch(item.download_url);
      if (!r.ok) throw new Error(`Falha ao baixar ${item.name}: ${r.status}`);
      await fs.writeFile(path.join(dir, item.name), Buffer.from(await r.arrayBuffer()));
    }
    console.log(`${pasta}: ${itens.length} arquivos`);
  }
  // A tabela de tipos de dado também vem do repositório (gerar-tipos-ids.ts lê daqui).
  const doc = await fetch(`https://raw.githubusercontent.com/${REPO}/${RAMO}/Documentation/ImplementersDocumentation/DataTypes.md`);
  await fs.writeFile(path.join(DESTINO, "DataTypes.md"), await doc.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Gerador da tabela de tipos**

```ts
// scripts/gerar-tipos-ids.ts
/** Lê test-data/ids-casos/DataTypes.md e escreve src/modules/coordenacao/ids/tipos-de-dado.ts. */
import fs from "node:fs/promises";

async function main() {
  const md = await fs.readFile("test-data/ids-casos/DataTypes.md", "utf8");
  const linhas = md.split(/\r?\n/).filter((l) => /^\|\s*IFC[A-Z0-9_]+\s*\|/.test(l));
  const pares = linhas.map((l) => {
    const cols = l.split("|").map((c) => c.trim());
    const nome = cols[1];
    const base = cols[5]?.replace(/^xs:/, "") || "";
    return [nome, base || null] as const;
  });
  const corpo = pares.map(([n, b]) => `  ${n}: ${b ? JSON.stringify(b) : "null"},`).join("\n");
  const ts = `/**
 * Tipo de dado IFC → tipo XSD base da restrição (tabela "DataTypes" do IDS 1.0, buildingSMART).
 * GERADO por scripts/gerar-tipos-ids.ts — não editar à mão.
 */
export type TipoBaseIds = "string" | "double" | "integer" | "boolean" | "date" | "dateTime" | "time" | "duration";

export const TIPO_BASE_IDS: Readonly<Record<string, TipoBaseIds | null>> = {
${corpo}
};

/** undefined = tipo desconhecido do IDS (o leitor recusa); null = tipo sem restrição (ex.: IFCBINARY). */
export function tipoBaseDoDado(dataType: string): TipoBaseIds | null | undefined {
  return TIPO_BASE_IDS[dataType.toUpperCase()] as TipoBaseIds | null | undefined;
}
`;
  await fs.writeFile("src/modules/coordenacao/ids/tipos-de-dado.ts", ts);
  console.log(`${pares.length} tipos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Rodar, conferir e registrar**

```bash
# package.json → "scripts": { …, "ids:baixar-casos": "tsx --tsconfig tsconfig.server.json scripts/baixar-casos-ids.ts", "ids:gerar-tipos": "tsx --tsconfig tsconfig.server.json scripts/gerar-tipos-ids.ts" }
echo "/test-data/" >> .gitignore
npm run ids:baixar-casos   # esperado: entity: 66 arquivos, attribute: 112, property: 164 …
npm run ids:gerar-tipos    # esperado: ~300 tipos
grep -c "IFCLENGTHMEASURE: \"double\"" src/modules/coordenacao/ids/tipos-de-dado.ts   # esperado: 1
grep -c "IFCLABEL: \"string\"" src/modules/coordenacao/ids/tipos-de-dado.ts           # esperado: 1
```

- [ ] **Step 4: Commit**

```bash
git add scripts/baixar-casos-ids.ts scripts/gerar-tipos-ids.ts src/modules/coordenacao/ids/tipos-de-dado.ts .gitignore package.json
git commit -m "chore(coordenacao): casos oficiais do IDS (baixados, fora do git) e tabela de tipos de dado"
```

---

### Task 2: Tipos do IDS e leitor do .ids

**Files:**
- Create: `src/modules/coordenacao/ids/tipos.ts`
- Create: `src/modules/coordenacao/ids/leitor.ts`
- Test: `src/modules/coordenacao/ids/leitor.test.ts`

**Interfaces:**
- Consumes: `tipoBaseDoDado` (Task 1).
- Produces (em `tipos.ts`):

```ts
export type Restricao =
  | { tipo: "simples"; valor: string }
  | {
      tipo: "restricao";
      base: string; // "string" | "double" | "integer" | "boolean" | …  (xs: removido)
      enumeracao?: string[];
      padroes?: string[]; // XSD pattern, cada um ancorado no valor inteiro
      minInclusive?: string;
      maxInclusive?: string;
      minExclusive?: string;
      maxExclusive?: string;
      length?: number;
      minLength?: number;
      maxLength?: number;
    };
export type Cardinalidade = "required" | "optional" | "prohibited";
export type FacetaEntidade = { tipo: "entity"; nome: Restricao; tipoPredefinido?: Restricao };
export type Faceta =
  | FacetaEntidade
  | { tipo: "attribute"; nome: Restricao; valor?: Restricao; cardinalidade: Cardinalidade }
  | { tipo: "property"; propertySet: Restricao; baseName: Restricao; dataType?: string; valor?: Restricao; cardinalidade: Cardinalidade }
  | { tipo: "classification"; sistema?: Restricao; valor?: Restricao; cardinalidade: Cardinalidade }
  | { tipo: "material"; valor?: Restricao; cardinalidade: Cardinalidade }
  | { tipo: "partOf"; relacao?: string; entidade: FacetaEntidade; cardinalidade: Cardinalidade };
export type Especificacao = {
  nome: string;
  descricao?: string;
  instrucoes?: string;
  versoesIfc: string[]; // "IFC2X3" | "IFC4" | "IFC4X3_ADD2"
  aplicabilidade: Faceta[];
  /** required = minOccurs 1; optional = 0/unbounded; prohibited = 0/0. */
  ocorrencia: Cardinalidade;
  requisitos: Faceta[];
};
export type DocumentoIds = { titulo: string; descricao?: string; versao?: string; especificacoes: Especificacao[] };
export type LeituraIds = { ok: true; ids: DocumentoIds } | { ok: false; motivo: string };
```

- Produces (em `leitor.ts`): `lerIds(xml: string): LeituraIds`.

- [ ] **Step 1: Testes do leitor**

```ts
// src/modules/coordenacao/ids/leitor.test.ts
import { describe, expect, it } from "vitest";
import { lerIds } from "@/modules/coordenacao/ids/leitor";

const envolver = (specs: string) => `<?xml version="1.0" encoding="utf-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <info><title>Teste</title></info>
  <specifications>${specs}</specifications>
</ids>`;

describe("lerIds", () => {
  it("lê especificação com entidade, propriedade e restrição", () => {
    const r = lerIds(envolver(`
      <specification name="Paredes com resistência ao fogo" ifcVersion="IFC2X3 IFC4">
        <applicability minOccurs="1" maxOccurs="unbounded">
          <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
        </applicability>
        <requirements>
          <property dataType="IFCLABEL" cardinality="required">
            <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>
            <baseName><simpleValue>FireRating</simpleValue></baseName>
            <value><xs:restriction base="xs:string"><xs:enumeration value="60"/><xs:enumeration value="90"/></xs:restriction></value>
          </property>
        </requirements>
      </specification>`));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = r.ids.especificacoes[0];
    expect(e.versoesIfc).toEqual(["IFC2X3", "IFC4"]);
    expect(e.ocorrencia).toBe("required");
    expect(e.aplicabilidade[0]).toEqual({ tipo: "entity", nome: { tipo: "simples", valor: "IFCWALL" } });
    expect(e.requisitos[0]).toMatchObject({
      tipo: "property",
      dataType: "IFCLABEL",
      cardinalidade: "required",
      valor: { tipo: "restricao", base: "string", enumeracao: ["60", "90"] },
    });
  });

  it("ocorrência opcional e proibida pelo min/maxOccurs", () => {
    const spec = (min: string, max: string) =>
      `<specification name="s" ifcVersion="IFC4"><applicability minOccurs="${min}" maxOccurs="${max}"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements/></specification>`;
    const opt = lerIds(envolver(spec("0", "unbounded")));
    const proib = lerIds(envolver(spec("0", "0")));
    expect(opt.ok && opt.ids.especificacoes[0].ocorrencia).toBe("optional");
    expect(proib.ok && proib.ids.especificacoes[0].ocorrencia).toBe("prohibited");
  });

  it("recusa XML quebrado e documento que não é IDS", () => {
    expect(lerIds("<ids><info>").ok).toBe(false);
    expect(lerIds(`<?xml version="1.0"?><foo/>`)).toEqual({ ok: false, motivo: expect.stringContaining("IDS") });
  });

  it("recusa propriedade com valor e sem dataType (regra do IDS 1.0)", () => {
    const r = lerIds(envolver(`
      <specification name="s" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><property cardinality="required"><propertySet><simpleValue>P</simpleValue></propertySet><baseName><simpleValue>B</simpleValue></baseName><value><simpleValue>1</simpleValue></value></property></requirements></specification>`));
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("dataType") });
  });

  it("recusa versão de IFC desconhecida e dataType inexistente", () => {
    const comVersao = (v: string) =>
      `<specification name="s" ifcVersion="${v}"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements/></specification>`;
    expect(lerIds(envolver(comVersao("IFC5"))).ok).toBe(false);
    const r = lerIds(envolver(`
      <specification name="s" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><property dataType="IFCNAOEXISTE" cardinality="required"><propertySet><simpleValue>P</simpleValue></propertySet><baseName><simpleValue>B</simpleValue></baseName></property></requirements></specification>`));
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/ids/leitor.test.ts`
Expected: FAIL — `Cannot find module '@/modules/coordenacao/ids/leitor'`.

- [ ] **Step 3: Implementar `tipos.ts` (o bloco de Interfaces acima, com JSDoc em pt-BR) e `leitor.ts`**

```ts
// src/modules/coordenacao/ids/leitor.ts
/**
 * Leitor PURO do .ids (IDS 1.0, buildingSMART) → DocumentoIds. Recusa o que o IDS 1.0 proíbe, com a
 * frase que vai para a tela no envio. Não valida contra o XSD inteiro: confere a estrutura que o
 * verificador usa e as regras de configuração das facetas (manual do IDS, "Configuration Allowed?").
 */
import { XMLParser } from "fast-xml-parser";
import { tipoBaseDoDado } from "./tipos-de-dado";
import type { Cardinalidade, DocumentoIds, Especificacao, Faceta, FacetaEntidade, LeituraIds, Restricao } from "./tipos";

const VERSOES = new Set(["IFC2X3", "IFC4", "IFC4X3_ADD2"]);
const FACETAS = ["entity", "attribute", "classification", "property", "material", "partOf"] as const;

type No = Record<string, unknown>;

class IdsInvalido extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true, // "xs:restriction" → "restriction", "ids:entity" → "entity"
  parseAttributeValue: false,
  parseTagValue: false, // valores sempre como texto: "007" não pode virar 7
  trimValues: true,
  isArray: (nome) => ["specification", "enumeration", "pattern", ...FACETAS].includes(nome),
});

function lista<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}

function texto(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && "#text" in (x as No)) return String((x as No)["#text"]);
  return "";
}

function restricao(no: unknown, campo: string): Restricao {
  if (!no || typeof no !== "object") throw new IdsInvalido(`Campo "${campo}" sem valor.`);
  const n = no as No;
  if ("simpleValue" in n) return { tipo: "simples", valor: texto(n.simpleValue) };
  const r = n.restriction as No | undefined;
  if (!r) throw new IdsInvalido(`Campo "${campo}" precisa de simpleValue ou xs:restriction.`);
  const valores = (k: string) => lista(r[k] as unknown).map((e) => String((e as No)["@value"] ?? ""));
  const um = (k: string) => (r[k] ? String((r[k] as No)["@value"]) : undefined);
  const inteiro = (k: string) => (r[k] ? Number((r[k] as No)["@value"]) : undefined);
  const base = String(r["@base"] ?? "xs:string").replace(/^xs:/, "");
  return {
    tipo: "restricao",
    base,
    ...(r.enumeration ? { enumeracao: valores("enumeration") } : {}),
    ...(r.pattern ? { padroes: valores("pattern") } : {}),
    ...(um("minInclusive") !== undefined ? { minInclusive: um("minInclusive") } : {}),
    ...(um("maxInclusive") !== undefined ? { maxInclusive: um("maxInclusive") } : {}),
    ...(um("minExclusive") !== undefined ? { minExclusive: um("minExclusive") } : {}),
    ...(um("maxExclusive") !== undefined ? { maxExclusive: um("maxExclusive") } : {}),
    ...(inteiro("length") !== undefined ? { length: inteiro("length") } : {}),
    ...(inteiro("minLength") !== undefined ? { minLength: inteiro("minLength") } : {}),
    ...(inteiro("maxLength") !== undefined ? { maxLength: inteiro("maxLength") } : {}),
  };
}

function cardinalidade(no: No, ehRequisito: boolean): Cardinalidade {
  if (!ehRequisito) return "required";
  const c = String(no["@cardinality"] ?? "required");
  if (c !== "required" && c !== "optional" && c !== "prohibited") throw new IdsInvalido(`Cardinalidade "${c}" inválida.`);
  return c;
}

function entidade(no: No): FacetaEntidade {
  return {
    tipo: "entity",
    nome: restricao(no.name, "entity/name"),
    ...(no.predefinedType ? { tipoPredefinido: restricao(no.predefinedType, "entity/predefinedType") } : {}),
  };
}

function facetas(bloco: unknown, ehRequisito: boolean): Faceta[] {
  if (!bloco || typeof bloco !== "object") return [];
  const b = bloco as No;
  const saida: Faceta[] = [];
  for (const no of lista(b.entity as No[])) saida.push(entidade(no));
  for (const no of lista(b.attribute as No[])) {
    const card = cardinalidade(no, ehRequisito);
    if (card === "optional" && !no.value) throw new IdsInvalido("Atributo opcional sem valor não é permitido no IDS 1.0.");
    saida.push({ tipo: "attribute", nome: restricao(no.name, "attribute/name"), ...(no.value ? { valor: restricao(no.value, "attribute/value") } : {}), cardinalidade: card });
  }
  for (const no of lista(b.classification as No[])) {
    const card = cardinalidade(no, ehRequisito);
    if (card === "optional" && !no.value) throw new IdsInvalido("Classificação opcional sem valor não é permitida no IDS 1.0.");
    saida.push({
      tipo: "classification",
      ...(no.system ? { sistema: restricao(no.system, "classification/system") } : {}),
      ...(no.value ? { valor: restricao(no.value, "classification/value") } : {}),
      cardinalidade: card,
    });
  }
  for (const no of lista(b.property as No[])) {
    const card = cardinalidade(no, ehRequisito);
    const dataType = no["@dataType"] ? String(no["@dataType"]).toUpperCase() : undefined;
    if (no.value && !dataType) throw new IdsInvalido("Propriedade com valor precisa de dataType (IDS 1.0).");
    if (dataType && tipoBaseDoDado(dataType) === undefined) throw new IdsInvalido(`dataType "${dataType}" não existe no IDS 1.0.`);
    if (card === "optional" && !dataType) throw new IdsInvalido("Propriedade opcional precisa de dataType (IDS 1.0).");
    if (card === "prohibited" && (dataType || no.value)) throw new IdsInvalido("Propriedade proibida não leva dataType nem valor (IDS 1.0).");
    saida.push({
      tipo: "property",
      propertySet: restricao(no.propertySet, "property/propertySet"),
      baseName: restricao(no.baseName, "property/baseName"),
      ...(dataType ? { dataType } : {}),
      ...(no.value ? { valor: restricao(no.value, "property/value") } : {}),
      cardinalidade: card,
    });
  }
  for (const no of lista(b.material as No[])) {
    const card = cardinalidade(no, ehRequisito);
    if (card === "optional" && !no.value) throw new IdsInvalido("Material opcional sem valor não é permitido no IDS 1.0.");
    saida.push({ tipo: "material", ...(no.value ? { valor: restricao(no.value, "material/value") } : {}), cardinalidade: card });
  }
  for (const no of lista(b.partOf as No[])) {
    if (!no.entity) throw new IdsInvalido("partOf precisa de uma entidade.");
    saida.push({
      tipo: "partOf",
      ...(no["@relation"] ? { relacao: String(no["@relation"]).toUpperCase() } : {}),
      entidade: entidade(lista(no.entity as No[])[0]),
      cardinalidade: cardinalidade(no, ehRequisito),
    });
  }
  return saida;
}

function ocorrencia(app: No): Cardinalidade {
  const min = String(app["@minOccurs"] ?? "1");
  const max = String(app["@maxOccurs"] ?? "unbounded");
  if (min === "1" && max === "unbounded") return "required";
  if (min === "0" && max === "unbounded") return "optional";
  if (min === "0" && max === "0") return "prohibited";
  throw new IdsInvalido(`minOccurs=${min}/maxOccurs=${max} não é permitido no IDS 1.0.`);
}

function especificacao(no: No): Especificacao {
  const versoes = String(no["@ifcVersion"] ?? "").split(/\s+/).filter(Boolean).map((v) => v.toUpperCase());
  if (versoes.length === 0 || versoes.some((v) => !VERSOES.has(v))) {
    throw new IdsInvalido(`Versão de IFC "${no["@ifcVersion"] ?? ""}" inválida — o IDS 1.0 aceita IFC2X3, IFC4 e IFC4X3_ADD2.`);
  }
  const app = (no.applicability ?? {}) as No;
  const aplicabilidade = facetas(app, false);
  if (aplicabilidade.length === 0) throw new IdsInvalido(`A especificação "${no["@name"] ?? ""}" não tem aplicabilidade.`);
  return {
    nome: String(no["@name"] ?? "Sem nome"),
    ...(no["@description"] ? { descricao: String(no["@description"]) } : {}),
    ...(no["@instructions"] ? { instrucoes: String(no["@instructions"]) } : {}),
    versoesIfc: versoes,
    aplicabilidade,
    ocorrencia: ocorrencia(app),
    requisitos: facetas(no.requirements, true),
  };
}

export function lerIds(xml: string): LeituraIds {
  let raiz: No;
  try {
    raiz = parser.parse(xml, true) as No;
  } catch {
    return { ok: false, motivo: "O arquivo não é um XML válido." };
  }
  const ids = raiz.ids as No | undefined;
  if (!ids) return { ok: false, motivo: "O arquivo não é um IDS (falta o elemento <ids>)." };
  try {
    const info = (ids.info ?? {}) as No;
    const specs = lista(((ids.specifications ?? {}) as No).specification as No[]);
    if (specs.length === 0) return { ok: false, motivo: "O IDS não tem nenhuma especificação." };
    const documento: DocumentoIds = {
      titulo: texto(info.title) || "Sem título",
      ...(info.description ? { descricao: texto(info.description) } : {}),
      ...(info.version ? { versao: texto(info.version) } : {}),
      especificacoes: specs.map(especificacao),
    };
    return { ok: true, ids: documento };
  } catch (e) {
    if (e instanceof IdsInvalido) return { ok: false, motivo: e.message };
    throw e;
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/modules/coordenacao/ids/leitor.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/ids/tipos.ts src/modules/coordenacao/ids/leitor.ts src/modules/coordenacao/ids/leitor.test.ts
git commit -m "feat(coordenacao): leitor do .ids (IDS 1.0) com as regras de configuração das facetas"
```

---

### Task 3: Restrições (casar valor com simpleValue/xs:restriction)

**Files:**
- Create: `src/modules/coordenacao/ids/restricoes.ts`
- Test: `src/modules/coordenacao/ids/restricoes.test.ts`

**Interfaces:**
- Consumes: `Restricao` (Task 2).
- Produces:

```ts
/** Valor lido do IFC: texto, número (já em SI quando é medida) ou booleano. */
export type ValorIfc = string | number | boolean;
export type Casamento = "sim" | "nao" | "nao_suportado";
export function casa(restricao: Restricao, valor: ValorIfc): Casamento;
export function iguaisComTolerancia(a: number, b: number): boolean;
export function padraoXsdParaRegExp(padrao: string): RegExp | null; // null = recurso de XSD sem equivalente
```

- [ ] **Step 1: Testes**

```ts
// src/modules/coordenacao/ids/restricoes.test.ts
import { describe, expect, it } from "vitest";
import { casa, iguaisComTolerancia, padraoXsdParaRegExp } from "@/modules/coordenacao/ids/restricoes";

const simples = (valor: string) => ({ tipo: "simples" as const, valor });
const r = (extra: object, base = "string") => ({ tipo: "restricao" as const, base, ...extra });

describe("casa", () => {
  it("texto exato, sensível a maiúsculas", () => {
    expect(casa(simples("Parede"), "Parede")).toBe("sim");
    expect(casa(simples("Parede"), "parede")).toBe("nao");
  });
  it("número do simpleValue compara como número, com a tolerância do IDS", () => {
    expect(casa(simples("3"), 3.0000001)).toBe("sim");
    expect(casa(simples("3"), 3.1)).toBe("nao");
    expect(casa(simples("3"), "3")).toBe("sim");
  });
  it("booleano: TRUE/FALSE e true/false", () => {
    expect(casa(simples("TRUE"), true)).toBe("sim");
    expect(casa(simples("false"), false)).toBe("sim");
    expect(casa(simples("TRUE"), false)).toBe("nao");
  });
  it("enumeração", () => {
    expect(casa(r({ enumeracao: ["60", "90"] }), "90")).toBe("sim");
    expect(casa(r({ enumeracao: ["60", "90"] }), "30")).toBe("nao");
  });
  it("faixa numérica inclusiva e exclusiva", () => {
    const faixa = r({ minExclusive: "2", maxInclusive: "5" }, "double");
    expect(casa(faixa, 5)).toBe("sim");
    expect(casa(faixa, 2)).toBe("nao");
    expect(casa(faixa, "abc")).toBe("nao");
  });
  it("tamanho", () => {
    expect(casa(r({ length: 3 }), "ABC")).toBe("sim");
    expect(casa(r({ minLength: 2, maxLength: 3 }), "ABCD")).toBe("nao");
  });
  it("padrão ancorado no valor inteiro", () => {
    expect(casa(r({ padroes: ["DT[0-9]{2}"] }), "DT01")).toBe("sim");
    expect(casa(r({ padroes: ["DT[0-9]{2}"] }), "XDT01")).toBe("nao");
  });
  it("padrão com recurso XSD sem equivalente → não suportado", () => {
    expect(casa(r({ padroes: ["\\i\\c*"] }), "abc")).toBe("nao_suportado");
  });
});

describe("iguaisComTolerancia", () => {
  it("faixa relativa 1e-6 + absoluta 1e-6", () => {
    expect(iguaisComTolerancia(1000, 1000.0009)).toBe(true);
    expect(iguaisComTolerancia(1000, 1000.002)).toBe(false);
    expect(iguaisComTolerancia(0, 0.0000009)).toBe(true);
  });
});

describe("padraoXsdParaRegExp", () => {
  it("ancora e mantém classes comuns", () => {
    expect(padraoXsdParaRegExp("A.*")?.test("ABC")).toBe(true);
    expect(padraoXsdParaRegExp("A.*")?.test("BA")).toBe(false);
  });
  it("\\i, \\c e blocos \\p{Is…} não têm equivalente", () => {
    expect(padraoXsdParaRegExp("\\i")).toBeNull();
    expect(padraoXsdParaRegExp("\\p{IsBasicLatin}+")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/ids/restricoes.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/modules/coordenacao/ids/restricoes.ts
/**
 * Casar um valor lido do IFC com um simpleValue ou xs:restriction do IDS (PURO). Regras do IDS 1.0:
 * texto sensível a maiúsculas; número com a tolerância 1e-6 relativa + 1e-6 absoluta; padrão XSD
 * ancorado no valor inteiro. Recurso de XSD sem equivalente em JS devolve "nao_suportado" — o
 * requisito vira "não verificado", nunca aprovado nem reprovado por engano.
 */
import type { Restricao } from "./tipos";

export type ValorIfc = string | number | boolean;
export type Casamento = "sim" | "nao" | "nao_suportado";

export function iguaisComTolerancia(esperado: number, obtido: number): boolean {
  const a = esperado * (1 - 1e-6) - 1e-6;
  const b = esperado * (1 + 1e-6) + 1e-6;
  return obtido > Math.min(a, b) && obtido < Math.max(a, b);
}

/** XSD → RegExp ancorada. null quando o padrão usa \i, \c, \I, \C ou blocos \p{Is…}. */
export function padraoXsdParaRegExp(padrao: string): RegExp | null {
  if (/\\[iIcC]|\\[pP]\{Is/.test(padrao)) return null;
  try {
    return new RegExp(`^(?:${padrao})$`, "u");
  } catch {
    return null;
  }
}

function comoNumero(v: ValorIfc): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function comoBooleano(v: ValorIfc | string): boolean | null {
  if (typeof v === "boolean") return v;
  const t = String(v).trim().toLowerCase();
  if (t === "true" || t === "1") return true;
  if (t === "false" || t === "0") return false;
  return null;
}

function casaSimples(esperado: string, valor: ValorIfc): boolean {
  if (typeof valor === "boolean") return comoBooleano(esperado) === valor;
  if (typeof valor === "number") {
    const n = comoNumero(esperado);
    return n !== null && iguaisComTolerancia(n, valor);
  }
  return esperado === valor;
}

export function casa(restricao: Restricao, valor: ValorIfc): Casamento {
  if (restricao.tipo === "simples") return casaSimples(restricao.valor, valor) ? "sim" : "nao";
  const r = restricao;
  if (r.enumeracao && !r.enumeracao.some((e) => casaSimples(e, valor))) return "nao";
  if (r.padroes) {
    for (const p of r.padroes) {
      const re = padraoXsdParaRegExp(p);
      if (!re) return "nao_suportado";
      if (!re.test(String(valor))) return "nao";
    }
  }
  const texto = String(valor);
  if (r.length !== undefined && [...texto].length !== r.length) return "nao";
  if (r.minLength !== undefined && [...texto].length < r.minLength) return "nao";
  if (r.maxLength !== undefined && [...texto].length > r.maxLength) return "nao";
  const temFaixa = r.minInclusive ?? r.maxInclusive ?? r.minExclusive ?? r.maxExclusive;
  if (temFaixa !== undefined) {
    const n = comoNumero(valor);
    if (n === null) return "nao";
    if (r.minInclusive !== undefined && !(n >= Number(r.minInclusive) || iguaisComTolerancia(Number(r.minInclusive), n))) return "nao";
    if (r.maxInclusive !== undefined && !(n <= Number(r.maxInclusive) || iguaisComTolerancia(Number(r.maxInclusive), n))) return "nao";
    if (r.minExclusive !== undefined && !(n > Number(r.minExclusive)) ) return "nao";
    if (r.maxExclusive !== undefined && !(n < Number(r.maxExclusive))) return "nao";
  }
  return "sim";
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/modules/coordenacao/ids/restricoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/ids/restricoes.ts src/modules/coordenacao/ids/restricoes.test.ts
git commit -m "feat(coordenacao): restrições do IDS — enumeração, padrão XSD, faixa, tamanho e tolerância"
```

---

### Task 4: Avaliação pura contra `AcessoModelo`

**Files:**
- Create: `src/modules/coordenacao/ids/acesso.ts` (só a interface)
- Create: `src/modules/coordenacao/ids/avaliar.ts`
- Test: `src/modules/coordenacao/ids/avaliar.test.ts` (com um `AcessoModelo` em memória)

**Interfaces:**
- Consumes: `DocumentoIds`, `Faceta`, `Especificacao` (Task 2); `casa`, `ValorIfc` (Task 3).
- Produces:

```ts
// acesso.ts
export type SchemaIfc = "IFC2X3" | "IFC4" | "IFC4X3_ADD2";
export type PropriedadeIfc = { pset: string; nome: string; tipoDado: string | null; valores: ValorIfc[]; vazia: boolean };
export type ClassificacaoIfc = { sistema: string | null; codigos: string[] }; // códigos da referência e dos pais
export interface AcessoModelo {
  schema: SchemaIfc;
  /** Todas as instâncias de IfcRoot (expressID). */
  instancias(): number[];
  classe(id: number): string; // MAIÚSCULAS, ex. "IFCWALL"
  tipoPredefinido(id: number): string | null; // regra do manual (tipo → USERDEFINED → ElementType/ObjectType)
  /** undefined = o atributo não existe na classe; null = existe e está vazio. */
  atributo(id: number, nome: string): ValorIfc | null | undefined;
  guid(id: number): string | null;
  nome(id: number): string | null;
  propriedades(id: number): PropriedadeIfc[]; // ocorrência por cima do tipo; valores de medida já em SI; valor sem conversão conhecida → tipoDado "__SEM_SI__"
  classificacoes(id: number): ClassificacaoIfc[];
  materiais(id: number): string[]; // Name e Category de cada material associado (camadas, perfis, constituintes)
  /** Pais pela relação (IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELNESTS, IFCRELVOIDSELEMENT, IFCRELFILLSELEMENT, IFCRELASSIGNSTOGROUP); sem relação = todas. Transitivo. */
  pais(id: number, relacao?: string): number[];
}

// avaliar.ts
export type EstadoRequisito = "aprovado" | "reprovado" | "nao_verificado" | "nao_se_aplica";
export type FalhaElemento = { id: number; guid: string | null; classe: string; nome: string | null; motivo: string };
export type ResultadoEspecificacao = {
  indice: number;
  nome: string;
  descricao: string | null;
  estado: EstadoRequisito;
  aplicaveis: number;
  aprovados: number;
  reprovados: number;
  naoVerificados: number;
  falhas: FalhaElemento[]; // TODAS — o corte em 500 é do relatorio.ts
  motivoGeral: string | null; // ex.: "Nenhum elemento aplicável — a especificação é obrigatória."
};
export function avaliarIds(ids: DocumentoIds, modelo: AcessoModelo): ResultadoEspecificacao[];
```

- [ ] **Step 1: Testes com modelo em memória**

```ts
// src/modules/coordenacao/ids/avaliar.test.ts
import { describe, expect, it } from "vitest";
import { avaliarIds } from "@/modules/coordenacao/ids/avaliar";
import type { AcessoModelo, PropriedadeIfc } from "@/modules/coordenacao/ids/acesso";
import type { DocumentoIds } from "@/modules/coordenacao/ids/tipos";

type Fake = { classe: string; nome?: string; props?: PropriedadeIfc[]; tipo?: string };
function modelo(itens: Record<number, Fake>, schema: AcessoModelo["schema"] = "IFC4"): AcessoModelo {
  return {
    schema,
    instancias: () => Object.keys(itens).map(Number),
    classe: (id) => itens[id].classe,
    tipoPredefinido: (id) => itens[id].tipo ?? null,
    atributo: (id, n) => (n === "Name" ? itens[id].nome ?? null : undefined),
    guid: (id) => `G${id}`,
    nome: (id) => itens[id].nome ?? null,
    propriedades: (id) => itens[id].props ?? [],
    classificacoes: () => [],
    materiais: () => [],
    pais: () => [],
  };
}
const s = (valor: string) => ({ tipo: "simples" as const, valor });
const paredesComFogo = (ocorrencia: "required" | "optional" | "prohibited" = "required"): DocumentoIds => ({
  titulo: "t",
  especificacoes: [
    {
      nome: "Paredes com FireRating",
      versoesIfc: ["IFC4"],
      ocorrencia,
      aplicabilidade: [{ tipo: "entity", nome: s("IFCWALL") }],
      requisitos: [{ tipo: "property", propertySet: s("Pset_WallCommon"), baseName: s("FireRating"), cardinalidade: "required" }],
    },
  ],
});
const fogo = (v: string): PropriedadeIfc => ({ pset: "Pset_WallCommon", nome: "FireRating", tipoDado: "IFCLABEL", valores: [v], vazia: false });

describe("avaliarIds", () => {
  it("aprova quando todo aplicável cumpre; ignora o que não se aplica", () => {
    const [r] = avaliarIds(paredesComFogo(), modelo({ 1: { classe: "IFCWALL", props: [fogo("60")] }, 2: { classe: "IFCSLAB" } }));
    expect(r).toMatchObject({ estado: "aprovado", aplicaveis: 1, aprovados: 1, reprovados: 0 });
  });

  it("reprova e diz o motivo por elemento", () => {
    const [r] = avaliarIds(paredesComFogo(), modelo({ 1: { classe: "IFCWALL", nome: "P1" } }));
    expect(r.estado).toBe("reprovado");
    expect(r.falhas[0]).toMatchObject({ guid: "G1", classe: "IFCWALL", nome: "P1", motivo: expect.stringContaining("FireRating") });
  });

  it("obrigatória sem nenhum aplicável reprova; opcional aprova; proibida com aplicável reprova", () => {
    const vazio = modelo({ 2: { classe: "IFCSLAB" } });
    expect(avaliarIds(paredesComFogo("required"), vazio)[0].estado).toBe("reprovado");
    expect(avaliarIds(paredesComFogo("optional"), vazio)[0].estado).toBe("aprovado");
    const comParede = modelo({ 1: { classe: "IFCWALL", props: [fogo("60")] } });
    expect(avaliarIds(paredesComFogo("prohibited"), comParede)[0].estado).toBe("reprovado");
  });

  it("versão de IFC diferente da especificação: não se aplica", () => {
    const [r] = avaliarIds(paredesComFogo(), modelo({ 1: { classe: "IFCWALL" } }, "IFC2X3"));
    expect(r.estado).toBe("nao_se_aplica");
  });

  it("requisito com padrão sem equivalente: não verificado, não reprovado", () => {
    const ids = paredesComFogo();
    ids.especificacoes[0].requisitos = [
      { tipo: "attribute", nome: s("Name"), valor: { tipo: "restricao", base: "string", padroes: ["\\i\\c*"] }, cardinalidade: "required" },
    ];
    const [r] = avaliarIds(ids, modelo({ 1: { classe: "IFCWALL", nome: "P1" } }));
    expect(r).toMatchObject({ estado: "nao_verificado", naoVerificados: 1, reprovados: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/coordenacao/ids/avaliar.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `acesso.ts` (bloco de Interfaces) e `avaliar.ts`**

```ts
// src/modules/coordenacao/ids/avaliar.ts
/**
 * Avaliação PURA de um DocumentoIds contra um AcessoModelo. Para cada especificação: filtra os
 * elementos em que TODAS as facetas da aplicabilidade casam, confere cada requisito com a
 * cardinalidade dele e soma por elemento. Um elemento é "não verificado" se nenhum requisito
 * reprovou e pelo menos um não pôde ser conferido (restrição sem equivalente, unidade fora do SI,
 * faceta ainda não implementada).
 */
import { casa, type Casamento } from "./restricoes";
import type { AcessoModelo } from "./acesso";
import type { DocumentoIds, Especificacao, Faceta, FacetaEntidade, Restricao } from "./tipos";

export type EstadoRequisito = "aprovado" | "reprovado" | "nao_verificado" | "nao_se_aplica";
export type FalhaElemento = { id: number; guid: string | null; classe: string; nome: string | null; motivo: string };
export type ResultadoEspecificacao = {
  indice: number;
  nome: string;
  descricao: string | null;
  estado: EstadoRequisito;
  aplicaveis: number;
  aprovados: number;
  reprovados: number;
  naoVerificados: number;
  falhas: FalhaElemento[];
  motivoGeral: string | null;
};

/** Resultado de uma faceta num elemento: casa, não casa (com motivo) ou não dá para saber. */
type Veredito = { r: "sim" } | { r: "nao"; motivo: string } | { r: "nao_suportado"; motivo: string };

const SIM: Veredito = { r: "sim" };

function rotulo(x: Restricao): string {
  if (x.tipo === "simples") return `"${x.valor}"`;
  if (x.enumeracao) return `um de [${x.enumeracao.join(", ")}]`;
  if (x.padroes) return `no padrão ${x.padroes.join(" | ")}`;
  return "dentro da restrição";
}

function casaTexto(x: Restricao, v: string | null | undefined): Casamento {
  return v === null || v === undefined ? "nao" : casa(x, v);
}

/** A versão do IFC do arquivo está entre as da especificação? IFC4X3 aceita "IFC4X3_ADD2". */
function versaoAtende(spec: Especificacao, schema: AcessoModelo["schema"]): boolean {
  return spec.versoesIfc.includes(schema);
}

function entidade(f: FacetaEntidade, m: AcessoModelo, id: number): Veredito {
  const classe = m.classe(id);
  if (casa(f.nome, classe) !== "sim") return { r: "nao", motivo: `classe ${classe}, esperado ${rotulo(f.nome)}` };
  if (f.tipoPredefinido) {
    const tipo = m.tipoPredefinido(id);
    const c = casaTexto(f.tipoPredefinido, tipo);
    if (c === "nao_suportado") return { r: "nao_suportado", motivo: "tipo predefinido com padrão não suportado" };
    if (c === "nao") return { r: "nao", motivo: `tipo predefinido ${tipo ?? "vazio"}, esperado ${rotulo(f.tipoPredefinido)}` };
  }
  return SIM;
}

/** Aplica a cardinalidade a uma faceta com "achou / casou". */
function porCardinalidade(
  card: "required" | "optional" | "prohibited",
  existe: boolean,
  casou: Casamento,
  descricao: string,
): Veredito {
  if (casou === "nao_suportado") return { r: "nao_suportado", motivo: `${descricao}: restrição não suportada` };
  if (card === "prohibited") return existe && casou === "sim" ? { r: "nao", motivo: `${descricao} não pode existir` } : SIM;
  if (!existe) return card === "optional" ? SIM : { r: "nao", motivo: `${descricao} ausente` };
  return casou === "sim" ? SIM : { r: "nao", motivo: `${descricao} com valor fora do exigido` };
}

function faceta(f: Faceta, m: AcessoModelo, id: number): Veredito {
  switch (f.tipo) {
    case "entity":
      return entidade(f, m, id);
    case "attribute": {
      if (f.nome.tipo !== "simples") return { r: "nao_suportado", motivo: "nome de atributo por restrição" };
      const v = m.atributo(id, f.nome.valor);
      const existe = v !== undefined && v !== null && v !== "";
      const casou: Casamento = !existe ? "nao" : f.valor ? casa(f.valor, v as string | number | boolean) : "sim";
      return porCardinalidade(f.cardinalidade, existe, casou, `atributo ${f.nome.valor}`);
    }
    case "property": {
      const props = m.propriedades(id).filter((p) => casa(f.propertySet, p.pset) === "sim" && casa(f.baseName, p.nome) === "sim");
      const descricao = `${rotulo(f.propertySet)}.${rotulo(f.baseName)}`;
      const preenchidas = props.filter((p) => !p.vazia);
      if (preenchidas.some((p) => p.tipoDado === "__SEM_SI__") && f.valor) return { r: "nao_suportado", motivo: `${descricao}: unidade sem conversão para SI` };
      const doTipo = f.dataType ? preenchidas.filter((p) => p.tipoDado === f.dataType) : preenchidas;
      const casou: Casamento = doTipo.length === 0 ? "nao" : !f.valor ? "sim" : doTipo.some((p) => p.valores.some((v) => casa(f.valor!, v) === "sim")) ? "sim" : doTipo.some((p) => p.valores.some((v) => casa(f.valor!, v) === "nao_suportado")) ? "nao_suportado" : "nao";
      return porCardinalidade(f.cardinalidade, preenchidas.length > 0, casou, descricao);
    }
    case "classification": {
      const cls = m.classificacoes(id).filter((c) => !f.sistema || casaTexto(f.sistema, c.sistema) === "sim");
      const casou: Casamento = cls.length === 0 ? "nao" : !f.valor ? "sim" : cls.some((c) => c.codigos.some((cod) => casa(f.valor!, cod) === "sim")) ? "sim" : "nao";
      return porCardinalidade(f.cardinalidade, cls.length > 0, casou, `classificação ${f.sistema ? rotulo(f.sistema) : ""}`.trim());
    }
    case "material":
    case "partOf":
      // Etapa 5 (Task 12) — até lá, sempre "não verificado".
      return { r: "nao_suportado", motivo: `faceta ${f.tipo} ainda não verificada` };
  }
}

export function avaliarIds(ids: DocumentoIds, m: AcessoModelo): ResultadoEspecificacao[] {
  const instancias = m.instancias();
  return ids.especificacoes.map((spec, indice): ResultadoEspecificacao => {
    const base = { indice, nome: spec.nome, descricao: spec.descricao ?? null };
    if (!versaoAtende(spec, m.schema)) {
      return { ...base, estado: "nao_se_aplica", aplicaveis: 0, aprovados: 0, reprovados: 0, naoVerificados: 0, falhas: [], motivoGeral: `Especificação para ${spec.versoesIfc.join(", ")}; o arquivo é ${m.schema}.` };
    }
    const aplicaveis = instancias.filter((id) => spec.aplicabilidade.every((f) => faceta(f, m, id).r === "sim"));
    if (spec.ocorrencia === "prohibited") {
      const falhas = aplicaveis.map((id) => ({ id, guid: m.guid(id), classe: m.classe(id), nome: m.nome(id), motivo: "Elemento proibido pela especificação" }));
      return { ...base, estado: falhas.length ? "reprovado" : "aprovado", aplicaveis: aplicaveis.length, aprovados: 0, reprovados: falhas.length, naoVerificados: 0, falhas, motivoGeral: null };
    }
    let aprovados = 0;
    let naoVerificados = 0;
    const falhas: ResultadoEspecificacao["falhas"] = [];
    for (const id of aplicaveis) {
      const vereditos = spec.requisitos.map((f) => faceta(f, m, id));
      const reprovado = vereditos.find((v) => v.r === "nao");
      if (reprovado && reprovado.r === "nao") {
        falhas.push({ id, guid: m.guid(id), classe: m.classe(id), nome: m.nome(id), motivo: reprovado.motivo });
      } else if (vereditos.some((v) => v.r === "nao_suportado")) naoVerificados++;
      else aprovados++;
    }
    const semAplicavel = spec.ocorrencia === "required" && aplicaveis.length === 0;
    const estado: EstadoRequisito = falhas.length > 0 || semAplicavel ? "reprovado" : naoVerificados > 0 ? "nao_verificado" : "aprovado";
    return {
      ...base,
      estado,
      aplicaveis: aplicaveis.length,
      aprovados,
      reprovados: falhas.length,
      naoVerificados,
      falhas,
      motivoGeral: semAplicavel ? "Nenhum elemento aplicável — a especificação exige pelo menos um." : null,
    };
  });
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/modules/coordenacao/ids/avaliar.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/ids/acesso.ts src/modules/coordenacao/ids/avaliar.ts src/modules/coordenacao/ids/avaliar.test.ts
git commit -m "feat(coordenacao): avaliação pura de IDS — aplicabilidade, cardinalidade e ocorrência"
```

---

### Task 5: Adaptador web-ifc (entidade e atributo) + conformidade

**Files:**
- Create: `src/modules/coordenacao/ids/acesso-web-ifc.ts` (NÃO puro: importa web-ifc; usado pelo processo separado e pelo teste)
- Create: `src/modules/coordenacao/ids/conformidade.test.ts`
- Create: `src/modules/coordenacao/ids/mapa-ifc2x3.ts` (tabela do manual "ifc2x3-occurrence-type-mapping-table": ocorrência IFC4 → `{ ocorrencia2x3, tipo2x3 }`, ex. `IFCAIRTERMINAL: { ocorrencia: "IFCFLOWTERMINAL", tipo: "IFCAIRTERMINALTYPE" }`)

**Interfaces:**
- Consumes: `AcessoModelo` (Task 4), `lerIds`, `avaliarIds`.
- Produces: `abrirModeloWebIfc(bytes: Uint8Array): Promise<{ modelo: AcessoModelo; fechar(): void }>`; teste `conformidade.test.ts` que roda as pastas listadas em `PASTAS_ATIVAS`.

- [ ] **Step 1: Harness de conformidade (falha antes do adaptador)**

```ts
// src/modules/coordenacao/ids/conformidade.test.ts
/**
 * Casos oficiais do IDS (buildingSMART). Rode `npm run ids:baixar-casos` antes; sem a pasta, o teste
 * avisa e pula. Prefixo do arquivo: pass = aprovado; fail = reprovado; invalid = IDS recusado no
 * envio OU reprovado. Uma pasta entra em PASTAS_ATIVAS quando a etapa dela fica pronta (D7).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lerIds } from "./leitor";
import { avaliarIds } from "./avaliar";
import { abrirModeloWebIfc } from "./acesso-web-ifc";

const RAIZ = path.resolve("test-data/ids-casos");
const PASTAS_ATIVAS = ["entity", "attribute"]; // Task 6 acrescenta property, restriction, tolerance; Task 7 classification; Task 12 material, partof

const existe = fs.existsSync(RAIZ);
if (!existe) console.warn("[ids] test-data/ids-casos ausente — rode npm run ids:baixar-casos para a conformidade.");

describe.skipIf(!existe)("conformidade IDS (casos oficiais)", () => {
  for (const pasta of PASTAS_ATIVAS) {
    const dir = path.join(RAIZ, pasta);
    const casos = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".ids")) : [];
    describe(pasta, () => {
      for (const arq of casos) {
        it(arq, async () => {
          const esperado = arq.split("-")[0] as "pass" | "fail" | "invalid";
          const leitura = lerIds(fs.readFileSync(path.join(dir, arq), "utf8"));
          if (!leitura.ok) {
            expect(esperado, leitura.motivo).toBe("invalid");
            return;
          }
          const ifc = new Uint8Array(fs.readFileSync(path.join(dir, arq.replace(/\.ids$/, ".ifc"))));
          const { modelo, fechar } = await abrirModeloWebIfc(ifc);
          try {
            const r = avaliarIds(leitura.ids, modelo);
            const reprovou = r.some((e) => e.estado === "reprovado");
            const naoVerificou = r.some((e) => e.estado === "nao_verificado");
            expect(naoVerificou, "faceta ainda não suportada nesta pasta").toBe(false);
            expect(reprovou ? "fail" : "pass").toBe(esperado === "invalid" ? "fail" : esperado);
          } finally {
            fechar();
          }
        });
      }
    });
  }
});
```

Run: `npx vitest run src/modules/coordenacao/ids/conformidade.test.ts`
Expected: FAIL — `acesso-web-ifc` não existe.

- [ ] **Step 2: Implementar `acesso-web-ifc.ts` (entidade, atributo, guid, nome, tipo predefinido, instâncias de IfcRoot; o resto devolve vazio por ora)**

```ts
// src/modules/coordenacao/ids/acesso-web-ifc.ts
/**
 * AcessoModelo sobre o web-ifc (abre o IFC inteiro na memória). Monta índices das relações UMA vez
 * por arquivo; cada pergunta do avaliador é uma consulta em mapa. Usado pelo processo separado
 * scripts/verificar-ids.ts e pelo teste de conformidade — nunca dentro do servidor Next.
 */
import path from "node:path";
import * as WebIFC from "web-ifc";
import type { AcessoModelo, ClassificacaoIfc, PropriedadeIfc, SchemaIfc } from "./acesso";
import type { ValorIfc } from "./restricoes";
import { MAPA_IFC2X3 } from "./mapa-ifc2x3";

type Linha = Record<string, unknown> & { expressID: number; type: number };

function valorDe(x: unknown): ValorIfc | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "object" && x !== null && "value" in x) return valorDe((x as { value: unknown }).value);
  if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") return x;
  return null;
}

export async function abrirModeloWebIfc(bytes: Uint8Array): Promise<{ modelo: AcessoModelo; fechar(): void }> {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(path.resolve("node_modules/web-ifc/") + path.sep, true);
  await api.Init();
  const id = api.OpenModel(bytes);
  const schemaBruto = api.GetModelSchema(id).toUpperCase();
  const schema: SchemaIfc = schemaBruto.startsWith("IFC2X3") ? "IFC2X3" : schemaBruto.startsWith("IFC4X3") ? "IFC4X3_ADD2" : "IFC4";
  const cache = new Map<number, Linha>();
  const linha = (eid: number): Linha => {
    let l = cache.get(eid);
    if (!l) {
      l = api.GetLine(id, eid, false) as Linha;
      cache.set(eid, l);
    }
    return l;
  };
  const nomeDaClasse = (eid: number) => api.GetNameFromTypeCode(linha(eid).type).toUpperCase();

  // Instâncias de IfcRoot = tudo que tem GlobalId.
  const todas: number[] = [];
  const ids = api.GetAllLines(id);
  for (let i = 0; i < ids.size(); i++) todas.push(ids.get(i));
  const raizes = todas.filter((eid) => "GlobalId" in linha(eid));

  // Índices: tipo de cada ocorrência (IfcRelDefinesByType).
  const tipoDe = new Map<number, number>();
  for (const rel of todas.filter((eid) => nomeDaClasse(eid) === "IFCRELDEFINESBYTYPE")) {
    const l = linha(rel);
    const tipo = (l.RelatingType as { value: number }).value;
    for (const o of (l.RelatedObjects as { value: number }[]) ?? []) tipoDe.set(o.value, tipo);
  }

  const atributo = (eid: number, nome: string): ValorIfc | null | undefined => {
    const l = linha(eid);
    if (!(nome in l)) return undefined;
    const v = l[nome];
    if (Array.isArray(v)) return null; // atributos lista não são comparáveis no IDS 1.0
    return valorDe(v);
  };

  const tipoPredefinido = (eid: number): string | null => {
    const tipo = tipoDe.get(eid);
    if (tipo !== undefined) {
      const pt = atributo(tipo, "PredefinedType");
      if (pt === "USERDEFINED") return (atributo(tipo, "ElementType") as string | null) ?? "USERDEFINED";
      if (typeof pt === "string" && pt !== "NOTDEFINED") return pt;
    }
    const pt = atributo(eid, "PredefinedType");
    if (pt === "USERDEFINED") return (atributo(eid, "ObjectType") as string | null) ?? "USERDEFINED";
    return typeof pt === "string" ? pt : null;
  };

  // IFC2X3: ocorrência genérica (IFCFLOWTERMINAL) + tipo (IFCAIRTERMINALTYPE) → classe IFC4 (IFCAIRTERMINAL).
  const classe = (eid: number): string => {
    const c = nomeDaClasse(eid);
    if (schema !== "IFC2X3") return c;
    const tipo = tipoDe.get(eid);
    if (tipo === undefined) return c;
    const t = nomeDaClasse(tipo);
    for (const [ifc4, par] of Object.entries(MAPA_IFC2X3)) if (par.ocorrencia === c && par.tipo === t) return ifc4;
    return c;
  };

  const modelo: AcessoModelo = {
    schema,
    instancias: () => raizes,
    classe,
    tipoPredefinido,
    atributo,
    guid: (eid) => (atributo(eid, "GlobalId") as string | null) ?? null,
    nome: (eid) => (atributo(eid, "Name") as string | null) ?? null,
    propriedades: (): PropriedadeIfc[] => [], // Task 6
    classificacoes: (): ClassificacaoIfc[] => [], // Task 7
    materiais: () => [], // Task 12
    pais: () => [], // Task 12
  };
  return { modelo, fechar: () => api.CloseModel(id) };
}
```

`mapa-ifc2x3.ts`: copiar à mão os pares da tabela `Documentation/ImplementersDocumentation/ifc2x3-occurrence-type-mapping-table.md` (baixar com `gh api repos/buildingSMART/IDS/contents/Documentation/ImplementersDocumentation/ifc2x3-occurrence-type-mapping-table.md --jq .content | base64 -d`). São fatos da norma (nome da classe ↔ nome da classe), não texto do documento.

```ts
// src/modules/coordenacao/ids/mapa-ifc2x3.ts
/** IFC4 → par ocorrência/tipo do IFC2X3 (tabela de mapeamento do IDS 1.0). Ex.: IFCAIRTERMINAL ← IFCFLOWTERMINAL + IFCAIRTERMINALTYPE. */
export const MAPA_IFC2X3: Readonly<Record<string, { ocorrencia: string; tipo: string }>> = {
  IFCAIRTERMINAL: { ocorrencia: "IFCFLOWTERMINAL", tipo: "IFCAIRTERMINALTYPE" },
  // … demais linhas da tabela, uma por classe IFC4
};
```

- [ ] **Step 3: Rodar a conformidade de entity e attribute e corrigir até passar**

Run: `npm run ids:baixar-casos && npx vitest run src/modules/coordenacao/ids/conformidade.test.ts`
Expected: PASS em todos os casos de `entity` e `attribute`. Se um caso falhar, ler o .ids/.ifc do caso e corrigir `acesso-web-ifc.ts`/`avaliar.ts` — o caso oficial é a regra. Casos que dependem de propriedade/classificação dentro dessas pastas, se houver, entram quando a Task 6/7 ativar a faceta (anotar o nome no `it.skip` com o motivo, nunca apagar).

- [ ] **Step 4: Commit**

```bash
git add src/modules/coordenacao/ids/acesso-web-ifc.ts src/modules/coordenacao/ids/mapa-ifc2x3.ts src/modules/coordenacao/ids/conformidade.test.ts
git commit -m "feat(coordenacao): adaptador web-ifc do IDS — entidade e atributo, conformes aos casos oficiais"
```

---

### Task 6: Propriedades (Psets, quantidades, herança do tipo, SI)

**Files:**
- Modify: `src/modules/coordenacao/ids/acesso-web-ifc.ts` (implementar `propriedades`)
- Create: `src/modules/coordenacao/ids/unidades.ts` (puro) + `unidades.test.ts`
- Modify: `src/modules/coordenacao/ids/conformidade.test.ts` (`PASTAS_ATIVAS` += `"property", "restriction", "tolerance"`)

**Interfaces:**
- Produces (`unidades.ts`): `fatorSi(prefixo: string | null): number`; `paraSi(valor: number, tipoDado: string, unidades: UnidadesDoArquivo): number | null` (null = sem conversão conhecida); `type UnidadesDoArquivo = Partial<Record<"LENGTHUNIT" | "AREAUNIT" | "VOLUMEUNIT" | "MASSUNIT" | "TIMEUNIT" | "PLANEANGLEUNIT", { prefixo: string | null; si: boolean }>>`; mapa `UNIDADE_DO_TIPO` (IFCLENGTHMEASURE→LENGTHUNIT, IFCPOSITIVELENGTHMEASURE→LENGTHUNIT, IFCAREAMEASURE→AREAUNIT, IFCVOLUMEMEASURE→VOLUMEUNIT, IFCMASSMEASURE→MASSUNIT, IFCTIMEMEASURE→TIMEUNIT, IFCPLANEANGLEMEASURE→PLANEANGLEUNIT).

- [ ] **Step 1: Testes de unidades**

```ts
// src/modules/coordenacao/ids/unidades.test.ts
import { describe, expect, it } from "vitest";
import { paraSi } from "@/modules/coordenacao/ids/unidades";

describe("paraSi", () => {
  it("mm → m, mm² → m², mm³ → m³", () => {
    const u = { LENGTHUNIT: { prefixo: "MILLI", si: true }, AREAUNIT: { prefixo: "MILLI", si: true }, VOLUMEUNIT: { prefixo: "MILLI", si: true } };
    expect(paraSi(3000, "IFCLENGTHMEASURE", u)).toBeCloseTo(3, 9);
    expect(paraSi(2_000_000, "IFCAREAMEASURE", u)).toBeCloseTo(2, 9);
    expect(paraSi(1e9, "IFCVOLUMEMEASURE", u)).toBeCloseTo(1, 9);
  });
  it("tipo sem unidade (texto, contagem) passa direto", () => {
    expect(paraSi(7, "IFCCOUNTMEASURE", {})).toBe(7);
  });
  it("unidade fora do SI (pé) → null", () => {
    expect(paraSi(10, "IFCLENGTHMEASURE", { LENGTHUNIT: { prefixo: null, si: false } })).toBeNull();
  });
  it("ângulo em grau (unidade de conversão) → null nesta versão; radiano passa", () => {
    expect(paraSi(1, "IFCPLANEANGLEMEASURE", { PLANEANGLEUNIT: { prefixo: null, si: true } })).toBe(1);
  });
});
```

Run: `npx vitest run src/modules/coordenacao/ids/unidades.test.ts` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar `unidades.ts`**

```ts
// src/modules/coordenacao/ids/unidades.ts
/** Conversão PURA de valores do IFC para SI (o IDS 1.0 escreve medidas em SI). Só prefixos SI. */
const PREFIXO: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
export type UnidadesDoArquivo = Partial<Record<"LENGTHUNIT" | "AREAUNIT" | "VOLUMEUNIT" | "MASSUNIT" | "TIMEUNIT" | "PLANEANGLEUNIT", { prefixo: string | null; si: boolean }>>;
export const UNIDADE_DO_TIPO: Readonly<Record<string, { unidade: keyof UnidadesDoArquivo; expoente: number }>> = {
  IFCLENGTHMEASURE: { unidade: "LENGTHUNIT", expoente: 1 },
  IFCPOSITIVELENGTHMEASURE: { unidade: "LENGTHUNIT", expoente: 1 },
  IFCNONNEGATIVELENGTHMEASURE: { unidade: "LENGTHUNIT", expoente: 1 },
  IFCAREAMEASURE: { unidade: "AREAUNIT", expoente: 2 },
  IFCVOLUMEMEASURE: { unidade: "VOLUMEUNIT", expoente: 3 },
  IFCMASSMEASURE: { unidade: "MASSUNIT", expoente: 1 },
  IFCTIMEMEASURE: { unidade: "TIMEUNIT", expoente: 1 },
  IFCPLANEANGLEMEASURE: { unidade: "PLANEANGLEUNIT", expoente: 1 },
  IFCPOSITIVEPLANEANGLEMEASURE: { unidade: "PLANEANGLEUNIT", expoente: 1 },
};

export function fatorSi(prefixo: string | null): number {
  return prefixo ? PREFIXO[prefixo.toUpperCase()] ?? 1 : 1;
}

export function paraSi(valor: number, tipoDado: string, unidades: UnidadesDoArquivo): number | null {
  const regra = UNIDADE_DO_TIPO[tipoDado.toUpperCase()];
  if (!regra) return valor;
  const u = unidades[regra.unidade];
  if (!u) return valor; // arquivo sem unidade declarada: o IFC manda tratar como SI
  if (!u.si) return null;
  // Área/volume declarados com o prefixo do metro (mm², mm³): o fator do prefixo vai elevado ao expoente.
  // MASSUNIT em GRAM: SI é o quilograma — prefixo KILO = fator 1.
  if (regra.unidade === "MASSUNIT") return valor * fatorSi(u.prefixo) * 1e-3;
  return valor * fatorSi(u.prefixo) ** regra.expoente;
}
```

Run: `npx vitest run src/modules/coordenacao/ids/unidades.test.ts` → PASS.

- [ ] **Step 3: Implementar `propriedades` no adaptador**

Regras (manual do IDS, property facet + casos oficiais):
1. Índice `psetsDe: Map<id, number[]>` a partir de `IFCRELDEFINESBYPROPERTIES` (`RelatedObjects` → `RelatingPropertyDefinition`); tipos levam psets em `HasPropertySets` do próprio tipo.
2. Para uma ocorrência: psets do **tipo** primeiro, depois os da **ocorrência**; mesmo par (pset, nome) na ocorrência substitui o do tipo.
3. `IFCPROPERTYSET.HasProperties` → `IFCPROPERTYSINGLEVALUE` (NominalValue), `IFCPROPERTYENUMERATEDVALUE` (EnumerationValues, vários), `IFCPROPERTYLISTVALUE` (ListValues), `IFCPROPERTYBOUNDEDVALUE` (Upper/Lower: ver tabela "bounded" do manual — implementar como dois valores e a regra de faixa da restrição: os dois limites precisam respeitar a faixa); `IFCELEMENTQUANTITY.Quantities` → `IFCQUANTITYLENGTH` (LengthValue, tipoDado IFCLENGTHMEASURE), AREA, VOLUME, COUNT, WEIGHT (IFCMASSMEASURE), TIME.
4. `tipoDado` = nome da classe do valor (`api.GetNameFromTypeCode` do `type` do NominalValue, MAIÚSCULAS, ex. IFCLABEL); valor numérico de medida passa por `paraSi`; se `null`, `tipoDado = "__SEM_SI__"`.
5. `vazia` = sem valor (NominalValue nulo, lista vazia, texto "").
6. Unidades: ler `IFCPROJECT.UnitsInContext` → `IFCUNITASSIGNMENT.Units`; `IFCSIUNIT` → `{ prefixo: Prefix, si: true }`; `IFCCONVERSIONBASEDUNIT` → `{ si: false }`.

Run: `npx vitest run src/modules/coordenacao/ids/conformidade.test.ts` (com `PASTAS_ATIVAS` acrescida de `property`, `restriction`, `tolerance`).
Expected: PASS nas cinco pastas. Corrigir o adaptador pelos casos que falharem.

- [ ] **Step 4: Teste próprio da Review Focus 2 e 3** — acrescentar a `avaliar.test.ts`:

```ts
it("propriedade da ocorrência vence a do tipo (o adaptador já entrega mesclado)", () => {
  // O adaptador devolve só a da ocorrência quando os dois têm o mesmo par; aqui simulamos a saída dele.
  const ids = paredesComFogo();
  ids.especificacoes[0].requisitos = [
    { tipo: "property", propertySet: s("Pset_WallCommon"), baseName: s("FireRating"), dataType: "IFCLABEL", valor: s("90"), cardinalidade: "required" },
  ];
  const [r] = avaliarIds(ids, modelo({ 1: { classe: "IFCWALL", props: [fogo("90")] } }));
  expect(r.estado).toBe("aprovado");
});

it("valor de medida sem conversão para SI: não verificado", () => {
  const ids = paredesComFogo();
  ids.especificacoes[0].requisitos = [
    { tipo: "property", propertySet: s("Qto_WallBaseQuantities"), baseName: s("Length"), dataType: "IFCLENGTHMEASURE", valor: s("3"), cardinalidade: "required" },
  ];
  const pe = { pset: "Qto_WallBaseQuantities", nome: "Length", tipoDado: "__SEM_SI__", valores: [10], vazia: false };
  const [r] = avaliarIds(ids, modelo({ 1: { classe: "IFCWALL", props: [pe] } }));
  expect(r.estado).toBe("nao_verificado");
});
```

Run: `npx vitest run src/modules/coordenacao/ids` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/coordenacao/ids/
git commit -m "feat(coordenacao): IDS — propriedades e quantidades, herança do tipo e conversão para SI"
```

---

### Task 7: Classificação

**Files:**
- Modify: `src/modules/coordenacao/ids/acesso-web-ifc.ts` (implementar `classificacoes`)
- Modify: `src/modules/coordenacao/ids/conformidade.test.ts` (`PASTAS_ATIVAS` += `"classification"`)

Regras: `IFCRELASSOCIATESCLASSIFICATION` (`RelatedObjects` → `RelatingClassification`), também do **tipo** da ocorrência. Uma `IFCCLASSIFICATIONREFERENCE` dá o código em `Identification` (IFC4) ou `ItemReference` (IFC2X3); sobe por `ReferencedSource` (referência pai → mais códigos; a raiz `IFCCLASSIFICATION` dá o `sistema` pelo `Name`). Ligação direta a `IFCCLASSIFICATION` = sistema sem código. `codigos` reúne o código da referência e os dos pais (o manual aceita casar qualquer nível).

- [ ] **Step 1: Ativar a pasta e ver falhar**: `npx vitest run src/modules/coordenacao/ids/conformidade.test.ts -t classification` → FAIL.
- [ ] **Step 2: Implementar `classificacoes` com as regras acima.**
- [ ] **Step 3: Rodar** → PASS em `classification` e nas pastas já ativas.
- [ ] **Step 4: Commit** `git commit -m "feat(coordenacao): IDS — classificação (referência, pais e sistema)"`

---

### Task 8: Banco, processo separado, fila e gatilho no envio

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261010120000_verificacao_ids/migration.sql`
- Create: `scripts/verificar-ids.ts`
- Create: `src/modules/coordenacao/ids/relatorio.ts` (puro) + `relatorio.test.ts`
- Create: `src/modules/coordenacao/ids/service.ts`
- Modify: `src/lib/jobs.ts`, `src/lib/jobs-handlers.ts`
- Modify: `src/app/api/uploads/route.ts` (gatilho)

**Interfaces:**
- Produces:
  - Prisma: `Projeto.exigirIdsParaPublicar Boolean @default(false)`; `model RequisitoIds { id, projetoId, nomeArquivo, caminho, hashSha256, titulo, versaoIds String?, totalRequisitos Int, ativo Boolean @default(true), autorId, createdAt, excluidoEm DateTime? }`; `model VerificacaoIds { id, projetoId, uploadId String?, documentoVersaoId String?, status String @default("fila"), requisitosHash String, resumo Json?, falhas Json?, erro String?, duracaoMs Int?, createdAt, concluidaEm DateTime? @@index([uploadId, createdAt]) @@index([documentoVersaoId, createdAt]) @@index([projetoId]) }`.
  - `FILA_VERIFICAR_IDS = "verificar-ids"` (em `ids/regras.ts`, puro).
  - `service.ts`: `enfileirarVerificacaoIds(alvo: { uploadId: string } | { documentoVersaoId: string }): Promise<{ enfileirado: boolean; motivo?: "sem_ids" | "sem_worker" | "nao_ifc" }>`; `processarVerificacaoIds(verificacaoId: string): Promise<void>`; `reverificarProjeto(projetoId: string): Promise<number>` (D10); `verificacaoVigente(alvo): Promise<VerificacaoIds | null>`.
  - `relatorio.ts`: `const LIMITE_FALHAS = 500`; `resumir(resultados: ResultadoEspecificacao[], origem: string): { resumo: ResumoRequisito[]; falhas: Record<string, { total: number; itens: FalhaElemento[] }>; status: "aprovado" | "reprovado" }` onde `ResumoRequisito = { chave: string; nome: string; descricao: string | null; origem: string; estado: EstadoRequisito; aplicaveis: number; aprovados: number; reprovados: number; naoVerificados: number; motivoGeral: string | null }` e `chave = \`${origem}#${indice}\``; `montarRelatorioIdsHtml(...)`.
  - Linha de saída do processo: `{"ok":true,"resultados":[{"origem":"<requisitoIdsId>","especificacoes":ResultadoEspecificacao[]}],"duracaoMs":N}` ou `{"ok":false,"erro":"…"}`.

- [ ] **Step 1: Teste do relatório (corte em 500 e status)**

```ts
// src/modules/coordenacao/ids/relatorio.test.ts
import { describe, expect, it } from "vitest";
import { LIMITE_FALHAS, resumir } from "@/modules/coordenacao/ids/relatorio";

const especificacao = (estado: "aprovado" | "reprovado" | "nao_verificado" | "nao_se_aplica", falhas = 0) => ({
  indice: 0, nome: "S", descricao: null, estado, aplicaveis: falhas, aprovados: 0, reprovados: falhas, naoVerificados: 0, motivoGeral: null,
  falhas: Array.from({ length: falhas }, (_, i) => ({ id: i, guid: `G${i}`, classe: "IFCWALL", nome: null, motivo: "x" })),
});

describe("resumir", () => {
  it("corta as falhas em 500 e guarda o total real", () => {
    const r = resumir([especificacao("reprovado", 1200)], "ids1");
    expect(r.status).toBe("reprovado");
    expect(r.falhas["ids1#0"].total).toBe(1200);
    expect(r.falhas["ids1#0"].itens).toHaveLength(LIMITE_FALHAS);
  });
  it("só aprovado/não se aplica/não verificado = aprovado (não verificado não reprova)", () => {
    expect(resumir([especificacao("aprovado"), especificacao("nao_verificado"), especificacao("nao_se_aplica")], "x").status).toBe("aprovado");
  });
});
```

Run → FAIL; implementar `relatorio.ts` (`resumir` + `montarRelatorioIdsHtml` com `escaparHtml` igual ao `relatorio-clash.ts`, uma seção por requisito, "mostrando 500 de N"); Run → PASS.

- [ ] **Step 2: Schema + migração**

```sql
-- prisma/migrations/20261010120000_verificacao_ids/migration.sql
ALTER TABLE "Projeto" ADD COLUMN "exigirIdsParaPublicar" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RequisitoIds" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projetoId" TEXT NOT NULL REFERENCES "Projeto"("id") ON DELETE CASCADE,
  "nomeArquivo" TEXT NOT NULL,
  "caminho" TEXT NOT NULL,
  "hashSha256" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "versaoIds" TEXT,
  "totalRequisitos" INTEGER NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "autorId" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "excluidoEm" TIMESTAMP(3)
);
CREATE INDEX "RequisitoIds_projetoId_idx" ON "RequisitoIds"("projetoId");

CREATE TABLE "VerificacaoIds" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projetoId" TEXT NOT NULL REFERENCES "Projeto"("id") ON DELETE CASCADE,
  "uploadId" TEXT REFERENCES "Upload"("id") ON DELETE CASCADE,
  "documentoVersaoId" TEXT REFERENCES "DocumentoVersao"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'fila',
  "requisitosHash" TEXT NOT NULL,
  "resumo" JSONB,
  "falhas" JSONB,
  "erro" TEXT,
  "duracaoMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluidaEm" TIMESTAMP(3),
  CONSTRAINT "VerificacaoIds_um_alvo" CHECK (("uploadId" IS NULL) <> ("documentoVersaoId" IS NULL))
);
CREATE INDEX "VerificacaoIds_uploadId_createdAt_idx" ON "VerificacaoIds"("uploadId", "createdAt");
CREATE INDEX "VerificacaoIds_documentoVersaoId_createdAt_idx" ON "VerificacaoIds"("documentoVersaoId", "createdAt");
CREATE INDEX "VerificacaoIds_projetoId_idx" ON "VerificacaoIds"("projetoId");
```

(Nomes de tabela/coluna conferidos contra `schema.prisma` antes de aplicar — `User`, `Upload`, `DocumentoVersao`, `Projeto`.)

```bash
npx prisma db push && npx prisma migrate resolve --applied 20261010120000_verificacao_ids && npx prisma generate
```

- [ ] **Step 3: `scripts/verificar-ids.ts`** — mesmo esqueleto de `scripts/converter-ifc.ts` (args = `<ifcRel> <idsRel:requisitoId>...`, valida tamanho com `TAMANHO_MAX_IFC` e cabeçalho com `validarHeaderIfc`, `abrirModeloWebIfc`, para cada .ids `lerIds` + `avaliarIds`, emite a linha JSON, `process.exit`).

- [ ] **Step 4: `service.ts`** — enfileirar (status `sem_ids` quando o projeto não tem .ids ativo; `requisitosHash` = sha256 dos `hashSha256` ativos ordenados), `processarVerificacaoIds` (spawn igual a `deslocamento.ts`, timeout 15 min, grava `resumo`/`falhas`/`status` via `resumir`, `notificar` o autor do upload quando reprovado, categoria `coordenacao`, link `/projetos/<id>/coordenacao?ids=<verificacaoId>`), `reverificarProjeto` (revisão vigente de cada documento de modelo em `em_andamento`/`compartilhado` → enfileira o IFC dela).

- [ ] **Step 5: Fila** — em `lib/jobs.ts`: `await boss.createQueue(FILA_VERIFICAR_IDS); await boss.work(FILA_VERIFICAR_IDS, async ([job]) => processarVerificacaoIds((job.data as { verificacaoId: string }).verificacaoId));` (concorrência 1, como a conversão).

- [ ] **Step 6: Gatilho** — em `app/api/uploads/route.ts`, junto de `enfileirarConversao(criado.id)` para `.ifc` de disciplina: `void enfileirarVerificacaoIds({ uploadId: criado.id }).catch((err) => console.error("[ids] falha ao enfileirar:", err));`.

- [ ] **Step 7: Smoke ponta a ponta** — `scripts/smoke-ids.ts` (padrão dos outros smokes): cria projeto de teste com um .ids simples ("toda IFCWALL tem Pset_WallCommon.FireRating"), sobe um IFC sintético de 2 paredes (uma com a propriedade), roda `processarVerificacaoIds` direto (sem fila) e confere `status = "reprovado"`, 1 falha com o GUID certo; apaga o que criou. `package.json`: `"smoke:ids": "tsx --tsconfig tsconfig.server.json scripts/smoke-ids.ts"`.

Run: `npm run smoke:ids` → `OK`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261010120000_verificacao_ids scripts/verificar-ids.ts scripts/smoke-ids.ts src/modules/coordenacao/ids/ src/lib/jobs.ts src/lib/jobs-handlers.ts src/app/api/uploads/route.ts package.json
git commit -m "feat(coordenacao): verificação IDS automática — banco, processo separado, fila e gatilho no envio"
```

---

### Task 9: Envio do .ids, ações e leituras

**Files:**
- Create: `src/app/api/coordenacao/ids/route.ts` (POST multipart)
- Create: `src/modules/coordenacao/ids/actions.ts`, `src/modules/coordenacao/ids/queries.ts`, `src/modules/coordenacao/ids/schemas.ts`

**Interfaces:**
- Produces: ações `alternarRequisitoIds({ id, ativo })`, `excluirRequisitoIds({ id })`, `definirExigenciaIds({ projetoId, exigir })`, `verificarModeloIds({ modeloId })` (modeloId = uploadId cru ou `d:<documentoVersaoId>`, mesmo formato de `modelo-ref.ts`); leituras `requisitosDoProjeto(projetoId)`, `verificacoesDoProjeto(projetoId)` (a vigente de cada modelo), `verificacaoPorId(id)` (com `falhas`).
- Rota: `POST /api/coordenacao/ids` com `projetoId` + arquivo `.ids` (≤ 5 MB). Autentica pela sessão (`auth.api.getSession`), exige `coordenacao:gerir` e membro/global no projeto (`exigirMembroOuGlobal`), lê com `lerIds`, recusa com `{ erro: motivo }` 400, grava em `STORAGE/<projeto>/COORDENACAO/IDS/<id>.ids`, cria `RequisitoIds`, chama `reverificarProjeto` (D10), registra `AuditLog` com a mesma forma das ações (usar o helper de auditoria que a rota `/api/coordenacao/snapshot` usa).

- [ ] **Step 1: Testes de schema** (`schemas.test.ts`): `definirExigenciaSchema` exige `projetoId` e booleano; `verificarModeloSchema` aceita `"abc"` e `"d:xyz"`.
- [ ] **Step 2: Implementar schemas, ações (`defineAction` com `recurso: "coordenacao"`, `permissao: "gerir"`, `capturarAntes` em `definirExigenciaIds` lendo `Projeto.exigirIdsParaPublicar`), leituras e rota.**
- [ ] **Step 3: `npx vitest run src/modules/coordenacao` e `npx tsc --noEmit -p tsconfig.json`** → PASS / sem erros.
- [ ] **Step 4: Commit** `git commit -m "feat(coordenacao): envio do .ids, chave de exigência e leituras das verificações"`

---

### Task 10: Painel "Requisitos (IDS)" e relatório na tela

**Files:**
- Create: `src/components/coordenacao/ids-painel.tsx`, `src/components/coordenacao/ids-relatorio.tsx`
- Create: `src/modules/coordenacao/ids/acoes-requisito.ts` (descritor puro ADR-0002) + teste
- Modify: `src/components/coordenacao/viewer-toolbar.tsx` (painel `"ids"` no dock e no menu do celular), `src/components/coordenacao/coordenacao-view.tsx`, `src/app/(dashboard)/projetos/[id]/coordenacao/page.tsx` (carregar `requisitosDoProjeto`, `verificacoesDoProjeto`, `exigirIdsParaPublicar`)

**Interfaces:**
- Produces: `itensDoRequisitoIds(r: { estado: EstadoRequisito; reprovados: number }, o: { podeApontar: boolean; apontando: boolean }): AcaoItem[]` com ids `ver-elementos`, `apontar`, `exportar`; `apontar` só para quem gere e só com `reprovados > 0` (senão desabilitado com "Nenhum elemento reprovado neste requisito.").

- [ ] **Step 1: Teste do descritor** (mesma forma de `acoes-conflito.test.ts`: quem gere vê os três; sem gerir, "apontar" some; sem reprovados, "apontar" desabilitado com o motivo).
- [ ] **Step 2: Implementar o painel:**
  - Lista de .ids (nome, título, nº de requisitos, autor, data, ativo) com menu: desativar/ativar, excluir (com `await confirm()` ANTES do `startTransition`); botão "Enviar .ids" (input file `.ids`, `fetch("/api/coordenacao/ids", { method: "POST", body: FormData })`, toast com o motivo da recusa).
  - `Switch` "Exigir aprovação no IDS para publicar" (`definirExigenciaIds`), só para quem gere.
  - Por modelo carregado: selo (aprovado / reprovado N / verificando / erro / não verificado), "Ver relatório", "Verificar requisitos" (recebidos, D5) / "Verificar de novo" (escritório).
- [ ] **Step 3: Implementar o relatório** (`ids-relatorio.tsx`): lista de requisitos (`LinhaComMenu` + `BotaoAcoes`), contadores, "mostrando 500 de N"; clicar num elemento → `engine.guidsParaLocalIds` + `engine.isolarElementos`/realce (usar `ancoraDeGuids` e `focarConflito`-like: criar `engine.focarGuids(modeloId, guids)` se não houver equivalente); "Virar apontamento" → `criarApontamentoCoordenacao` com até 50 GUIDs, título `IDS: <requisito>` e texto com o motivo mais comum; "Exportar" → `montarRelatorioIdsHtml` numa aba nova.
- [ ] **Step 4: Conferir no navegador** (`npm run dev:server`, admin de teste, projeto 260027): enviar um .ids de teste, ver a verificação do ARQ sair "reprovado", abrir o relatório, clicar num elemento (realça no 3D), virar apontamento. Largura 390 px sem rolagem horizontal (`document.documentElement.scrollWidth === 390`).
- [ ] **Step 5: Commit** `git commit -m "feat(coordenacao): painel de requisitos IDS com relatório, foco no 3D e apontamento por requisito"`

---

### Task 11: Bloqueio no ciclo, selo na revisão e reverificação

**Files:**
- Modify: `src/modules/uploads/ciclo/regras.ts` (`decidirPublicacao`) + `regras.test.ts`
- Modify: `src/modules/uploads/ciclo/service.ts` (`publicarNoBanco` lê a verificação vigente do IFC da revisão e a exigência do projeto)
- Modify: a lista de revisões da aba Arquivos (componente que desenha o selo de estado da revisão) — selo IDS com link
- Modify: `src/modules/uploads/ciclo/actions.ts` (a ação de publicar passa `podeJustificarIds = can(user, "coordenacao:gerir")`)

**Interfaces:**
- Consumes: `verificacaoVigente` (Task 8).
- Produces: `decidirPublicacao({ …, ids?: { exigir: boolean; status: "aprovado" | "reprovado" | "fila" | "processando" | "erro" | "sem_ids" | null; podeJustificar: boolean } })`. Frases (as mesmas no botão desabilitado):
  - `MOTIVO_IDS_VERIFICANDO = "A verificação dos requisitos (IDS) ainda está rodando. Aguarde para publicar."`
  - `MOTIVO_IDS_ERRO = "A verificação dos requisitos (IDS) falhou. Peça uma nova verificação na aba Compatibilização."`
  - `MOTIVO_IDS_REPROVADO = "A revisão reprovou nos requisitos (IDS). Corrija o modelo ou publique com justificativa."`
  - `MOTIVO_IDS_SEM_PERMISSAO = "A revisão reprovou nos requisitos (IDS). Só quem gere a coordenação pode publicar com justificativa."`

- [ ] **Step 1: Testes de `decidirPublicacao`**

```ts
// acrescentar a src/modules/uploads/ciclo/regras.test.ts
describe("decidirPublicacao — requisitos IDS", () => {
  const base = { arquivos: [{ id: "a", nome: "m.ifc", ext: "ifc", validado: true }], pendencias: [], permitirComPendencias: false };
  it("bloqueio desligado: IDS não interfere", () => {
    expect(decidirPublicacao({ ...base, ids: { exigir: false, status: "reprovado", podeJustificar: false } }).ok).toBe(true);
  });
  it("verificando ou erro, com bloqueio: não publica (D9)", () => {
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: "processando", podeJustificar: true } })).toEqual({ ok: false, motivo: MOTIVO_IDS_VERIFICANDO });
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: "erro", podeJustificar: true } })).toEqual({ ok: false, motivo: MOTIVO_IDS_ERRO });
  });
  it("reprovado: só com justificativa e por quem gere (D8)", () => {
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: "reprovado", podeJustificar: true } })).toEqual({ ok: false, motivo: MOTIVO_IDS_REPROVADO });
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: "reprovado", podeJustificar: false }, justificativa: "ok" })).toEqual({ ok: false, motivo: MOTIVO_IDS_SEM_PERMISSAO });
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: "reprovado", podeJustificar: true }, justificativa: "Cliente aceitou" }).ok).toBe(true);
  });
  it("projeto sem .ids (sem_ids ou null): nada muda", () => {
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: "sem_ids", podeJustificar: false } }).ok).toBe(true);
    expect(decidirPublicacao({ ...base, ids: { exigir: true, status: null, podeJustificar: false } }).ok).toBe(true);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar** — em `decidirPublicacao`, depois da checagem de validação e antes das pendências:

```ts
if (p.ids?.exigir) {
  const s = p.ids.status;
  if (s === "fila" || s === "processando") return { ok: false, motivo: MOTIVO_IDS_VERIFICANDO };
  if (s === "erro") return { ok: false, motivo: MOTIVO_IDS_ERRO };
  if (s === "reprovado") {
    if (!p.ids.podeJustificar) return { ok: false, motivo: MOTIVO_IDS_SEM_PERMISSAO };
    if (!p.justificativa?.trim()) return { ok: false, motivo: MOTIVO_IDS_REPROVADO };
  }
}
```

e, em `publicarNoBanco`, gravar `detalhe: { justificativa, idsReprovado: true }` na transição quando a publicação passou com IDS reprovado.

- [ ] **Step 3: Selo na revisão** (aba Arquivos) e, no diálogo de publicar, o campo de justificativa aparece também quando o motivo é `MOTIVO_IDS_REPROVADO`.
- [ ] **Step 4: Rodar** `npx vitest run src/modules/uploads/ciclo` + `npm run smoke:ciclo-documental` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(arquivos): publicação respeita a verificação IDS do projeto (bloqueio, justificativa e selo)"`

---

### Task 12: Material e partOf

**Files:**
- Modify: `src/modules/coordenacao/ids/acesso-web-ifc.ts` (`materiais`, `pais`), `avaliar.ts` (casos `material` e `partOf`), `conformidade.test.ts` (`PASTAS_ATIVAS` += `"material", "partof"`)

Regras:
- **Material:** `IFCRELASSOCIATESMATERIAL` da ocorrência (e do tipo, se a ocorrência não tiver). Nomes e `Category` de: `IFCMATERIAL`; `IFCMATERIALLIST.Materials`; `IFCMATERIALLAYERSET(USAGE)` → camadas → material (e `Name` da camada e do conjunto); `IFCMATERIALPROFILESET(USAGE)` idem com perfis; `IFCMATERIALCONSTITUENTSET` → constituintes. Casa se qualquer nome/categoria casar.
- **partOf:** índices de `IFCRELAGGREGATES` (RelatingObject ← RelatedObjects), `IFCRELCONTAINEDINSPATIALSTRUCTURE`, `IFCRELNESTS`, `IFCRELVOIDSELEMENT` (elemento ← abertura), `IFCRELFILLSELEMENT` (abertura ← preenchimento), `IFCRELASSIGNSTOGROUP`; `pais` é transitivo dentro da mesma relação; sem `relacao`, qualquer uma. O pai precisa casar a `entidade` (classe + tipo predefinido).

- [ ] **Step 1: Ativar as pastas e ver falhar.**
- [ ] **Step 2: Implementar** `materiais`/`pais` e trocar o `nao_suportado` de `avaliar.ts` por:

```ts
case "material": {
  const mats = m.materiais(id);
  const casou: Casamento = mats.length === 0 ? "nao" : !f.valor ? "sim" : mats.some((n) => casa(f.valor!, n) === "sim") ? "sim" : "nao";
  return porCardinalidade(f.cardinalidade, mats.length > 0, casou, "material");
}
case "partOf": {
  const pais = m.pais(id, f.relacao).filter((p) => entidade(f.entidade, m, p).r === "sim");
  return porCardinalidade(f.cardinalidade, pais.length > 0, pais.length > 0 ? "sim" : "nao", `parte de ${rotulo(f.entidade.nome)}`);
}
```

- [ ] **Step 3: Rodar a conformidade completa** → PASS nas 9 pastas.
- [ ] **Step 4: Commit** `git commit -m "feat(coordenacao): IDS — material e partOf; todos os casos oficiais passam"`

---

### Task 13: Fechamento

- [ ] **Step 1:** `npm run lint` (sem `--quiet`), `npx vitest run`, `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` e `-p tsconfig.server.json` → tudo verde.
- [ ] **Step 2:** `docs/manual/` — seção da Compatibilização: "Requisitos do modelo (IDS)": enviar .ids, ler o relatório, ligar o bloqueio, publicar com justificativa. `docs/manual/novidades.md`: uma linha.
- [ ] **Step 3:** `CLAUDE.md` — parágrafo curto em "Coordenação BIM" com: núcleo puro em `coordenacao/ids/`, adaptador web-ifc só no processo separado e no teste, casos oficiais baixados por `npm run ids:baixar-casos` (fora do git, CC BY-ND), gate em `decidirPublicacao`, `npm run smoke:ids`.
- [ ] **Step 4:** `npm run smoke:ids` e `npm run smoke:ciclo-documental` → OK.
- [ ] **Step 5: Commit** `git commit -m "docs(coordenacao): manual e CLAUDE.md da verificação IDS"`
