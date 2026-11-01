import { describe, expect, it } from "vitest";
import { itensDoMesRateio } from "./acoes";
import { MSG_MES_EM_CURSO, MSG_SO_LEGADO } from "./regras";

const ids = (xs: ReturnType<typeof itensDoMesRateio>) => xs.map((x) => (x.tipo === "acao" ? x.id : x.tipo));

describe("itensDoMesRateio", () => {
  it("sem gestão de RH: só ver detalhes", () => {
    expect(ids(itensDoMesRateio({ fechado: true, calculo: "v2", mesTerminou: true, podeGerir: false }))).toEqual(["detalhes"]);
  });

  it("mês em curso: fechar vem desabilitado com a frase do servidor", () => {
    const [, fechar] = itensDoMesRateio({ fechado: false, calculo: null, mesTerminou: false, podeGerir: true });
    expect(fechar).toMatchObject({ id: "fechar", desabilitado: MSG_MES_EM_CURSO });
  });

  it("mês fechado no cálculo novo: reabrir é destrutivo e recalcular vem desabilitado", () => {
    const itens = itensDoMesRateio({ fechado: true, calculo: "v2", mesTerminou: true, podeGerir: true });
    expect(itens.find((i) => i.tipo === "acao" && i.id === "reabrir")).toMatchObject({ variant: "destructive" });
    expect(itens.find((i) => i.tipo === "acao" && i.id === "recalcular")).toMatchObject({ desabilitado: MSG_SO_LEGADO });
  });

  it("mês fechado no cálculo antigo: recalcular liberado", () => {
    const itens = itensDoMesRateio({ fechado: true, calculo: "legado", mesTerminou: true, podeGerir: true });
    const rec = itens.find((i) => i.tipo === "acao" && i.id === "recalcular");
    expect(rec && "desabilitado" in rec ? rec.desabilitado : undefined).toBeUndefined();
  });
});
