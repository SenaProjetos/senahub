import { describe, expect, it } from "vitest";
import { CAMINHO_DOC_RH, faixaParaAvisar, situacaoValidade } from "./regras";

const HOJE = "2026-10-08";

describe("situacaoValidade", () => {
  it("sem validade nunca alerta", () => {
    expect(situacaoValidade(null, HOJE)).toEqual({ situacao: "sem_validade", dias: null });
  });
  it("ok, vence em breve (≤60) e vencido", () => {
    expect(situacaoValidade("2027-01-01", HOJE).situacao).toBe("ok");
    expect(situacaoValidade("2026-11-01", HOJE)).toEqual({ situacao: "vence_em_breve", dias: 24 });
    expect(situacaoValidade("2026-10-07", HOJE)).toEqual({ situacao: "vencido", dias: -1 });
  });
});

describe("faixaParaAvisar", () => {
  it("documento sem validade não gera alerta", () => {
    expect(faixaParaAvisar(null, HOJE, null)).toBeNull();
  });
  it("longe do vencimento não avisa", () => {
    expect(faixaParaAvisar("2027-01-01", HOJE, null)).toBeNull();
  });
  it("avisa a faixa mais apertada alcançada, uma vez por faixa", () => {
    expect(faixaParaAvisar("2026-11-01", HOJE, null)).toBe(30); // 24 dias → faixa 30
    expect(faixaParaAvisar("2026-11-01", HOJE, 30)).toBeNull(); // já avisado nesta faixa
    expect(faixaParaAvisar("2026-11-01", HOJE, 60)).toBe(30); // avisado na de 60, agora entra na de 30
    expect(faixaParaAvisar("2026-10-12", HOJE, 30)).toBe(7);
  });
  it("vencido avisa uma vez (faixa 0)", () => {
    expect(faixaParaAvisar("2026-10-01", HOJE, 7)).toBe(0);
    expect(faixaParaAvisar("2026-10-01", HOJE, 0)).toBeNull();
  });
  it("pulou faixas (cadastrado já perto do vencimento): avisa só a atual", () => {
    expect(faixaParaAvisar("2026-10-10", HOJE, null)).toBe(7);
  });
});

describe("CAMINHO_DOC_RH", () => {
  it("aceita só o formato que a rota gera", () => {
    expect(CAMINHO_DOC_RH.test("rh/funcionarios/0123456789abcdef01234567.pdf")).toBe(true);
    expect(CAMINHO_DOC_RH.test("rh/funcionarios/../holerites/x.pdf")).toBe(false);
    expect(CAMINHO_DOC_RH.test("projetos/abc/arquivo.pdf")).toBe(false);
  });
});
