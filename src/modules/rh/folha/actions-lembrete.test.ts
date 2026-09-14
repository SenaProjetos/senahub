import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lembrete de assinatura pendente (P5, espelha `lembrarAssinaturaRecibo`). O botão existe pra
 * AVISAR — se o funcionário desativou avisos de pagamento, o toast tem que dizer isso em vez de
 * afirmar "enviado" (mesmo achado do advisor já aplicado no recibo de produção).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  revalidatePath: vi.fn(),
  notificar: vi.fn(),
  filtrarPorCategoria: vi.fn(),
  holeriteFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/mail", () => ({ smtpConfigurado: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({ enviarEmailTemplate: vi.fn() }));
vi.mock("@/lib/notificar", () => ({ notificar: mocks.notificar }));
vi.mock("@/modules/usuarios/preferencias/queries", () => ({ filtrarPorCategoria: mocks.filtrarPorCategoria }));
vi.mock("@/modules/rh/encargos/queries", () => ({ faixasPorTipo: vi.fn(), deducaoDependente: vi.fn() }));
vi.mock("@/modules/rh/funcionarios/queries", () => ({ dependentesPorUsuario: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { holerite: { findUnique: mocks.holeriteFindUnique } },
}));

const { lembrarAssinaturaHolerite } = await import("./actions");

const ADMIN = { id: "admin-1", role: "admin", name: "Admin", ativo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: ADMIN });
  mocks.getClientIp.mockResolvedValue(null);
});

describe("lembrarAssinaturaHolerite", () => {
  it("avisa quando o canal de notificação está liberado", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: null,
      folha: { status: "fechada", ano: 2026, mes: 9 },
    });
    mocks.filtrarPorCategoria.mockResolvedValue(["u1"]);

    const r = await lembrarAssinaturaHolerite({ id: "h1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.avisado).toBe(true);
    expect(mocks.notificar).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ titulo: expect.stringContaining("Lembrete") }),
      { categoria: "pagamento" },
    );
  });

  it("não afirma 'enviado' quando o funcionário desativou avisos de pagamento", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: null,
      folha: { status: "fechada", ano: 2026, mes: 9 },
    });
    mocks.filtrarPorCategoria.mockResolvedValue([]);

    const r = await lembrarAssinaturaHolerite({ id: "h1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.avisado).toBe(false);
    expect(mocks.notificar).not.toHaveBeenCalled();
  });

  it("recusa lembrar de holerite já assinado", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: new Date(),
      folha: { status: "fechada", ano: 2026, mes: 9 },
    });
    const r = await lembrarAssinaturaHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/já foi assinado/);
    expect(mocks.notificar).not.toHaveBeenCalled();
  });

  it("recusa lembrar de folha ainda aberta", async () => {
    mocks.holeriteFindUnique.mockResolvedValue({
      id: "h1",
      userId: "u1",
      assinadoEm: null,
      folha: { status: "aberta", ano: 2026, mes: 9 },
    });
    const r = await lembrarAssinaturaHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
    expect(mocks.notificar).not.toHaveBeenCalled();
  });

  it("recusa holerite inexistente", async () => {
    mocks.holeriteFindUnique.mockResolvedValue(null);
    const r = await lembrarAssinaturaHolerite({ id: "h1" });
    expect(r.ok).toBe(false);
  });
});
