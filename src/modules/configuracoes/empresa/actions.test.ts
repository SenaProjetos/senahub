import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  revalidatePath: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  removerArquivo: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ can: mocks.can }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/storage", () => ({ removerArquivo: mocks.removerArquivo }));
vi.mock("@/lib/prisma", () => ({
  prisma: { configSistema: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));

const { salvarDadosEmpresa } = await import("./actions");

const ADMIN = { id: "admin-1", role: "admin", name: "Admin", ativo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: ADMIN });
  mocks.can.mockResolvedValue(true);
  mocks.getClientIp.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue(null);
  mocks.removerArquivo.mockResolvedValue(undefined);
});

describe("salvarDadosEmpresa", () => {
  it("cria o registro (primeira vez, sem nada salvo antes)", async () => {
    const r = await salvarDadosEmpresa({
      razaoSocial: "Sena Estruturas",
      cnpj: "00.000.000/0001-00",
      endereco: "Rua X",
      logoPath: "empresa/logo-1.png",
    });
    expect(r.ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { chave: "empresa.dados" },
      create: {
        chave: "empresa.dados",
        valor: { razaoSocial: "Sena Estruturas", cnpj: "00.000.000/0001-00", endereco: "Rua X", logoPath: "empresa/logo-1.png" },
      },
      update: {
        valor: { razaoSocial: "Sena Estruturas", cnpj: "00.000.000/0001-00", endereco: "Rua X", logoPath: "empresa/logo-1.png" },
      },
    });
    expect(mocks.removerArquivo).not.toHaveBeenCalled();
  });

  it("campos opcionais vazios viram null, não string vazia salva", async () => {
    await salvarDadosEmpresa({ razaoSocial: "Sena Estruturas", cnpj: "", endereco: "", logoPath: "" });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ valor: { razaoSocial: "Sena Estruturas", cnpj: null, endereco: null, logoPath: null } }),
      }),
    );
  });

  it("troca de logo remove o arquivo antigo do disco depois de salvar (não deixa órfão)", async () => {
    mocks.findUnique.mockResolvedValue({ valor: { razaoSocial: "Sena Estruturas", logoPath: "empresa/logo-antigo.png" } });
    await salvarDadosEmpresa({ razaoSocial: "Sena Estruturas", logoPath: "empresa/logo-novo.png" });
    expect(mocks.removerArquivo).toHaveBeenCalledWith("empresa/logo-antigo.png");
  });

  it("salvar de novo com o MESMO logo não apaga nada", async () => {
    mocks.findUnique.mockResolvedValue({ valor: { razaoSocial: "Sena Estruturas", logoPath: "empresa/logo-1.png" } });
    await salvarDadosEmpresa({ razaoSocial: "Sena Estruturas 2", logoPath: "empresa/logo-1.png" });
    expect(mocks.removerArquivo).not.toHaveBeenCalled();
  });

  it("remover o logo (campo vazio) apaga o arquivo antigo", async () => {
    mocks.findUnique.mockResolvedValue({ valor: { razaoSocial: "Sena Estruturas", logoPath: "empresa/logo-1.png" } });
    await salvarDadosEmpresa({ razaoSocial: "Sena Estruturas", logoPath: "" });
    expect(mocks.removerArquivo).toHaveBeenCalledWith("empresa/logo-1.png");
  });
});
