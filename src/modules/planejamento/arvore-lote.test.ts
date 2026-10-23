import { describe, expect, it } from "vitest";
import {
  MOTIVO_IRMA_E_MARCO,
  MOTIVO_NIVEL_MAIS_ALTO,
  MOTIVO_PRIMEIRA_DO_NIVEL,
  MOTIVO_SEM_IRMA_ACIMA,
  MOTIVO_ULTIMA_DO_NIVEL,
  type NoArvore,
} from "./arvore-eap";
import { motivoParaAvancarEmLote, motivoParaMoverEmLote, ordemDeDocumento, planoDeRecuoEmLote, raizesDaSelecao } from "./arvore-lote";

const no = (id: string, parentId: string | null, ordem: number, tipoEap = "atv"): NoArvore => ({ id, parentId, ordem, tipoEap });

// P
//   X (com filha X1)   Y (com filha Y1)   Z   W
// Q (raiz, com Q1)
const nos = [
  no("P", null, 0),
  no("X", "P", 1),
  no("X1", "X", 2),
  no("Y", "P", 3),
  no("Y1", "Y", 4),
  no("Z", "P", 5),
  no("W", "P", 6),
  no("Q", null, 7),
  no("Q1", "Q", 8),
];

describe("ordemDeDocumento", () => {
  it("é a árvore em profundidade, irmãs por ordem e depois por id", () => {
    expect(ordemDeDocumento(nos)).toEqual(["P", "X", "X1", "Y", "Y1", "Z", "W", "Q", "Q1"]);
    // empate de `ordem`: o id desempata
    expect(ordemDeDocumento([no("b", null, 1), no("a", null, 1)])).toEqual(["a", "b"]);
  });
});

describe("raizesDaSelecao", () => {
  it("tira quem já vai junto com o agrupamento selecionado", () => {
    expect(raizesDaSelecao(nos, ["X", "X1", "Z"])).toEqual(["X", "Z"]);
  });

  it("devolve em ordem de documento, mesmo com a seleção embaralhada, e ignora id inexistente", () => {
    expect(raizesDaSelecao(nos, ["W", "fantasma", "Y", "X"])).toEqual(["X", "Y", "W"]);
  });
});

describe("planoDeRecuoEmLote", () => {
  it("irmãs seguidas viram irmãs sob a linha de cima — nunca uma dentro da outra", () => {
    // Y e Z recuam juntas para baixo de X (a irmã acima, que não está selecionada)
    expect(planoDeRecuoEmLote(nos, ["Y", "Z"])).toEqual({
      ok: true,
      movimentos: [
        { id: "Y", novoPaiId: "X" },
        { id: "Z", novoPaiId: "X" },
      ],
    });
  });

  it("a primeira irmã não tem quem a receba e o lote inteiro é recusado, dizendo qual", () => {
    expect(planoDeRecuoEmLote(nos, ["X"])).toEqual({ ok: false, motivo: MOTIVO_SEM_IRMA_ACIMA, linhaId: "X" });
    expect(planoDeRecuoEmLote(nos, ["X", "Y"])).toEqual({ ok: false, motivo: MOTIVO_SEM_IRMA_ACIMA, linhaId: "X" });
  });

  it("recusa quando a irmã de cima é um marco", () => {
    const comMarco = [no("P", null, 0), no("M", "P", 1, "mrc"), no("T", "P", 2)];
    expect(planoDeRecuoEmLote(comMarco, ["T"])).toEqual({ ok: false, motivo: MOTIVO_IRMA_E_MARCO, linhaId: "T" });
  });

  it("agrupamento e filha selecionados juntos: só o agrupamento recua (a filha vai com ele)", () => {
    expect(planoDeRecuoEmLote(nos, ["Y", "Y1"])).toEqual({ ok: true, movimentos: [{ id: "Y", novoPaiId: "X" }] });
  });

  it("seleção vazia ou só de ids que não existem não faz nada", () => {
    expect(planoDeRecuoEmLote(nos, [])).toMatchObject({ ok: false });
    expect(planoDeRecuoEmLote(nos, ["fantasma"])).toMatchObject({ ok: false });
  });

  it("raízes de pais diferentes são conferidas cada uma no seu nível", () => {
    // Z (sob P) recua para Y; Q1 (única filha de Q) não tem irmã acima
    expect(planoDeRecuoEmLote(nos, ["Z", "Q1"])).toEqual({ ok: false, motivo: MOTIVO_SEM_IRMA_ACIMA, linhaId: "Q1" });
  });
});

describe("motivoParaAvancarEmLote", () => {
  it("linhas de topo não sobem mais; a primeira delas é apontada", () => {
    expect(motivoParaAvancarEmLote(nos, ["P", "Q"])).toEqual({ motivo: MOTIVO_NIVEL_MAIS_ALTO, linhaId: "P" });
  });

  it("todas com pai: pode", () => {
    expect(motivoParaAvancarEmLote(nos, ["Y", "Z"])).toBeNull();
    expect(motivoParaAvancarEmLote(nos, ["X1", "Q1"])).toBeNull();
  });
});

describe("motivoParaMoverEmLote", () => {
  it("para cima com a primeira irmã entre as selecionadas: recusa", () => {
    expect(motivoParaMoverEmLote(nos, ["X", "Y"], -1)).toEqual({ motivo: MOTIVO_PRIMEIRA_DO_NIVEL, linhaId: "X" });
  });

  it("para baixo com a última irmã entre as selecionadas: recusa", () => {
    expect(motivoParaMoverEmLote(nos, ["Z", "W"], 1)).toEqual({ motivo: MOTIVO_ULTIMA_DO_NIVEL, linhaId: "W" });
  });

  it("no meio da lista pode; cada nível é conferido separado", () => {
    expect(motivoParaMoverEmLote(nos, ["Y", "Z"], -1)).toBeNull();
    expect(motivoParaMoverEmLote(nos, ["Y", "Z"], 1)).toBeNull();
    // X1 é filha única (primeira E última do nível dela): não sobe nem desce
    expect(motivoParaMoverEmLote(nos, ["Y", "X1"], -1)).toEqual({ motivo: MOTIVO_PRIMEIRA_DO_NIVEL, linhaId: "X1" });
  });
});
