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
  folhaFindUnique: vi.fn(),
  folhaUpdate: vi.fn(),
  lancamentoDelete: vi.fn(),
}));

const tx = {
  folhaPagamento: { update: mocks.folhaUpdate },
  lancamento: { delete: mocks.lancamentoDelete },
  holerite: { updateMany: mocks.holeriteUpdateMany },
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
      data: { assinadoEm: expect.any(Date), assinanteId: "u1" },
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

describe("reabrirFolha — limpa assinatura", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: { id: "rh1", role: "admin", name: "RH", ativo: true } });
  });

  it("limpa assinadoEm/assinanteId de quem já tinha assinado, e devolve a contagem", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: "l1" });
    mocks.lancamentoDelete.mockResolvedValue({});
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 2 });

    const r = await reabrirFolha({ id: "f1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.assinaturasRevogadas).toBe(2);
    expect(mocks.holeriteUpdateMany).toHaveBeenCalledWith({
      where: { folhaId: "f1", assinadoEm: { not: null } },
      data: { assinadoEm: null, assinanteId: null },
    });
  });

  it("não mexe em assinatura quando ninguém tinha assinado (count 0)", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f1", status: "fechada", lancamentoId: null });
    mocks.holeriteUpdateMany.mockResolvedValue({ count: 0 });
    const r = await reabrirFolha({ id: "f1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.assinaturasRevogadas).toBe(0);
  });
});
