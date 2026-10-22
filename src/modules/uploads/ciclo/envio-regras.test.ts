import { describe, expect, it } from "vitest";

import {
  descricaoDoCarimbo,
  MOTIVO_DESCRICAO_DIGITADA_GENERICA,
  MOTIVO_DESENHO_SEM_PDF,
  mensagemDosProblemas,
  motivoDescricaoGenerica,
  motivoDescricaoVazia,
  problemasDoEnvio,
  type EntradaEnvio,
} from "./envio-regras";
import type { QuadroRevisao } from "./quadro-revisao";
import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import quadros from "./__fixtures__/quadros-revisao.json";
import { lerCarimbo } from "./carimbo";

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
    carimbo: null,
    contestada: false,
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

  it("nomenclatura livre (licitação): nada do nome bloqueia, o resto continua", () => {
    const projeto = { ano: 2026, sequencial: 31, subprojeto: null, texto: "2631", bateComAtual: true };
    const nome = { ...entrada().nome, casouPadrao: false, projeto, revisao: campo(1), avisos: [{ tipo: "sigla_desconhecida" as const, texto: "x" }] };
    expect(problemasDoEnvio(entrada({ codigoProjeto: "260031", nomenclaturaLivre: true, nome }))).toEqual([]);
    expect(problemasDoEnvio(entrada({ nomenclaturaLivre: true, nome, arquivos: [{ nome: "a.dwg", ext: "dwg", hash: "h" }] }))).toEqual([
      MOTIVO_DESENHO_SEM_PDF,
    ]);
  });

  it("desenho sem PDF: DWG, DXF ou RVT exigem o PDF", () => {
    for (const ext of ["dwg", "DXF", "rvt"]) {
      expect(problemasDoEnvio(entrada({ arquivos: [{ nome: `a.${ext}`, ext, hash: "h" }] }))).toContain(MOTIVO_DESENHO_SEM_PDF);
    }
  });

  it("sem desenho não exige PDF: planilha de quantitativos, memorial em Word", () => {
    expect(problemasDoEnvio(entrada({ arquivos: [{ nome: "q.xls", ext: "xls", hash: "h" }] }))).toEqual([]);
    expect(problemasDoEnvio(entrada({ arquivos: [{ nome: "q.xlsx", ext: "xlsx", hash: "h" }, { nome: "m.docx", ext: "docx", hash: "h2" }] }))).toEqual([]);
  });

  it("revisão sem nenhum arquivo", () => {
    expect(problemasDoEnvio(entrada({ arquivos: [] }))).toEqual(["A revisão não tem arquivo para enviar."]);
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

// Quadro sem âncora "EMISSÃO INICIAL": o número da linha é a revisão (modelo B/C).
const quadro = (...textos: string[]): QuadroRevisao => ({ linhas: textos.map((texto, numero) => ({ numero, texto })) });

describe("descricaoDoCarimbo", () => {
  const base = { numero: 2, revisaoDoCarimbo: 1, nomenclaturaLivre: false };

  it("linha da revisão com texto específico", () => {
    expect(descricaoDoCarimbo({ ...base, quadro: quadro("EMISSÃO INICIAL", "ALTERAÇÃO DAS LAJES") })).toEqual({
      tipo: "lida",
      texto: "ALTERAÇÃO DAS LAJES",
    });
  });

  it("linha da revisão ausente ou vazia", () => {
    expect(descricaoDoCarimbo({ ...base, quadro: quadro("EMISSÃO INICIAL") })).toEqual({ tipo: "vazia" });
    expect(descricaoDoCarimbo({ ...base, quadro: quadro("EMISSÃO INICIAL", "") })).toEqual({ tipo: "vazia" });
  });

  it("linha só com texto genérico", () => {
    expect(descricaoDoCarimbo({ ...base, quadro: quadro("EMISSÃO INICIAL", "REVISÕES") })).toEqual({ tipo: "generica", texto: "REVISÕES" });
  });

  it("sem quadro", () => {
    expect(descricaoDoCarimbo({ ...base, quadro: null })).toEqual({ tipo: "sem_quadro" });
  });

  it("nomenclatura livre: a linha é a do REVISÃO: do carimbo, não a do sistema", () => {
    const q = quadro("EMISSÃO INICIAL", "AJUSTE DAS COTAS", "REVISÃO DE DETALHES", "");
    expect(descricaoDoCarimbo({ numero: 2, quadro: q, revisaoDoCarimbo: 2, nomenclaturaLivre: true })).toEqual({
      tipo: "lida",
      texto: "REVISÃO DE DETALHES",
    });
  });

  it("nomenclatura livre sem REVISÃO: lido: a última linha com texto", () => {
    const q = quadro("EMISSÃO INICIAL", "AJUSTE DAS COTAS", "REVISÃO DE DETALHES", "");
    expect(descricaoDoCarimbo({ numero: 2, quadro: q, revisaoDoCarimbo: null, nomenclaturaLivre: true })).toEqual({
      tipo: "lida",
      texto: "REVISÃO DE DETALHES",
    });
  });
});

describe("problemasDoEnvio — descrição lida do carimbo", () => {
  const r01 = (p: Partial<EntradaEnvio>) => problemasDoEnvio(entrada({ numero: 2, ...p }));

  it("lida no carimbo: dispensa a descrição digitada", () => {
    expect(r01({ carimbo: { tipo: "lida", texto: "ALTERAÇÃO DAS LAJES" } })).toEqual([]);
  });

  it("linha vazia no carimbo bloqueia", () => {
    expect(motivoDescricaoVazia("R01")).toBe("Preencha no carimbo o que mudou nesta revisão (R01).");
    expect(r01({ carimbo: { tipo: "vazia" } })).toContain(motivoDescricaoVazia("R01"));
  });

  it("texto genérico no carimbo bloqueia", () => {
    expect(motivoDescricaoGenerica("REVISÕES")).toBe(
      "A descrição no carimbo (REVISÕES) não diz o que mudou. Escreva no carimbo o que foi alterado.",
    );
    expect(r01({ carimbo: { tipo: "generica", texto: "REVISÕES" } })).toContain(motivoDescricaoGenerica("REVISÕES"));
  });

  it("contestada: vale a descrição digitada", () => {
    expect(r01({ carimbo: { tipo: "vazia" }, contestada: true, descricao: "Ajuste da laje L3" })).toEqual([]);
    expect(r01({ carimbo: { tipo: "generica", texto: "REVISÕES" }, contestada: true, descricao: "Ajuste da laje L3" })).toEqual([]);
    expect(r01({ carimbo: { tipo: "lida", texto: "X" }, contestada: true, descricao: "" })).toEqual(["Descreva o que mudou nesta revisão."]);
  });

  it("contestada com texto genérico também bloqueia", () => {
    expect(r01({ carimbo: { tipo: "vazia" }, contestada: true, descricao: "Revisões" })).toContain(MOTIVO_DESCRICAO_DIGITADA_GENERICA);
  });

  it("sem quadro: campo digitado de hoje", () => {
    expect(r01({ carimbo: { tipo: "sem_quadro" }, descricao: "" })).toEqual(["Descreva o que mudou nesta revisão."]);
    expect(r01({ carimbo: { tipo: "sem_quadro" }, descricao: "Ajustes gerais" })).toEqual([MOTIVO_DESCRICAO_DIGITADA_GENERICA]);
    expect(r01({ carimbo: { tipo: "sem_quadro" }, descricao: "Ajuste da laje L3" })).toEqual([]);
  });

  it("sem PDF: regra de hoje, mais o genérico", () => {
    expect(r01({ carimbo: null, descricao: null })).toEqual(["Descreva o que mudou nesta revisão."]);
    expect(r01({ carimbo: null, descricao: "Revisão" })).toEqual([MOTIVO_DESCRICAO_DIGITADA_GENERICA]);
    expect(r01({ carimbo: null, descricao: "Ajuste da laje L3" })).toEqual([]);
  });

  it("R00 nunca tem problema de descrição", () => {
    for (const carimbo of [{ tipo: "vazia" as const }, { tipo: "generica" as const, texto: "REVISÕES" }, { tipo: "sem_quadro" as const }, null]) {
      expect(problemasDoEnvio(entrada({ numero: 1, carimbo }))).toEqual([]);
      expect(problemasDoEnvio(entrada({ numero: 1, carimbo, contestada: true, descricao: "Revisões" }))).toEqual([]);
    }
  });
});

describe("descrição do carimbo nas amostras reais (aceite do spec §3)", () => {
  const amostras = quadros as { arquivo: string; itens: ItemTextoPdf[] }[];
  const daAmostra = (prefixo: string) => {
    const leitura = lerCarimbo(amostras.find((a) => a.arquivo.startsWith(prefixo))!.itens);
    return descricaoDoCarimbo({ numero: 2, quadro: leitura.quadro, revisaoDoCarimbo: leitura.revisao, nomenclaturaLivre: false });
  };

  it("2525 (R01): lida", () => {
    expect(daAmostra("2525-EST-EX-DTC-433")).toEqual({ tipo: "lida", texto: "ALTERAÇÃO DAS LAJES DO MEZANINO" });
  });
  it("2558_HDR (R01): só a emissão inicial → vazia", () => {
    expect(daAmostra("2558_HDR")).toEqual({ tipo: "vazia" });
  });
  it("2558_CLM (R01): genérica", () => {
    expect(daAmostra("2558_CLM")).toEqual({ tipo: "generica", texto: "REVISÕES" });
  });
});
