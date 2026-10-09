import { describe, expect, it } from "vitest";

import { mensagemDosProblemas, problemasDoEnvio, type EntradaEnvio } from "./envio-regras";

const campo = <T>(valor: T) => ({ valor, confianca: 0.95, fonte: "padrao_projeto" as const, texto: String(valor) });

function entrada(p: Partial<EntradaEnvio> = {}): EntradaEnvio {
  return {
    numero: 1,
    descricao: null,
    arquivos: [{ nome: "260010-SENA-AGF-BAS-001-PLB.pdf", ext: "pdf", hash: "h1" }],
    anteriores: [],
    nome: {
      casouPadrao: true,
      projeto: { ano: 2026, sequencial: 10, subprojeto: null, texto: "260010", bateComAtual: true },
      disciplina: campo("hid"),
      fase: campo("bas"),
      tipo: campo("plb"),
      numero: campo(1),
      revisao: undefined,
      avisos: [],
    },
    camposDoPadrao: ["proj", "disc", "fase", "num", "tipo"],
    modelo: "{proj}-SENA-{disc}-{fase}-{num}-{tipo}",
    ...p,
  };
}

describe("problemasDoEnvio (A4)", () => {
  it("R00 correta, com PDF e nome no padrão: nada a corrigir", () => {
    expect(problemasDoEnvio(entrada())).toEqual([]);
  });

  it("nome fora do padrão do projeto", () => {
    expect(problemasDoEnvio(entrada({ nome: { ...entrada().nome, casouPadrao: false } }))[0]).toMatch(/padrão do projeto \(\{proj\}-SENA/);
  });

  it("v1 sem modelo: exige código do projeto, disciplina e número", () => {
    const n = entrada().nome;
    expect(problemasDoEnvio(entrada({ camposDoPadrao: [], modelo: null, nome: { ...n, casouPadrao: null } }))).toEqual([]);
    expect(problemasDoEnvio(entrada({ camposDoPadrao: [], modelo: null, nome: { ...n, casouPadrao: null, numero: undefined } }))[0]).toMatch(/nomenclatura/);
  });

  it("sigla fora do catálogo vem com o texto do motor", () => {
    const avisos = [{ tipo: "sigla_desconhecida" as const, texto: '"XYZ" não está no catálogo de fase.' }];
    expect(problemasDoEnvio(entrada({ nome: { ...entrada().nome, fase: undefined, avisos } }))).toEqual(['"XYZ" não está no catálogo de fase.']);
  });

  it("código de outro projeto no nome", () => {
    const projeto = { ano: 2026, sequencial: 11, subprojeto: null, texto: "260011", bateComAtual: false };
    expect(problemasDoEnvio(entrada({ nome: { ...entrada().nome, projeto } }))[0]).toMatch(/260011/);
  });

  it("código do projeto tem de estar escrito como o cadastrado (26027 ≠ 260027)", () => {
    const projeto = { ano: 2026, sequencial: 27, subprojeto: null, texto: "26027", bateComAtual: true };
    expect(problemasDoEnvio(entrada({ codigoProjeto: "260027", nome: { ...entrada().nome, projeto } }))).toEqual([
      "O código do projeto no nome (26027) não está escrito como o do projeto (260027).",
    ]);
    const certo = { ...projeto, texto: "260027" };
    expect(problemasDoEnvio(entrada({ codigoProjeto: "260027", nome: { ...entrada().nome, projeto: certo } }))).toEqual([]);
  });

  it("N1-a: revisão no nome (v1) tem de bater com a esperada", () => {
    expect(problemasDoEnvio(entrada({ numero: 3, descricao: "x", nome: { ...entrada().nome, revisao: campo(1) } }))).toEqual([
      "O nome indica R01, mas o sistema espera R02.",
    ]);
    expect(problemasDoEnvio(entrada({ numero: 2, descricao: "x", nome: { ...entrada().nome, revisao: campo(1) } }))).toEqual([]);
  });

  it("revisão sem PDF", () => {
    expect(problemasDoEnvio(entrada({ arquivos: [{ nome: "a.dwg", ext: "dwg", hash: "h" }] }))).toContain("A revisão precisa ter o PDF.");
  });

  it("modelo IFC não precisa de PDF (o IFC é o arquivo principal)", () => {
    expect(problemasDoEnvio(entrada({ arquivos: [{ nome: "modelo.ifc", ext: "ifc", hash: "h" }] }))).toEqual([]);
  });

  it("arquivo idêntico (hash) ao do mesmo formato na revisão anterior", () => {
    const r = problemasDoEnvio(entrada({ numero: 2, descricao: "x", anteriores: [{ nome: "old.pdf", ext: "pdf", hash: "h1" }] }));
    expect(r).toEqual(["O PDF é idêntico ao da revisão anterior. Envie o arquivo corrigido."]);
  });

  it("descrição obrigatória da R01 em diante, não na R00", () => {
    expect(problemasDoEnvio(entrada({ numero: 1 }))).toEqual([]);
    expect(problemasDoEnvio(entrada({ numero: 2, descricao: "  " }))).toEqual(["Descreva o que mudou nesta revisão."]);
  });

  it("junta todos os problemas numa mensagem", () => {
    const lista = problemasDoEnvio(entrada({ numero: 2, arquivos: [{ nome: "a.dwg", ext: "dwg", hash: "h" }] }));
    expect(mensagemDosProblemas(lista)).toMatch(/^Corrija antes de enviar para análise:\n• /);
  });
});
