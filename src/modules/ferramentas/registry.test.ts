import { describe, it, expect } from "vitest";
import { Square } from "lucide-react";
import { FERRAMENTAS, ferramentaVisivel, situacaoValidacao, type FerramentaMeta } from "./registry";

const base: FerramentaMeta = {
  key: "x",
  nome: "X",
  descricao: "x",
  disciplina: "Elétrico",
  tipo: "rapida",
  exportaveis: [],
  icon: Square,
};
const validacao = { por: "Eng. Fulano CREA 123", em: "2026-11-10", versaoCalc: 1, ficha: "docs/engenharia/validacao/x.md" };

describe("situacaoValidacao", () => {
  it("ferramenta que não exige validação não é afetada", () => {
    expect(situacaoValidacao(base)).toBe("nao_exige");
  });

  it("exige e não tem registro → em validação", () => {
    expect(situacaoValidacao({ ...base, exigeValidacao: true })).toBe("em_validacao");
  });

  it("exige e foi validada na versão atual → validada", () => {
    expect(situacaoValidacao({ ...base, exigeValidacao: true, validacao })).toBe("validada");
  });

  it("mudou a versão do motor depois da validação → volta a em validação", () => {
    expect(situacaoValidacao({ ...base, exigeValidacao: true, validacao, versaoCalc: 2 })).toBe("em_validacao");
  });
});

describe("ferramentaVisivel", () => {
  const emValidacao = { ...base, exigeValidacao: true };

  it("em validação só aparece para quem gere as ferramentas", () => {
    expect(ferramentaVisivel(emValidacao, false)).toBe(false);
    expect(ferramentaVisivel(emValidacao, true)).toBe(true);
  });

  it("ferramenta validada ou sem exigência aparece para todos", () => {
    expect(ferramentaVisivel(base, false)).toBe(true);
    expect(ferramentaVisivel({ ...emValidacao, validacao }, false)).toBe(true);
  });
});

describe("catálogo", () => {
  it("chaves são únicas", () => {
    const chaves = FERRAMENTAS.map((f) => f.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("as calculadoras de instalações exigem validação do engenheiro", () => {
    for (const key of ["reservatorios", "corrente-demanda", "bomba-recalque", "bomba-piscina", "esgoto-infiltracao"]) {
      const f = FERRAMENTAS.find((x) => x.key === key);
      expect(f?.exigeValidacao, key).toBe(true);
    }
  });

  it("registro de validação, quando existe, é da versão atual do motor e tem ficha", () => {
    for (const f of FERRAMENTAS.filter((x) => x.validacao)) {
      expect(f.validacao?.versaoCalc, f.key).toBe(f.versaoCalc ?? 1);
      expect(f.validacao?.ficha, f.key).toMatch(/^docs\/engenharia\/validacao\//);
      expect(f.validacao?.em, f.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
