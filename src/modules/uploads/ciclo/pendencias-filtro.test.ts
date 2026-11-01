import { describe, expect, it } from "vitest";
import { contarPendencias, filtrarPendencias, type LinhaFiltravel } from "./pendencias-filtro";

const l = (p: Partial<LinhaFiltravel>): LinhaFiltravel => ({ tipo: "publicada_com_lixeira", projetoId: "p1", documentoNome: "PLANTA BAIXA", dispensa: null, ...p });
const linhas: LinhaFiltravel[] = [
  l({}),
  l({ tipo: "analise_parada", projetoId: "p2", documentoNome: "MEMORIAL" }),
  l({ dispensa: { x: 1 }, documentoNome: "DISPENSADA" }),
  l({ tipo: "corrigida", documentoNome: "CORRIGIDA" }),
];
const f = { tipo: "todas", projetoId: "", q: "", mostrarDispensadas: false };

describe("filtrarPendencias", () => {
  it("padrão: só abertas (sem dispensadas e sem corrigidas)", () => {
    expect(filtrarPendencias(linhas, f).map((x) => x.documentoNome)).toEqual(["PLANTA BAIXA", "MEMORIAL"]);
  });
  it("mostrar dispensadas inclui as dispensadas, nunca as corrigidas", () => {
    expect(filtrarPendencias(linhas, { ...f, mostrarDispensadas: true }).map((x) => x.documentoNome)).toEqual(["PLANTA BAIXA", "MEMORIAL", "DISPENSADA"]);
  });
  it("chip de tipo, projeto e busca combinam", () => {
    expect(filtrarPendencias(linhas, { ...f, tipo: "analise_parada" }).map((x) => x.documentoNome)).toEqual(["MEMORIAL"]);
    expect(filtrarPendencias(linhas, { ...f, projetoId: "p2" }).map((x) => x.documentoNome)).toEqual(["MEMORIAL"]);
    expect(filtrarPendencias(linhas, { ...f, q: "  planta " }).map((x) => x.documentoNome)).toEqual(["PLANTA BAIXA"]);
  });
  it("chip das corrigidas mostra só as corrigidas", () => {
    expect(filtrarPendencias(linhas, { ...f, tipo: "corrigida" }).map((x) => x.documentoNome)).toEqual(["CORRIGIDA"]);
  });
});

describe("contarPendencias", () => {
  it("conta abertas por tipo e as corrigidas à parte; dispensada não entra", () => {
    expect(contarPendencias(linhas)).toEqual({ todas: 2, publicada_com_lixeira: 1, analise_parada: 1, duas_publicadas: 0, corrigida: 1 });
  });
});
