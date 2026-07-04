import { describe, it, expect } from "vitest";
import { revisaoLabel, codigoPrancha, foraDoPadrao, parsePranchaFilename } from "./codigo";

describe("revisaoLabel", () => {
  it("formata com dois dígitos", () => {
    expect(revisaoLabel(0)).toBe("R00");
    expect(revisaoLabel(5)).toBe("R05");
    expect(revisaoLabel(12)).toBe("R12");
  });
  it("trata negativo como 0", () => {
    expect(revisaoLabel(-3)).toBe("R00");
  });
});

describe("codigoPrancha", () => {
  const base = {
    projetoCodigo: "260142",
    siglaDisciplina: "ELE",
    fase: "EXE",
    numeracao: 1,
    tipo: "PL",
    revisao: 0,
  };

  it("compõe sem sufixo de revisão quando revisão = 0", () => {
    expect(codigoPrancha(base)).toBe("260142-ELE-EXE-0001-PL");
  });

  it("acrescenta -Rnn quando revisão > 0", () => {
    expect(codigoPrancha({ ...base, revisao: 2 })).toBe("260142-ELE-EXE-0001-PL-R02");
  });

  it("preenche numeração com 4 dígitos", () => {
    expect(codigoPrancha({ ...base, numeracao: 42 })).toBe("260142-ELE-EXE-0042-PL");
  });

  it("usa ??? quando a sigla da disciplina é nula", () => {
    expect(codigoPrancha({ ...base, siglaDisciplina: null })).toBe("260142-???-EXE-0001-PL");
  });
});

describe("parsePranchaFilename", () => {
  it("extrai os campos de um nome no padrão, sem revisão", () => {
    expect(parsePranchaFilename("260142-ELE-EXE-0001-PL.pdf")).toEqual({
      codigoProjeto: "260142",
      especialidade: "ELE",
      fase: "EXE",
      numeracao: 1,
      tipo: "PL",
      revisao: null,
    });
  });

  it("aceita sufixo -Rnn", () => {
    expect(parsePranchaFilename("260142-ELE-EXE-0001-PL-R02.dwg")?.revisao).toBe(2);
  });

  it("aceita sufixo -RVnn", () => {
    expect(parsePranchaFilename("260142-ELE-EXE-0010-PL-RV3.pdf")?.revisao).toBe(3);
  });

  it("normaliza para maiúsculas", () => {
    expect(parsePranchaFilename("260142-ele-exe-0001-pl")?.especialidade).toBe("ELE");
  });

  it("retorna null para nomes fora do padrão", () => {
    expect(parsePranchaFilename("arquivo qualquer.pdf")).toBeNull();
    expect(parsePranchaFilename("260142-ELE-EXE-PL.pdf")).toBeNull(); // faltando numeração
  });
});

describe("foraDoPadrao", () => {
  it("usa o parser embutido quando não há regex custom", () => {
    expect(foraDoPadrao("260142-ELE-EXE-0001-PL-R02.pdf")).toBe(false);
    expect(foraDoPadrao("planta_qualquer.pdf")).toBe(true);
  });

  it("usa a regex custom quando informada", () => {
    expect(foraDoPadrao("ABC", "^[A-Z]+$")).toBe(false);
    expect(foraDoPadrao("abc123", "^[A-Z]+$")).toBe(true);
  });

  it("ignora a extensão ao aplicar a regex", () => {
    expect(foraDoPadrao("ABC.pdf", "^[A-Z]+$")).toBe(false);
  });

  it("não alerta quando a regex é inválida", () => {
    expect(foraDoPadrao("qualquer.pdf", "[")).toBe(false);
  });
});
