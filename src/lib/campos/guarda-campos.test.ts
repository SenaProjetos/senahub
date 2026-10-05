import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da regra de campos com formato (spec 2026-10-04, ADR-0010): campo de CPF, CNPJ,
 * telefone, CEP, e-mail, RG, agência, conta, chave PIX ou chave NF-e usa `InputFormatado` na
 * tela e `campo.<tipo>()` no schema. Exceção só com `campo-ok: <motivo>` no trecho ou na linha
 * anterior (ex.: busca que aceita CPF parcial, e-mail de login).
 */

const SRC = path.resolve(__dirname, "../..");
const NOMES = "cpf|cnpj|documento|telefone|telefoneEmergencia|cep|enderecoCep|rg|agencia|conta|pix|pixChave|chaveNfe|email|emailPessoal";

const ALVO_INPUT = new RegExp(`\\bname="(${NOMES})"|\\b(?:value|defaultValue)=\\{[\\w.?]*?\\b(${NOMES})\\b[^}]*\\}`);
// `z` pode ter a cadeia na linha de baixo (`chaveNfe: z` + `.string()`) e qualquer helper `opt…(` conta.
const ALVO_SCHEMA = new RegExp(`^\\s*(${NOMES})\\s*:\\s*(?:opt\\w*\\()?z\\s*\\.`, "gm");

const linhaDe = (src: string, indice: number) => src.slice(0, indice).split("\n").length;
const linhaAnterior = (src: string, indice: number) => {
  const inicio = src.lastIndexOf("\n", indice - 1);
  return src.slice(src.lastIndexOf("\n", inicio - 1) + 1, Math.max(inicio, 0));
};
// A linha de cima isenta só quando é SÓ o comentário (de linha, de bloco ou de bloco em JSX):
// o `campo-ok` no fim de uma linha de código isenta aquela linha, não a seguinte.
const campoOkAntes = (src: string, indice: number) => {
  const anterior = linhaAnterior(src, indice);
  return /^\s*\{?\s*(\/\/|\/\*)/.test(anterior) && anterior.includes("campo-ok:");
};

/** `<Input …/>` (não `InputFormatado`/`InputMoeda`) que recebe um campo do catálogo. */
export function inputsCrus(src: string): number[] {
  const re = /<Input\b[\s\S]*?\/>/g;
  const linhas: number[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (!ALVO_INPUT.test(m[0])) continue;
    if (m[0].includes("campo-ok:") || campoOkAntes(src, m.index)) continue;
    linhas.push(linhaDe(src, m.index));
  }
  return linhas;
}

/** Chave de schema com nome de campo do catálogo declarada com `z.` cru. */
export function schemasCrus(src: string): number[] {
  const linhas: number[] = [];
  for (let m = ALVO_SCHEMA.exec(src); m; m = ALVO_SCHEMA.exec(src)) {
    // Ancora na chave, não no início do match: em CRLF o `^` casa depois do `\r` e o `\s*` engole
    // o `\n` (o mesmo vale para linha em branco antes), então `m.index` cai na linha de cima.
    const chave = m.index + (m[0].length - m[0].trimStart().length);
    const fim = src.indexOf("\n", chave);
    const linha = src.slice(chave, fim === -1 ? undefined : fim);
    if (linha.includes("campo-ok:") || campoOkAntes(src, chave)) continue;
    linhas.push(linhaDe(src, chave));
  }
  return linhas;
}

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (/\.test\.tsx?$/.test(p)) return [];
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

function violacoes(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of arquivos(SRC)) {
    const rel = path.relative(SRC, p).split(path.sep).join("/");
    const src = readFileSync(p, "utf8");
    let n = p.endsWith(".tsx") ? inputsCrus(src).length : 0;
    if (/^modules\/.*(schemas?|actions)\.ts$/.test(rel)) n += schemasCrus(src).length;
    if (n) r[rel] = n;
  }
  return r;
}

/**
 * Vazia de propósito: exceção só por `campo-ok: <motivo>` na linha do campo ou num comentário
 * sozinho logo acima (ADR-0010).
 */
const PENDENTES: Record<string, number> = {};

describe("campos com formato usam o catálogo", () => {
  it("detector de <Input> acha campo do catálogo e ignora o resto", () => {
    expect(inputsCrus(`<Input value={f.cpf} onChange={x} />`)).toEqual([1]);
    expect(inputsCrus(`<Input\n  value={form.documento ?? ""}\n  onChange={x}\n/>`)).toEqual([1]);
    expect(inputsCrus(`<Input name="telefone" />`)).toEqual([1]);
    expect(inputsCrus(`<Input value={cpf} />`)).toEqual([1]);
    expect(inputsCrus(`<Input value={docNome} />`)).toEqual([]);
    expect(inputsCrus(`<Input value={form.contaId} />`)).toEqual([]);
    expect(inputsCrus(`<InputFormatado tipo="cpf" value={f.cpf} />`)).toEqual([]);
    expect(inputsCrus(`{/* campo-ok: login */}\n<Input value={f.email} />`)).toEqual([]);
    expect(inputsCrus(`<Input value={a} /> {/* campo-ok: x */}\n<Input value={f.telefone} />`)).toEqual([2]);
    expect(inputsCrus(`<Input value={pix} />`)).toEqual([1]);
    expect(inputsCrus(`<Input value={form.pixTipo} />`)).toEqual([]);
  });
  it("detector de schema acha z. cru e aceita campo. e campo-ok", () => {
    expect(schemasCrus(`  cpf: opt(z.string()),`)).toEqual([1]);
    expect(schemasCrus(`a\n  telefone: z.string().optional(),`)).toEqual([2]);
    expect(schemasCrus(`  cpf: campo.cpf(),`)).toEqual([]);
    expect(schemasCrus(`  email: z.string().email(), // campo-ok: e-mail de login`)).toEqual([]);
    // CRLF (a maior parte de src/) e linha em branco antes: `^\s*` engole a quebra de linha, e o
    // `campo-ok` da própria linha ainda tem de valer.
    expect(schemasCrus(`a\r\n  email: z.string(), // campo-ok: login`)).toEqual([]);
    expect(schemasCrus(`a\n\n  email: z.string(), // campo-ok: login`)).toEqual([]);
    expect(schemasCrus(`a\r\n  telefone: z.string(),`)).toEqual([2]);
    // O `campo-ok` da linha de cima só vale se a linha for SÓ o comentário: o de fim de linha
    // isenta a própria chave, não a seguinte.
    expect(schemasCrus(`  // campo-ok: busca parcial\n  cpf: z.string(),`)).toEqual([]);
    expect(schemasCrus(`  email: z.string(), // campo-ok: login\n  telefone: z.string(),`)).toEqual([2]);
    // `z` com a cadeia na linha de baixo e helper `opt…(` também contam; `pix` só como chave inteira.
    expect(schemasCrus(`  chaveNfe: z\n    .string()`)).toEqual([1]);
    expect(schemasCrus(`  chaveNfe: z\r\n    .string()`)).toEqual([1]);
    expect(schemasCrus(`  cpf: optStr(z.string())`)).toEqual([1]);
    expect(schemasCrus(`  pix: z.string().optional(),`)).toEqual([1]);
    expect(schemasCrus(`  pixTipo: z.enum(TIPOS),`)).toEqual([]);
  });
  it("nenhum campo cru fora da lista de pendentes, e a lista não fica velha", () => {
    expect(violacoes()).toEqual(PENDENTES);
  });
});
