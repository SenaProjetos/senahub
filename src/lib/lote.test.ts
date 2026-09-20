import { describe, expect, it, vi } from "vitest";

import {
  TETO_LOTE,
  acimaDoTeto,
  executarEmLote,
  loteSemFalhas,
  motivoAcimaDoTeto,
  resumoDoLote,
  type RelatorioLote,
} from "./lote";

describe("executarEmLote", () => {
  it("roda uma vez por id, em ordem", async () => {
    const chamados: string[] = [];
    const r = await executarEmLote({
      ids: ["a", "b", "c"],
      executar: async (id) => {
        chamados.push(id);
        return { ok: true };
      },
    });
    expect(chamados).toEqual(["a", "b", "c"]);
    expect(r).toEqual({ total: 3, concluidos: 3, falhas: [] });
  });

  // O ponto do lote: um item que falha não pode levar os outros junto nem sumir do relatório.
  it("continua depois de uma falha e guarda o motivo do servidor", async () => {
    const r = await executarEmLote({
      ids: ["a", "b", "c"],
      executar: async (id) => (id === "b" ? { ok: false, error: "Lançamento conciliado." } : { ok: true }),
      rotulo: (id) => `Item ${id.toUpperCase()}`,
    });
    expect(r.concluidos).toBe(2);
    expect(r.falhas).toEqual([{ id: "b", rotulo: "Item B", motivo: "Lançamento conciliado." }]);
  });

  it("exceção inesperada vira falha daquele item, não do lote", async () => {
    const r = await executarEmLote({
      ids: ["a", "b"],
      executar: async (id) => {
        if (id === "a") throw new Error("rede caiu");
        return { ok: true };
      },
    });
    expect(r.concluidos).toBe(1);
    expect(r.falhas[0]).toMatchObject({ id: "a", motivo: "Falha inesperada." });
  });

  it("falha sem mensagem do servidor ainda diz alguma coisa", async () => {
    const r = await executarEmLote({ ids: ["a"], executar: async () => ({ ok: false }) });
    expect(r.falhas[0].motivo).toBe("Não foi possível concluir.");
  });

  it("informa o progresso a cada item", async () => {
    const progresso = vi.fn();
    await executarEmLote({ ids: ["a", "b"], executar: async () => ({ ok: true }), aoProgredir: progresso });
    expect(progresso.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("lista vazia não chama nada", async () => {
    const executar = vi.fn();
    const r = await executarEmLote({ ids: [], executar });
    expect(executar).not.toHaveBeenCalled();
    expect(r).toEqual({ total: 0, concluidos: 0, falhas: [] });
  });
});

describe("teto", () => {
  it("bate no limite combinado com o dono", () => {
    expect(TETO_LOTE).toBe(100);
    expect(acimaDoTeto(100)).toBe(false);
    expect(acimaDoTeto(101)).toBe(true);
    expect(motivoAcimaDoTeto(120)).toContain("120");
    expect(motivoAcimaDoTeto(120)).toContain("100");
  });
});

describe("resumoDoLote", () => {
  const rel = (concluidos: number, falhas: number, total = concluidos + falhas): RelatorioLote => ({
    total,
    concluidos,
    falhas: Array.from({ length: falhas }, (_, i) => ({ id: `f${i}`, rotulo: `f${i}`, motivo: "x" })),
  });

  it("sucesso no singular e no plural", () => {
    expect(resumoDoLote(rel(1, 0), ["documento", "documentos"], ["excluído", "excluídos"])).toBe("1 documento excluído.");
    expect(resumoDoLote(rel(3, 0), ["documento", "documentos"], ["excluído", "excluídos"])).toBe("3 documentos excluídos.");
  });

  it("sucesso parcial diz quantos foram e quantos falharam", () => {
    expect(resumoDoLote(rel(5, 2), ["documento", "documentos"], ["excluído", "excluídos"])).toBe(
      "5 de 7 documentos excluídos; 2 falharam.",
    );
    expect(resumoDoLote(rel(5, 1), ["documento", "documentos"], ["excluído", "excluídos"])).toContain("1 falhou");
  });

  it("falha total não finge que algo foi feito", () => {
    expect(resumoDoLote(rel(0, 3), ["documento", "documentos"], ["excluído", "excluídos"])).toBe(
      "Nenhum dos 3 documentos pôde ser processado.",
    );
    expect(resumoDoLote(rel(0, 1), ["documento", "documentos"], ["excluído", "excluídos"])).toContain("1 documento falhou");
  });

  it("loteSemFalhas separa o sucesso limpo do resto", () => {
    expect(loteSemFalhas(rel(3, 0))).toBe(true);
    expect(loteSemFalhas(rel(3, 1))).toBe(false);
  });
});
