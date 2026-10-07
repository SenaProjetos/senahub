import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tarja de assinatura do holerite. Este `where` roda no layout de TODA rota do dashboard —
 * errar aqui some com a cobrança ou mostra tarja a quem não deve. Os testes checam o
 * filtro montado, não só o retorno.
 */

const mocks = vi.hoisted(() => ({
  holeriteFindMany: vi.fn(),
  lancamentoFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    holerite: { findMany: mocks.holeriteFindMany },
    lancamento: { findMany: mocks.lancamentoFindMany },
  },
}));

const {
  pendenciaDeAssinaturaHolerite,
  holeritesPendentesDeAssinatura,
  ASSINATURA_HOLERITE_OBRIGATORIA_DESDE,
} = await import("./queries");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lancamentoFindMany.mockResolvedValue([]);
});

describe("pendenciaDeAssinaturaHolerite", () => {
  it("quem não tem holerite pendente nenhum não vê tarja", async () => {
    mocks.holeriteFindMany.mockResolvedValue([]);
    expect(await pendenciaDeAssinaturaHolerite({ id: "u1" })).toEqual({ total: 0, revisados: 0 });
  });

  it("conta pendentes e quantos são reassinatura (corrigidos depois de assinados)", async () => {
    mocks.holeriteFindMany.mockResolvedValue([
      { assinaturaAnteriorEm: null, folha: { lancamentoId: null } },
      { assinaturaAnteriorEm: new Date("2026-10-01T12:00:00Z"), folha: { lancamentoId: null } },
    ]);
    expect(await pendenciaDeAssinaturaHolerite({ id: "u1" })).toEqual({ total: 2, revisados: 1 });
  });

  it("só considera folha FECHADA e a partir do corte, e holerite ainda não assinado", async () => {
    mocks.holeriteFindMany.mockResolvedValue([]);
    await pendenciaDeAssinaturaHolerite({ id: "u1" });
    expect(mocks.holeriteFindMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        assinadoEm: null,
        folha: {
          status: "fechada",
          fechadaEm: { gte: ASSINATURA_HOLERITE_OBRIGATORIA_DESDE },
        },
      },
      select: { assinaturaAnteriorEm: true, folha: { select: { lancamentoId: true } } },
    });
  });

  it("antes do dia do pagamento da folha não cobra; no dia, cobra", async () => {
    mocks.holeriteFindMany.mockResolvedValue([{ assinaturaAnteriorEm: null, folha: { lancamentoId: "l1" } }]);
    const amanha = new Date(Date.now() + 2 * 86_400_000);
    mocks.lancamentoFindMany.mockResolvedValue([{ id: "l1", status: "previsto", vencimento: amanha }]);
    expect(await pendenciaDeAssinaturaHolerite({ id: "u1" })).toEqual({ total: 0, revisados: 0 });

    mocks.lancamentoFindMany.mockResolvedValue([{ id: "l1", status: "previsto", vencimento: new Date("2026-01-05") }]);
    expect(await pendenciaDeAssinaturaHolerite({ id: "u1" })).toEqual({ total: 1, revisados: 0 });
  });

  it("não carrega item nenhum — é consulta de layout, roda a cada navegação", async () => {
    mocks.holeriteFindMany.mockResolvedValue([]);
    await pendenciaDeAssinaturaHolerite({ id: "u1" });
    const arg = mocks.holeriteFindMany.mock.calls[0][0];
    expect(arg.select).toEqual({ assinaturaAnteriorEm: true, folha: { select: { lancamentoId: true } } });
    expect(arg.include).toBeUndefined();
  });

  it("o corte é INCLUSIVO (gte): folha fechada exatamente no instante do corte é cobrada", async () => {
    mocks.holeriteFindMany.mockResolvedValue([]);
    await pendenciaDeAssinaturaHolerite({ id: "u1" });
    const filtro = mocks.holeriteFindMany.mock.calls[0][0].where.folha.fechadaEm;
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
        assinaturaAnteriorEm: null,
        itensAssinadosAntes: null,
        folha: { ano: 2026, mes: 9, lancamentoId: null, fechadaEm: new Date("2026-10-01T12:00:00Z") },
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
    expect(r[0].revisao).toBeNull();
    expect(mocks.holeriteFindMany.mock.calls[0][0].orderBy).toEqual([
      { folha: { ano: "asc" } },
      { folha: { mes: "asc" } },
    ]);
  });

  it("holerite corrigido depois de assinado traz o que mudou desde a assinatura anterior", async () => {
    mocks.holeriteFindMany.mockResolvedValue([
      {
        id: "h1",
        assinaturaAnteriorEm: new Date("2026-10-01T12:00:00Z"),
        itensAssinadosAntes: [{ descricao: "Salário", tipo: "provento", valor: 3000 }],
        folha: { ano: 2026, mes: 9, tipo: "mensal", lancamentoId: null, fechadaEm: new Date("2026-10-05T12:00:00Z") },
        itens: [{ descricao: "Salário", tipo: "provento", valor: 3100 }],
      },
    ]);
    const r = await holeritesPendentesDeAssinatura({ id: "u1" });
    expect(r[0].revisao?.mudancas).toEqual([
      { kind: "alterado", descricao: "Salário", tipo: "provento", antes: 3000, depois: 3100 },
    ]);
  });
});
