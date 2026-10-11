// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Totais retidos da folha (INSS, IRRF, FGTS — R4 do rateio): só com a folha aberta, valor de zero
 * para cima, vazio = a parte não é lançada. A mensagem de recusa é a que a tela mostra.
 */
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  revalidatePath: vi.fn(),
  folhaFindUnique: vi.fn(),
  folhaUpdateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/mail", () => ({ smtpConfigurado: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({ enviarEmailTemplate: vi.fn() }));
vi.mock("@/modules/rh/encargos/queries", () => ({ faixasPorTipo: vi.fn(), deducaoDependente: vi.fn() }));
vi.mock("@/modules/rh/funcionarios/queries", () => ({ dependentesPorUsuario: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { folhaPagamento: { findUnique: mocks.folhaFindUnique, updateMany: mocks.folhaUpdateMany } },
}));

const { salvarTotaisDaFolha } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClientIp.mockResolvedValue(null);
  mocks.getSession.mockResolvedValue({ user: { id: "rh1", name: "RH", ativo: true, gereRh: true, tipo: "interno" } });
  mocks.folhaFindUnique.mockResolvedValue({ totalInssRetido: null, totalIrrfRetido: null, totalFgts: null });
});

describe("salvarTotaisDaFolha", () => {
  it("grava os três totais na folha aberta (vazio vira nulo)", async () => {
    mocks.folhaUpdateMany.mockResolvedValue({ count: 1 });
    const r = await salvarTotaisDaFolha({ id: "f1", inss: 812.4, irrf: null, fgts: 640.8 });
    expect(r.ok).toBe(true);
    expect(mocks.folhaUpdateMany).toHaveBeenCalledWith({
      where: { id: "f1", status: "aberta" },
      data: { totalInssRetido: 812.4, totalIrrfRetido: null, totalFgts: 640.8 },
    });
  });

  it("folha fechada: recusa com a frase da tela", async () => {
    mocks.folhaUpdateMany.mockResolvedValue({ count: 0 });
    const r = await salvarTotaisDaFolha({ id: "f1", inss: 1, irrf: 1, fgts: 1 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("A folha está fechada: reabra para corrigir os totais.");
  });

  it("valor negativo é recusado antes de tocar no banco", async () => {
    const r = await salvarTotaisDaFolha({ id: "f1", inss: -5, irrf: null, fgts: null });
    expect(r.ok).toBe(false);
    expect(mocks.folhaUpdateMany).not.toHaveBeenCalled();
  });
});
