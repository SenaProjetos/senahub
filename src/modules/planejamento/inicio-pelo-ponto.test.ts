import { describe, expect, it } from "vitest";
import { inicioPeloPonto } from "./inicio-pelo-ponto";

const HOJE = "2026-11-17";
const linha = (extra: Partial<Parameters<typeof inicioPeloPonto>[0]> = {}): Parameters<typeof inicioPeloPonto>[0] => ({
  tipoEap: "atv",
  ehResumo: false,
  status: "nin",
  progresso: 0,
  inicioReal: null,
  fimReal: null,
  ...extra,
});

describe("inicioPeloPonto", () => {
  it("a primeira hora apontada vira o início real e a tarefa passa a em andamento", () => {
    expect(inicioPeloPonto(linha(), "2026-11-10", HOJE)).toEqual({ inicioReal: "2026-11-10", status: "and" });
  });

  it("início real já informado vence: o ponto não mexe", () => {
    expect(inicioPeloPonto(linha({ inicioReal: "2026-11-12", status: "and" }), "2026-11-10", HOJE)).toBeNull();
  });

  it("com término real (concluída) não mexe", () => {
    expect(inicioPeloPonto(linha({ fimReal: "2026-11-12" }), "2026-11-10", HOJE)).toBeNull();
  });

  it("concluída sem término real não é consertada pelo ponto", () => {
    expect(inicioPeloPonto(linha({ status: "con", progresso: 100 }), "2026-11-10", HOJE)).toBeNull();
  });

  it("marco fica de fora (uma data só, a do término)", () => {
    expect(inicioPeloPonto(linha({ tipoEap: "mrc" }), "2026-11-10", HOJE)).toBeNull();
  });

  it("agrupamento fica de fora (as datas vêm de dentro)", () => {
    expect(inicioPeloPonto(linha({ ehResumo: true }), "2026-11-10", HOJE)).toBeNull();
  });

  it.each(["sus", "can", "arq"] as const)("%s não recebe data real", (status) => {
    expect(inicioPeloPonto(linha({ status }), "2026-11-10", HOJE)).toBeNull();
  });

  it("dia no futuro é recusado", () => {
    expect(inicioPeloPonto(linha(), "2026-11-18", HOJE)).toBeNull();
  });

  it("o próprio dia de hoje vale", () => {
    expect(inicioPeloPonto(linha(), HOJE, HOJE)).toEqual({ inicioReal: HOJE, status: "and" });
  });

  it.each(["agu", "rev", "apr", "blq"] as const)("%s ganha o início real e mantém o status", (status) => {
    expect(inicioPeloPonto(linha({ status }), "2026-11-10", HOJE)).toEqual({ inicioReal: "2026-11-10", status });
  });

  it("o % não muda (D19)", () => {
    const r = inicioPeloPonto(linha({ progresso: 40 }), "2026-11-10", HOJE);
    expect(r).not.toHaveProperty("progresso");
  });
});
