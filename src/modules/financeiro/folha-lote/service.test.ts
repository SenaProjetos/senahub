import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { recalcularTotalFolha, resumirLotes, RESUMO_LOTE_VAZIO } from "@/modules/financeiro/folha-lote/service";

// `recalcularTotalFolha` recebe o `tx` por parâmetro — um objeto com os dois métodos que ela
// usa basta; não precisa de `vi.mock` do módulo do prisma.
function txFalso(soma: number | null) {
  const aggregate = vi.fn().mockResolvedValue({ _sum: { valor: soma } });
  const update = vi.fn().mockResolvedValue({});
  const tx = { pagamentoProjetista: { aggregate }, folhaProjetista: { update } } as unknown as Prisma.TransactionClient;
  return { tx, aggregate, update };
}

describe("recalcularTotalFolha", () => {
  it("soma só os não cancelados do lote e grava no total", async () => {
    const { tx, aggregate, update } = txFalso(1500);
    await recalcularTotalFolha(tx, "f1");
    expect(aggregate).toHaveBeenCalledWith({
      where: { folhaId: "f1", status: { not: "cancelado" } },
      _sum: { valor: true },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { total: 1500 } });
  });

  it("lote sem pagamento vivo (soma null) grava 0, não null", async () => {
    const { tx, update } = txFalso(null);
    await recalcularTotalFolha(tx, "f1");
    expect(update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { total: 0 } });
  });
});

const porStatus = (folhaId: string | null, status: string, n: number) => ({ folhaId, status, _count: { _all: n } });
const zerados = (folhaId: string | null, n: number) => ({ folhaId, _count: { _all: n } });

describe("resumirLotes", () => {
  it("conta por lote e deriva pagáveis = pendentes − sem valor", () => {
    const r = resumirLotes([porStatus("f1", "pendente", 3), porStatus("f1", "pago", 2)], [zerados("f1", 1)]);
    expect(r.get("f1")).toEqual({ qtd: 5, pagos: 2, todosPagos: false, semValor: 1, pagaveis: 2 });
  });

  it("lote só com pendentes zerados: pagáveis 0 — o 'Pagar lote' some", () => {
    const r = resumirLotes([porStatus("f2", "pendente", 2)], [zerados("f2", 2)]);
    expect(r.get("f2")).toMatchObject({ semValor: 2, pagaveis: 0, todosPagos: false });
  });

  it("todos pagos marca todosPagos e não deixa nada pagável", () => {
    const r = resumirLotes([porStatus("f3", "pago", 4)], []);
    expect(r.get("f3")).toEqual({ qtd: 4, pagos: 4, todosPagos: true, semValor: 0, pagaveis: 0 });
  });

  it("cancelado ainda preso ao lote conta em qtd e impede todosPagos", () => {
    const r = resumirLotes([porStatus("f4", "pago", 2), porStatus("f4", "cancelado", 1)], []);
    expect(r.get("f4")).toMatchObject({ qtd: 3, pagos: 2, todosPagos: false });
  });

  it("linha de groupBy sem folhaId (pagamento fora de lote) é ignorada", () => {
    const r = resumirLotes([porStatus(null, "pendente", 7), porStatus("f5", "pendente", 1)], [zerados(null, 3)]);
    expect([...r.keys()]).toEqual(["f5"]);
    expect(r.get("f5")).toMatchObject({ qtd: 1, semValor: 0, pagaveis: 1 });
  });

  it("contagem inconsistente (mais zerados que pendentes) não vira pagável negativo", () => {
    const r = resumirLotes([porStatus("f6", "pendente", 1)], [zerados("f6", 2)]);
    expect(r.get("f6")?.pagaveis).toBe(0);
  });

  it("lote sem linha nenhuma fica fora do mapa — o chamador usa o vazio", () => {
    expect(resumirLotes([], []).get("x") ?? RESUMO_LOTE_VAZIO).toEqual(RESUMO_LOTE_VAZIO);
  });
});
