import { describe, expect, it } from "vitest";

import type { AcaoItem } from "@/components/ui/acoes";
import {
  ACAO_CANCELAR,
  ACAO_CONFIRMAR,
  ACAO_COPIAR_DESCRICAO,
  ACAO_DETALHES,
  ACAO_EDITAR,
  ACAO_ESTORNAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_BAIXAR,
  ACAO_LOTE_CANCELAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_REABRIR,
  MOTIVO_NENHUM_PREVISTO,
  MOTIVO_SO_CANCELADOS,
  itensDeLancamento,
  itensDeLoteLancamentos,
} from "./acoes";
import { MOTIVO_CONCILIADO, MOTIVO_PAGO_ESTORNE } from "./transicoes";

const ids = (itens: readonly AcaoItem[]) => itens.map((i) => i.id);
const achar = (itens: readonly AcaoItem[], id: string) => itens.find((i) => i.id === id);

describe("itensDeLancamento", () => {
  it("previsto: detalhes, editar, confirmar, copiar, cancelar e excluir", () => {
    expect(ids(itensDeLancamento({ status: "previsto", anexos: 0 }))).toEqual([
      ACAO_DETALHES,
      ACAO_EDITAR,
      ACAO_CONFIRMAR,
      ACAO_COPIAR_DESCRICAO,
      "sep-estado",
      ACAO_CANCELAR,
      ACAO_EXCLUIR,
    ]);
  });

  it("confirmar só aparece no previsto", () => {
    expect(achar(itensDeLancamento({ status: "confirmado", anexos: 0 }), ACAO_CONFIRMAR)).toBeUndefined();
  });

  it("cancelado: detalhes, copiar e reabrir — não edita, cancela nem exclui", () => {
    expect(ids(itensDeLancamento({ status: "cancelado", anexos: 0 }))).toEqual([ACAO_DETALHES, ACAO_COPIAR_DESCRICAO, ACAO_REABRIR]);
  });

  it("N1: pago estorna (com confirmação) e não cancela — a frase é a do servidor", () => {
    const itens = itensDeLancamento({ status: "confirmado", anexos: 0 });
    expect(achar(itens, ACAO_ESTORNAR)).toMatchObject({ desabilitado: undefined, confirmar: { rotuloConfirmar: "Estornar" } });
    expect(achar(itens, ACAO_CANCELAR)).toMatchObject({ desabilitado: MOTIVO_PAGO_ESTORNE });
    expect(achar(itensDeLancamento({ status: "previsto", anexos: 0 }), ACAO_ESTORNAR)).toBeUndefined();
  });

  it("N1: conciliado não estorna, não cancela nem exclui", () => {
    const itens = itensDeLancamento({ status: "confirmado", anexos: 0, conciliado: true });
    for (const id of [ACAO_ESTORNAR, ACAO_CANCELAR, ACAO_EXCLUIR]) {
      expect(achar(itens, id)).toMatchObject({ desabilitado: MOTIVO_CONCILIADO });
    }
  });

  it("mostra a contagem de anexos no rótulo de detalhes", () => {
    expect(achar(itensDeLancamento({ status: "previsto", anexos: 3 }), ACAO_DETALHES)).toMatchObject({ rotulo: "Detalhes (3)" });
    expect(achar(itensDeLancamento({ status: "previsto", anexos: 0 }), ACAO_DETALHES)).toMatchObject({ rotulo: "Detalhes" });
  });

  // Antes o excluir do "..." apagava direto, sem perguntar.
  it("excluir é destrutivo e pede confirmação (regra 4 da ADR-0002)", () => {
    const excluir = achar(itensDeLancamento({ status: "previsto", anexos: 0 }), ACAO_EXCLUIR);
    expect(excluir).toMatchObject({ variant: "destructive" });
    expect(excluir?.tipo === "acao" && excluir.confirmar?.titulo).toBeTruthy();
  });
});

describe("itensDeLoteLancamentos", () => {
  const previsto = { status: "previsto" };
  const cancelado = { status: "cancelado" };

  it("oferece baixar, cancelar e excluir", () => {
    expect(ids(itensDeLoteLancamentos([previsto, previsto]))).toEqual([
      ACAO_LOTE_BAIXAR,
      ACAO_LOTE_CANCELAR,
      ACAO_LOTE_EXCLUIR,
    ]);
  });

  it("baixar fica desabilitado, com o motivo, quando nenhum está previsto", () => {
    const itens = itensDeLoteLancamentos([{ status: "confirmado" }, cancelado]);
    expect(achar(itens, ACAO_LOTE_BAIXAR)).toMatchObject({ desabilitado: MOTIVO_NENHUM_PREVISTO });
  });

  it("baixar habilita se ao menos um estiver previsto", () => {
    const itens = itensDeLoteLancamentos([cancelado, previsto]);
    expect(achar(itens, ACAO_LOTE_BAIXAR)).not.toHaveProperty("desabilitado", MOTIVO_NENHUM_PREVISTO);
  });

  it("cancelar e excluir ficam desabilitados quando todos já estão cancelados", () => {
    const itens = itensDeLoteLancamentos([cancelado, cancelado]);
    expect(achar(itens, ACAO_LOTE_CANCELAR)).toMatchObject({ desabilitado: MOTIVO_SO_CANCELADOS });
    expect(achar(itens, ACAO_LOTE_EXCLUIR)).toMatchObject({ desabilitado: MOTIVO_SO_CANCELADOS });
  });

  it("excluir em lote é destrutivo e pede confirmação", () => {
    const excluir = achar(itensDeLoteLancamentos([previsto]), ACAO_LOTE_EXCLUIR);
    expect(excluir).toMatchObject({ variant: "destructive" });
    expect(excluir?.tipo === "acao" && excluir.confirmar?.titulo).toBeTruthy();
  });
});
