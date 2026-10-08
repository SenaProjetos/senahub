import { describe, expect, it } from "vitest";
import { itensDoCiclo, itensDoItemCiclo, itensDoModelo, MOTIVO_SO_ABERTO_CANCELA } from "./acoes";
import { MOTIVO_CICLO_FECHADO } from "./regras";

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);
const rh = { id: "rh", ehRh: true, ehTi: false };
const ti = { id: "ti", ehRh: false, ehTi: true };
const ana = { id: "ana", ehRh: false, ehTi: false };
const aberto = { status: "em_andamento" as const, userId: "ana" };

describe("itensDoItemCiclo", () => {
  it("aberto: concluir + evidência; feito: reabrir + evidência", () => {
    expect(ids(itensDoItemCiclo({ concluido: false, responsavel: "rh" }, aberto, rh))).toEqual(["concluir", "evidencia"]);
    expect(ids(itensDoItemCiclo({ concluido: true, responsavel: "rh" }, aberto, rh))).toEqual(["reabrir", "evidencia"]);
  });
  it("quem não responde pelo item não vê ação", () => {
    expect(itensDoItemCiclo({ concluido: false, responsavel: "rh" }, aberto, ti)).toEqual([]);
    expect(itensDoItemCiclo({ concluido: false, responsavel: "ti" }, aberto, ana)).toEqual([]);
  });
  it("a pessoa vê as ações dos itens dela", () => {
    expect(ids(itensDoItemCiclo({ concluido: false, responsavel: "pessoa" }, aberto, ana))).toEqual(["concluir", "evidencia"]);
  });
  it("ciclo cancelado: ações aparecem desabilitadas com o motivo", () => {
    const itens = itensDoItemCiclo({ concluido: false, responsavel: "rh" }, { ...aberto, status: "cancelado" }, rh);
    expect(itens.every((i) => i.tipo === "acao" && i.desabilitado === MOTIVO_CICLO_FECHADO)).toBe(true);
  });
});

describe("itensDoCiclo", () => {
  it("na fila do RH: abrir ficha + cancelar", () => {
    const itens = itensDoCiclo({ status: "em_andamento" }, { podeGerir: true, hrefFicha: "/rh/pessoas/ana" });
    expect(ids(itens)).toEqual(["ficha", "s1", "cancelar"]);
  });
  it("na ficha (sem link) e sem gestão: nada", () => {
    expect(itensDoCiclo({ status: "em_andamento" }, { podeGerir: false, hrefFicha: null })).toEqual([]);
  });
  it("cancelar só com ciclo em andamento", () => {
    const [cancelar] = itensDoCiclo({ status: "concluido" }, { podeGerir: true, hrefFicha: null });
    expect(cancelar).toMatchObject({ id: "cancelar", desabilitado: MOTIVO_SO_ABERTO_CANCELA, variant: "destructive" });
    expect(cancelar.tipo === "acao" && cancelar.confirmar).toBeTruthy();
  });
});

describe("itensDoModelo", () => {
  it("ativo arquiva, arquivado reativa", () => {
    expect(ids(itensDoModelo({ ativo: true }))).toEqual(["editar", "arquivar"]);
    expect(ids(itensDoModelo({ ativo: false }))).toEqual(["editar", "reativar"]);
  });
});
