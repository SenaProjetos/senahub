import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Assinatura do holerite (P3) + o efeito colateral que a garante em `reabrirFolha`: sem uma
 * assinatura ligada a um SNAPSHOT do que foi assinado (o holerite não tem texto fixo como o
 * recibo de produção), reabrir a folha e editar os itens deixaria uma assinatura antiga
 * descrevendo dados que não são mais os gravados — por isso reabrir LIMPA quem já tinha assinado.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  revalidatePath: vi.fn(),
  holeriteFindUnique: vi.fn(),
  holeriteUpdateMany: vi.fn(),
  holeriteFindMany: vi.fn(),
  holeriteUpdate: vi.fn(),
  folhaFindUnique: vi.fn(),
  folhaUpdate: vi.fn(),
  lancamentoDelete: vi.fn(),
  lancamentoUpdateMany: vi.fn(),
  lancamentoFindFirst: vi.fn(),
  holeriteVersaoCreate: vi.fn(),
  folhaReaberturaCreate: vi.fn(),
  folhaUpdateMany: vi.fn(),
}));

const tx = {
  // Reabrir lê, trava e confere o pagamento DENTRO da transação.
  folhaPagamento: { update: mocks.folhaUpdate, findUnique: mocks.folhaFindUnique, updateMany: mocks.folhaUpdateMany },
  lancamento: { delete: mocks.lancamentoDelete, updateMany: mocks.lancamentoUpdateMany, findFirst: mocks.lancamentoFindFirst },
  holerite: { updateMany: mocks.holeriteUpdateMany, findMany: mocks.holeriteFindMany, update: mocks.holeriteUpdate },
  holeriteVersao: { create: mocks.holeriteVersaoCreate },
  folhaReabertura: { create: mocks.folhaReaberturaCreate },
};

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/mail", () => ({ smtpConfigurado: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({ enviarEmailTemplate: vi.fn() }));
vi.mock("@/modules/rh/encargos/queries", () => ({ faixasPorTipo: vi.fn(), deducaoDependente: vi.fn() }));
vi.mock("@/modules/rh/funcionarios/queries", () => ({ dependentesPorUsuario: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    holerite: { findUnique: mocks.holeriteFindUnique, updateMany: mocks.holeriteUpdateMany },
    folhaPagamento: { findUnique: mocks.folhaFindUnique, update: mocks.folhaUpdate },
    lancamento: { findFirst: mocks.lancamentoFindFirst },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { assinarHolerite, reabrirFolha } = await import("./actions");

const FUNCIONARIO = { id: "u1", role: "clt", name: "Fulana", ativo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClientIp.mockResolvedValue(null);
});

describe("assinarHolerite", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: FUNCIONARIO });
  });

  it("assina quando o titular pede, com a folha fechada", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: null,
      folha: { status: "fechada" },
    });
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 1 });

    const r = await assinarHolerite({ id: "h1" });
    expect(r.ok).toBe(true);
    expect(mocks.holeriteUpdateMany).toHaveBeenCalledWith({
      where: { id: "h1", assinadoEm: null },
      data: {
        assinadoEm: expect.any(Date),
        assinanteId: "u1",
        assinaturaAnteriorEm: null,
        itensAssinadosAntes: expect.anything(),
      },
    });
  });

  it("recusa quem não é o titular", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "outra-pessoa",
      assinadoEm: null,
      folha: { status: "fechada" },
    });
    const r = await assinarHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Só o próprio funcionário/);
    expect(mocks.holeriteUpdateMany).not.toHaveBeenCalled();
  });

  it("recusa enquanto a folha está aberta (nada pra assinar ainda)", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: null,
      folha: { status: "aberta" },
    });
    const r = await assinarHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
    expect(mocks.holeriteUpdateMany).not.toHaveBeenCalled();
  });

  it("recusa assinar de novo (já assinado no findUnique)", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: new Date(),
      folha: { status: "fechada" },
    });
    const r = await assinarHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
    expect(mocks.holeriteUpdateMany).not.toHaveBeenCalled();
  });

  it("recusa a corrida (2 cliques): findUnique via 'não assinado', mas o updateMany não acha ninguém", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: null,
      folha: { status: "fechada" },
    });
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 0 });
    const r = await assinarHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/já foi assinado/);
  });
});

const MOTIVO = "INSS do holerite da Ana veio errado";

