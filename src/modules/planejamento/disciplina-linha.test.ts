import { describe, expect, it } from "vitest";
import { disciplinaParaLinhaNova, divergenciasDeDisciplina, type NoDisciplina } from "./disciplina-linha";

describe("disciplinaParaLinhaNova", () => {
  it("sem pai: nasce sem disciplina e sem fase", () => {
    expect(disciplinaParaLinhaNova(null)).toEqual({ disciplinaId: null, etapaId: null });
  });

  it("herda disciplina e fase do pai", () => {
    expect(disciplinaParaLinhaNova({ disciplinaId: "hid", etapaId: "bs" })).toEqual({ disciplinaId: "hid", etapaId: "bs" });
  });

  it("pai com fase mas sem disciplina: a fase não vai (fase exige disciplina)", () => {
    expect(disciplinaParaLinhaNova({ disciplinaId: null, etapaId: "bs" })).toEqual({ disciplinaId: null, etapaId: null });
  });
});

const no = (id: string, parentId: string | null, disciplinaId: string | null, etapaId: string | null = null): NoDisciplina => ({
  id,
  parentId,
  disciplinaId,
  etapaId,
});

describe("divergenciasDeDisciplina", () => {
  const arvore = [
    no("F", null, null, "bs"),
    no("H", "F", "hid", "bs"),
    no("M", "H", "hid"),
    no("V", "H", "ele"),
    no("G", "H", null),
    no("X", "G", null),
    no("Y", "G", "ele"),
    no("R", "F", "ele"),
  ];

  it("acusa a linha cuja disciplina difere da do ancestral mais próximo com disciplina", () => {
    expect(divergenciasDeDisciplina(arvore)).toEqual([
      { tarefaId: "V", atualId: "ele", esperadaId: "hid", etapaEsperadaId: "bs" },
      { tarefaId: "Y", atualId: "ele", esperadaId: "hid", etapaEsperadaId: "bs" },
    ]);
  });

  it("linha sem disciplina nunca é achado", () => {
    expect(divergenciasDeDisciplina(arvore).map((d) => d.tarefaId)).not.toContain("X");
  });

  it("linha sem ancestral com disciplina não diverge", () => {
    expect(divergenciasDeDisciplina(arvore).map((d) => d.tarefaId)).not.toContain("R");
  });

  it("ciclo de parentId não trava e não acusa", () => {
    expect(divergenciasDeDisciplina([no("A", "B", "x"), no("B", "A", "y")])).toEqual([]);
  });

  it("parentId para id ausente é tratado como raiz", () => {
    expect(divergenciasDeDisciplina([no("A", "fantasma", "x")])).toEqual([]);
  });
});
