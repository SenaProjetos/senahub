import { describe, expect, it } from "vitest";
import {
  diasParaVencimento,
  statusCertidao,
  panoramaCompliance,
  tiposObrigatoriosFaltantes,
  type CertidaoParaPanorama,
  type CertidaoParaChecklist,
  type TipoObrigatorio,
} from "./service";

const HOJE = "2026-08-05";

describe("diasParaVencimento", () => {
  it("positivo quando a validade está no futuro", () => {
    expect(diasParaVencimento("2026-08-15", HOJE)).toBe(10);
  });
  it("negativo quando já venceu", () => {
    expect(diasParaVencimento("2026-08-01", HOJE)).toBe(-4);
  });
  it("zero no próprio dia", () => {
    expect(diasParaVencimento(HOJE, HOJE)).toBe(0);
  });
});

describe("statusCertidao", () => {
  it("vencida quando dias < 0", () => {
    expect(statusCertidao("2026-08-01", HOJE)).toBe("vencida");
  });
  it("vence_em_breve até 30 dias", () => {
    expect(statusCertidao("2026-09-04", HOJE)).toBe("vence_em_breve");
  });
  it("ok acima de 30 dias", () => {
    expect(statusCertidao("2026-09-06", HOJE)).toBe("ok");
  });
  it("no dia exato da validade ainda é vence_em_breve (não vencida)", () => {
    expect(statusCertidao(HOJE, HOJE)).toBe("vence_em_breve");
  });
});

describe("panoramaCompliance", () => {
  it("conta vencidas/vence_em_breve/ok e sem arquivo separadamente", () => {
    const certidoes: CertidaoParaPanorama[] = [
      { id: "1", tipoId: "t1", validade: "2026-08-01", arquivoPath: "a.pdf" }, // vencida, com arquivo
      { id: "2", tipoId: "t1", validade: "2026-08-10", arquivoPath: null }, // vence_em_breve, sem arquivo
      { id: "3", tipoId: "t2", validade: "2027-01-01", arquivoPath: "c.pdf" }, // ok
      { id: "4", tipoId: "t2", validade: "2026-08-01", arquivoPath: null }, // vencida, sem arquivo
    ];
    expect(panoramaCompliance(certidoes, HOJE)).toEqual({
      vencidas: 2,
      venceEmBreve: 1,
      ok: 1,
      semArquivo: 2,
    });
  });
});

describe("tiposObrigatoriosFaltantes", () => {
  const tipos: TipoObrigatorio[] = [
    { id: "t1", nome: "CND Federal", obrigatoria: true },
    { id: "t2", nome: "FGTS", obrigatoria: true },
    { id: "t3", nome: "Opcional", obrigatoria: false },
  ];

  it("sinaliza tipo obrigatório nunca registrado", () => {
    const certidoes: CertidaoParaChecklist[] = [{ tipoId: "t2", validade: "2027-01-01" }];
    expect(tiposObrigatoriosFaltantes(tipos, certidoes, HOJE)).toEqual([tipos[0]]);
  });

  it("sinaliza tipo obrigatório cuja única certidão está vencida", () => {
    const certidoes: CertidaoParaChecklist[] = [
      { tipoId: "t1", validade: "2026-08-01" },
      { tipoId: "t2", validade: "2027-01-01" },
    ];
    expect(tiposObrigatoriosFaltantes(tipos, certidoes, HOJE)).toEqual([tipos[0]]);
  });

  it("não sinaliza tipo opcional faltando", () => {
    expect(tiposObrigatoriosFaltantes(tipos, [{ tipoId: "t1", validade: "2027-01-01" }, { tipoId: "t2", validade: "2027-01-01" }], HOJE)).toEqual([]);
  });
});
