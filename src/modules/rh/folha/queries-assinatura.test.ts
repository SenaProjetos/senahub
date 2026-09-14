import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate de acesso do holerite (P4). Este `where` roda no layout de TODA rota do dashboard —
 * errar aqui tranca o sistema inteiro ou deixa passar quem devia assinar. Os testes checam o
 * filtro montado, não só o retorno.
 */

const mocks = vi.hoisted(() => ({
  holeriteFindFirst: vi.fn(),
  holeriteFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    holerite: { findFirst: mocks.holeriteFindFirst, findMany: mocks.holeriteFindMany },
  },
}));

const {
  precisaAssinarHolerite,
  holeritesPendentesDeAssinatura,
  ASSINATURA_HOLERITE_OBRIGATORIA_DESDE,
} = await import("./queries");

beforeEach(() => vi.clearAllMocks());

describe("precisaAssinarHolerite", () => {
  it("libera quem não tem holerite pendente nenhum", async () => {
    mocks.holeriteFindFirst.mockResolvedValue(null);
    expect(await precisaAssinarHolerite({ id: "u1" })).toBe(false);
  });

  it("tranca quem tem holerite de folha fechada sem assinar", async () => {
    mocks.holeriteFindFirst.mockResolvedValue({ id: "h1" });
    expect(await precisaAssinarHolerite({ id: "u1" })).toBe(true);
  });

  it("só considera folha FECHADA e a partir do corte, e holerite ainda não assinado", async () => {
    mocks.holeriteFindFirst.mockResolvedValue(null);
    await precisaAssinarHolerite({ id: "u1" });
    expect(mocks.holeriteFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        assinadoEm: null,
        folha: {
          status: "fechada",
          fechadaEm: { gte: ASSINATURA_HOLERITE_OBRIGATORIA_DESDE },
        },
      },
      select: { id: true },
    });
  });

  it("não carrega item nenhum — é consulta de layout, roda a cada navegação", async () => {
    mocks.holeriteFindFirst.mockResolvedValue(null);
    await precisaAssinarHolerite({ id: "u1" });
    const arg = mocks.holeriteFindFirst.mock.calls[0][0];
    expect(arg.select).toEqual({ id: true });
    expect(arg.include).toBeUndefined();
  });

  it("o corte é INCLUSIVO (gte): folha fechada exatamente no instante do corte é exigida", async () => {
    mocks.holeriteFindFirst.mockResolvedValue(null);
    await precisaAssinarHolerite({ id: "u1" });
    const filtro = mocks.holeriteFindFirst.mock.calls[0][0].where.folha.fechadaEm;
    expect(filtro).toHaveProperty("gte");
    expect(filtro).not.toHaveProperty("gt");
    // Folha fechada 1ms antes do corte fica de fora; no instante exato, dentro.
    const corte = ASSINATURA_HOLERITE_OBRIGATORIA_DESDE.getTime();
    expect(new Date(corte) >= filtro.gte).toBe(true);
    expect(new Date(corte - 1) >= filtro.gte).toBe(false);
  });

  it("o corte é a data em que a coluna assinadoEm passou a existir", () => {
    // Migration 20260913150000_folha_clt_import_assinatura. Antes disso assinar era impossível.
    expect(ASSINATURA_HOLERITE_OBRIGATORIA_DESDE.toISOString()).toBe("2026-09-13T15:00:00.000Z");
  });
});

describe("holeritesPendentesDeAssinatura", () => {
  it("usa o mesmo filtro do gate, agora trazendo os valores a assinar", async () => {
    mocks.holeriteFindMany.mockResolvedValue([]);
    await holeritesPendentesDeAssinatura({ id: "u1" });
    const arg = mocks.holeriteFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      userId: "u1",
      assinadoEm: null,
      folha: { status: "fechada", fechadaEm: { gte: ASSINATURA_HOLERITE_OBRIGATORIA_DESDE } },
    });
    expect(arg.select.itens).toBeTruthy();
  });

  it("soma proventos/descontos/líquido e devolve o mais antigo primeiro", async () => {
    mocks.holeriteFindMany.mockResolvedValue([
      {
        id: "h1",
        folha: { ano: 2026, mes: 9, fechadaEm: new Date("2026-10-01T12:00:00Z") },
        itens: [
          { descricao: "Salário", tipo: "provento", valor: 3000 },
          { descricao: "Vale", tipo: "provento", valor: 500 },
          { descricao: "INSS", tipo: "desconto", valor: 300 },
        ],
      },
    ]);
    const r = await holeritesPendentesDeAssinatura({ id: "u1" });
    expect(r[0].proventos).toBe(3500);
    expect(r[0].descontos).toBe(300);
    expect(r[0].liquido).toBe(3200);
    expect(mocks.holeriteFindMany.mock.calls[0][0].orderBy).toEqual([
      { folha: { ano: "asc" } },
      { folha: { mes: "asc" } },
    ]);
  });
});
