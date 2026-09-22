import { beforeEach, describe, expect, it, vi } from "vitest";

/** Folha de 13º convive com a mensal no mesmo mês; geração automática é só da mensal. */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  revalidatePath: vi.fn(),
  folhaFindUnique: vi.fn(),
  folhaCreate: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/mail", () => ({ smtpConfigurado: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({ enviarEmailTemplate: vi.fn() }));
vi.mock("@/lib/notificar", () => ({ notificar: vi.fn() }));
vi.mock("@/modules/usuarios/preferencias/queries", () => ({ filtrarPorCategoria: vi.fn() }));
vi.mock("@/modules/rh/encargos/queries", () => ({ faixasPorTipo: vi.fn(), deducaoDependente: vi.fn() }));
vi.mock("@/modules/rh/funcionarios/queries", () => ({ dependentesPorUsuario: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    folhaPagamento: { findUnique: mocks.folhaFindUnique, create: mocks.folhaCreate },
    user: { findMany: mocks.userFindMany },
  },
}));

const { criarFolha, gerarHoleritesAutomatico } = await import("./actions");

const ADMIN = { id: "admin-1", role: "admin", name: "Admin", ativo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: ADMIN });
  mocks.getClientIp.mockResolvedValue(null);
  mocks.folhaFindUnique.mockResolvedValue(null);
  mocks.folhaCreate.mockResolvedValue({ id: "f-nova" });
});

describe("criarFolha", () => {
  it("procura duplicata pela chave (ano, mes, tipo) — 13º não colide com a mensal do mesmo mês", async () => {
    const r = await criarFolha({ ano: 2026, mes: 12, tipo: "decimo_terceiro" });
    expect(r.ok).toBe(true);
    expect(mocks.folhaFindUnique).toHaveBeenCalledWith({
      where: { ano_mes_tipo: { ano: 2026, mes: 12, tipo: "decimo_terceiro" } },
    });
    expect(mocks.folhaCreate).toHaveBeenCalledWith({ data: { ano: 2026, mes: 12, tipo: "decimo_terceiro" } });
  });

  it("recusa duplicata do mesmo tipo, dizendo qual folha já existe", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f-existente" });
    const r = await criarFolha({ ano: 2026, mes: 12, tipo: "decimo_terceiro" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("A folha 13º salário 12/2026 já existe.");
  });
});

describe("gerarHoleritesAutomatico", () => {
  it("recusa na folha de 13º — o cálculo é do salário mensal", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f13", tipo: "decimo_terceiro", status: "aberta", holerites: [] });
    const r = await gerarHoleritesAutomatico({ id: "f13" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/só para a folha mensal/);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  // Filtra por CONTRATAÇÃO, não por papel — alguém com role divergente da contratação real
  // (ex.: USER_TESTE, papel "estagiario" com contratação ainda "clt") não pode sumir da folha.
  it("seleciona por contratacao: clt, não por role", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ id: "f-mensal", tipo: "mensal", status: "aberta", holerites: [] });
    mocks.userFindMany.mockResolvedValue([]);
    const r = await gerarHoleritesAutomatico({ id: "f-mensal" });
    expect(r.ok).toBe(false); // "nenhum funcionário pendente" — mock devolve lista vazia
    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contratacao: "clt" }),
      }),
    );
    const chamada = mocks.userFindMany.mock.calls[0][0];
    expect(chamada.where).not.toHaveProperty("role");
  });
});
