import { describe, expect, it } from "vitest";
import {
  detectarNovasRevisoes,
  mensagemNovasRevisoes,
  type ArquivoExistente,
} from "./revisao-nova";

const existentes: ArquivoExistente[] = [
  { nome: "planta.pdf", pacote: "A", pastaId: null, versao: 1 },
  { nome: "planta.pdf", pacote: "A", pastaId: null, versao: 2 },
  { nome: "modelo.rvt", pacote: "B", pastaId: null, versao: 1 },
  { nome: "laudo.docx", pacote: null, pastaId: "p1", versao: 3 },
];

describe("detectarNovasRevisoes", () => {
  it("acusa o nome repetido com a maior versão existente", () => {
    expect(detectarNovasRevisoes(["planta.pdf"], existentes, { pacote: "A" })).toEqual([
      { nome: "planta.pdf", versaoAtual: 2 },
    ]);
  });

  it("nome inédito não vira aviso", () => {
    expect(detectarNovasRevisoes(["corte.pdf"], existentes, { pacote: "A" })).toEqual([]);
  });

  it("mesmo nome em pacote diferente é arquivo diferente, não revisão", () => {
    // "modelo.rvt" existe no pacote B; enviar para o A é um arquivo novo.
    expect(detectarNovasRevisoes(["modelo.rvt"], existentes, { pacote: "A" })).toEqual([]);
    expect(detectarNovasRevisoes(["modelo.rvt"], existentes, { pacote: "B" })).toEqual([
      { nome: "modelo.rvt", versaoAtual: 1 },
    ]);
  });

  it("compara por pasta quando o destino é uma PastaProjeto", () => {
    expect(detectarNovasRevisoes(["laudo.docx"], existentes, { pastaId: "p1" })).toEqual([
      { nome: "laudo.docx", versaoAtual: 3 },
    ]);
    expect(detectarNovasRevisoes(["laudo.docx"], existentes, { pastaId: "p2" })).toEqual([]);
  });

  it("arquivo de pacote não colide com arquivo de pasta de mesmo nome", () => {
    expect(detectarNovasRevisoes(["laudo.docx"], existentes, { pacote: "A" })).toEqual([]);
  });

  it("não repete o mesmo nome duas vezes na mesma seleção", () => {
    expect(detectarNovasRevisoes(["planta.pdf", "planta.pdf"], existentes, { pacote: "A" })).toHaveLength(1);
  });

  it("destino sem nenhum arquivo devolve lista vazia", () => {
    expect(detectarNovasRevisoes(["planta.pdf"], [], { pacote: "A" })).toEqual([]);
  });

  it("distingue vários arquivos numa seleção mista", () => {
    const r = detectarNovasRevisoes(["planta.pdf", "corte.pdf"], existentes, { pacote: "A" });
    expect(r.map((x) => x.nome)).toEqual(["planta.pdf"]);
  });
});

describe("mensagemNovasRevisoes", () => {
  it("sem revisão detectada não gera mensagem", () => {
    expect(mensagemNovasRevisoes([])).toBe("");
  });

  it("uma revisão cita nome e a versão que será criada", () => {
    const msg = mensagemNovasRevisoes([{ nome: "planta.pdf", versaoAtual: 2 }]);
    expect(msg).toContain("planta.pdf");
    expect(msg).toContain("v2");
    expect(msg).toContain("v3");
  });

  it("várias revisões usam a forma resumida no plural", () => {
    const msg = mensagemNovasRevisoes([
      { nome: "a.pdf", versaoAtual: 1 },
      { nome: "b.pdf", versaoAtual: 4 },
    ]);
    expect(msg).toContain("2 arquivos");
  });
});
