import { describe, expect, it } from "vitest";
import {
  divergencia, mesesAbertos, motivoParaNaoFechar, motivoParaNaoReabrir, motivoParaNaoRecalcular,
  MSG_JA_FECHADO, MSG_MES_EM_CURSO, MSG_MOTIVO_CURTO, MSG_NAO_FECHADO, MSG_SO_LEGADO,
} from "./regras";
import { itensDoMesRateio } from "./acoes";

describe("fechar", () => {
  it("mês em curso e mês já fechado são recusados", () => {
    expect(motivoParaNaoFechar({ mesTerminou: false, fechado: false })).toBe(MSG_MES_EM_CURSO);
    expect(motivoParaNaoFechar({ mesTerminou: true, fechado: true })).toBe(MSG_JA_FECHADO);
    expect(motivoParaNaoFechar({ mesTerminou: true, fechado: false })).toBeNull();
  });
});

describe("reabrir", () => {
  it("só mês fechado, com motivo de 10+ caracteres (sem contar espaços nas pontas)", () => {
    expect(motivoParaNaoReabrir({ fechado: false, motivo: "ajuste de ponto da Ana" })).toBe(MSG_NAO_FECHADO);
    expect(motivoParaNaoReabrir({ fechado: true, motivo: "   curto   " })).toBe(MSG_MOTIVO_CURTO);
    expect(motivoParaNaoReabrir({ fechado: true, motivo: "ajuste de ponto da Ana" })).toBeNull();
  });
});

describe("recalcular", () => {
  it("só mês fechado no cálculo antigo", () => {
    expect(motivoParaNaoRecalcular({ fechado: true, calculo: "v2", motivo: "trazer encargos para setembro" })).toBe(MSG_SO_LEGADO);
    expect(motivoParaNaoRecalcular({ fechado: false, calculo: null, motivo: "trazer encargos para setembro" })).toBe(MSG_NAO_FECHADO);
    expect(motivoParaNaoRecalcular({ fechado: true, calculo: "legado", motivo: "x" })).toBe(MSG_MOTIVO_CURTO);
    expect(motivoParaNaoRecalcular({ fechado: true, calculo: "legado", motivo: "trazer encargos para setembro" })).toBeNull();
  });
});

describe("divergencia", () => {
  it("um centavo de diferença já conta como alterado", () => {
    expect(divergencia(100000, 100000)).toEqual({ diferencaCent: 0, alterado: false });
    expect(divergencia(100000, 100001)).toEqual({ diferencaCent: 1, alterado: true });
    expect(divergencia(100000, 90000)).toEqual({ diferencaCent: -10000, alterado: true });
  });
});

describe("mesesAbertos", () => {
  it("do corte até o mês pedido, sem os fechados, atravessando o ano", () => {
    expect(mesesAbertos({ corte: "2026-10", ate: "2027-02", fechados: ["2026-11", "2027-01"] })).toEqual(["2026-10", "2026-12", "2027-02"]);
  });
  it("corte depois do limite: nada", () => {
    expect(mesesAbertos({ corte: "2026-10", ate: "2026-09", fechados: [] })).toEqual([]);
  });
});

describe("itensDoMesRateio (ADR-0002)", () => {
  const ids = (xs: { id?: string }[]) => xs.map((x) => x.id);
  it("sem rh:gerir só há 'Ver detalhes'", () => {
    expect(ids(itensDoMesRateio({ fechado: true, calculo: "legado", mesTerminou: true, podeGerir: false }))).toEqual(["detalhes"]);
  });
  it("mês aberto e terminado: fechar habilitado", () => {
    const itens = itensDoMesRateio({ fechado: false, calculo: null, mesTerminou: true, podeGerir: true });
    expect(ids(itens)).toEqual(["detalhes", "fechar"]);
    expect(itens.find((i) => i.tipo === "acao" && i.id === "fechar")).not.toHaveProperty("desabilitado");
  });
  it("mês em curso: fechar desabilitado com o motivo", () => {
    const fechar = itensDoMesRateio({ fechado: false, calculo: null, mesTerminou: false, podeGerir: true }).find((i) => i.tipo === "acao" && i.id === "fechar");
    expect(fechar).toMatchObject({ desabilitado: MSG_MES_EM_CURSO });
  });
  it("mês fechado no v2: reabrir habilitado, recalcular desabilitado com o motivo", () => {
    const itens = itensDoMesRateio({ fechado: true, calculo: "v2", mesTerminou: true, podeGerir: true });
    expect(ids(itens)).toEqual(["detalhes", "reabrir", "recalcular"]);
    expect(itens.find((i) => i.tipo === "acao" && i.id === "recalcular")).toMatchObject({ desabilitado: MSG_SO_LEGADO });
  });
  it("mês fechado no legado: recalcular habilitado", () => {
    const rec = itensDoMesRateio({ fechado: true, calculo: "legado", mesTerminou: true, podeGerir: true }).find((i) => i.tipo === "acao" && i.id === "recalcular");
    expect(rec).not.toHaveProperty("desabilitado");
  });
});