describe("reabrirFolha — limpa assinatura", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: { id: "rh1", role: "admin", name: "RH", ativo: true, gereRh: true } });
    mocks.holeriteFindMany.mockResolvedValue([]);
    mocks.folhaUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("folha que outra pessoa já reabriu: recusa sem gravar reabertura", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "aberta", lancamentoId: null, partes: [] });
    mocks.folhaUpdateMany.mockResolvedValue({ count: 0 });
    const r = await reabrirFolha({ id: "f1", motivo: MOTIVO });
    expect(!r.ok && r.error).toBe("Folha não está fechada.");
    expect(mocks.folhaReaberturaCreate).not.toHaveBeenCalled();
  });

  it("trava condicionada ao status lido e mantém a ligação com a conta do líquido", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: "l1", partes: [] });
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 0 });
    expect((await reabrirFolha({ id: "f1", motivo: MOTIVO })).ok).toBe(true);
    expect(mocks.folhaUpdateMany).toHaveBeenCalledWith({ where: { id: "f1", status: "fechada" }, data: { status: "aberta", fechadaEm: null } });
  });

  it("sem motivo (ou curto) é recusado antes de tocar no banco", async () => {
    const r = await reabrirFolha({ id: "f1", motivo: "erro" });
    expect(r.ok).toBe(false);
    expect(mocks.folhaFindUnique).not.toHaveBeenCalled();
    expect(mocks.folhaUpdate).not.toHaveBeenCalled();
  });

  it("guarda a versão assinada de cada holerite e a reabertura com o motivo, antes de revogar", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: null, partes: [] });
    const assinadoEm = new Date("2026-10-08T12:00:00Z");
    mocks.holeriteFindMany.mockResolvedValue([
      { id: "h1", assinadoEm, assinanteId: "u1", itens: [{ descricao: "Salário", tipo: "provento", valor: "3000.00" }] },
    ]);
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 1 });
    const r = await reabrirFolha({ id: "f1", motivo: MOTIVO });
    expect(r.ok).toBe(true);
    expect(mocks.holeriteVersaoCreate).toHaveBeenCalledWith({
      data: { holeriteId: "h1", itens: [{ descricao: "Salário", tipo: "provento", valor: 3000 }], assinadoEm, assinanteId: "u1", motivo: MOTIVO },
    });
    expect(mocks.folhaReaberturaCreate).toHaveBeenCalledWith({ data: { folhaId: "f1", motivo: MOTIVO, autorId: "rh1" } });
  });

  it("revoga a assinatura de quem já tinha assinado, guardando a assinatura e os itens que ela cobria", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: "l1", partes: [], lancamentoReaproveitado: false, lancamentoValorPrevisto: null });
    mocks.lancamentoDelete.mockResolvedValue({});
    const quando = new Date("2026-10-01T12:00:00Z");
    mocks.holeriteFindMany.mockResolvedValue([
      { id: "h1", assinadoEm: quando, itens: [{ descricao: "Salário", tipo: "provento", valor: 3000 }] },
      { id: "h2", assinadoEm: quando, itens: [] },
    ]);

    const r = await reabrirFolha({ id: "f1", motivo: MOTIVO });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.assinaturasRevogadas).toBe(2);
    expect(mocks.holeriteFindMany.mock.calls[0][0].where).toEqual({ folhaId: "f1", assinadoEm: { not: null } });
    expect(mocks.holeriteUpdate).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: {
        assinadoEm: null,
        assinanteId: null,
        assinaturaAnteriorEm: quando,
        itensAssinadosAntes: [{ descricao: "Salário", tipo: "provento", valor: 3000 }],
      },
    });
    expect(mocks.holeriteUpdate).toHaveBeenCalledTimes(2);
  });

  it("não mexe em assinatura quando ninguém tinha assinado", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: null, partes: [], lancamentoReaproveitado: false, lancamentoValorPrevisto: null });
    mocks.holeriteFindMany.mockResolvedValue([]);
    const r = await reabrirFolha({ id: "f1", motivo: MOTIVO });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.assinaturasRevogadas).toBe(0);
    expect(mocks.holeriteUpdate).not.toHaveBeenCalled();
  });

  it("conta a pagar da folha já paga: reabrir é recusado (estorne antes)", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: "l1", partes: [] });
    mocks.lancamentoFindFirst.mockResolvedValue({ status: "confirmado" });

    const r = await reabrirFolha({ id: "f1", motivo: MOTIVO });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/estorne o pagamento/);
    // Recusa dentro da transação: nada de reabertura nem de assinatura revogada (o banco desfaz a trava).
    expect(mocks.folhaReaberturaCreate).not.toHaveBeenCalled();
    expect(mocks.holeriteUpdateMany).not.toHaveBeenCalled();
  });

  it("conta em aberto: reabrir não apaga nem reverte o lançamento (o próximo fechamento o atualiza)", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: "l1", partes: [] });
    mocks.lancamentoFindFirst.mockResolvedValue({ status: "previsto" });
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 0 });

    expect((await reabrirFolha({ id: "f1", motivo: MOTIVO })).ok).toBe(true);
    expect(mocks.lancamentoDelete).not.toHaveBeenCalled();
    expect(mocks.lancamentoUpdateMany).not.toHaveBeenCalled();
  });
});
