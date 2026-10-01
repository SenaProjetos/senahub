import { describe, expect, it } from "vitest";
import { escreverRascunho, lerRascunho, RASCUNHO_VAZIO, type Rascunho } from "@/modules/financeiro/planejador/rascunho";

describe("rascunho da simulação na sessão do navegador", () => {
  const r: Rascunho = {
    eixos: { entradas: "confirmadas", compromissos: "p1p2" },
    ajustes: [
      { tipo: "REPROGRAMAR_DATA", eventoId: "abc", data: "2026-10-20" },
      { tipo: "INCLUIR", id: "x1", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: 2_000_000, data: "2026-10-16", descricao: "Distribuição de lucros" } },
    ],
  };

  it("ida e volta sem perda", () => {
    expect(lerRascunho(escreverRascunho(r))).toEqual(r);
    expect(lerRascunho(escreverRascunho(RASCUNHO_VAZIO))).toEqual(RASCUNHO_VAZIO);
  });

  it("nada guardado, JSON quebrado ou formato antigo viram null", () => {
    expect(lerRascunho(null)).toBeNull();
    expect(lerRascunho("")).toBeNull();
    expect(lerRascunho("{quebrado")).toBeNull();
    expect(lerRascunho(JSON.stringify({ aj: {}, ex: [] }))).toBeNull();
  });

  it("recusa ajuste inválido (valor em reais quebrado, data fora do formato, tipo desconhecido)", () => {
    const mexido = (a: unknown) => JSON.stringify({ eixos: r.eixos, ajustes: [a] });
    const incluir = r.ajustes[1];
    if (incluir.tipo !== "INCLUIR") throw new Error("fixture");
    expect(lerRascunho(mexido({ tipo: "INCLUIR", id: "y", movimento: { ...incluir.movimento, valor: 10.5 } }))).toBeNull();
    expect(lerRascunho(mexido({ tipo: "REPROGRAMAR_DATA", eventoId: "a", data: "20/10/2026" }))).toBeNull();
    expect(lerRascunho(mexido({ tipo: "APAGAR_TUDO", eventoId: "a" }))).toBeNull();
  });
});
