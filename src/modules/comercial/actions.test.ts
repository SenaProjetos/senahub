import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const can = vi.fn();
const lerTemplatosNotas = vi.fn();

vi.mock("@/lib/session", () => ({ requireUser }));
vi.mock("@/lib/permissions", () => ({ can }));
vi.mock("@/modules/comercial/queries", () => ({
  lerTemplatosNotas,
  buscarEmpresaParaVincular: vi.fn(),
  buscarEmpresaParaProspeccaoRapida: vi.fn(),
  buscarContatoNaEmpresa: vi.fn(),
}));

const { obterTemplatosNotas } = await import("./actions");

describe("obterTemplatosNotas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "u1", role: "administrativo" });
  });

  it("interrompe a chamada sem sessão antes de consultar templates", async () => {
    requireUser.mockRejectedValue(new Error("Não autenticado"));

    await expect(obterTemplatosNotas()).rejects.toThrow("Não autenticado");
    expect(lerTemplatosNotas).not.toHaveBeenCalled();
  });

  it("não devolve templates para quem não pode gerir comercial", async () => {
    can.mockResolvedValue(false);

    await expect(obterTemplatosNotas()).resolves.toEqual([]);
    expect(lerTemplatosNotas).not.toHaveBeenCalled();
  });

  it("consulta templates somente após a permissão", async () => {
    can.mockResolvedValue(true);
    lerTemplatosNotas.mockResolvedValue([{ titulo: "Contato" }]);

    await expect(obterTemplatosNotas()).resolves.toEqual([{ titulo: "Contato" }]);
    expect(can).toHaveBeenCalledWith({ id: "u1", role: "administrativo" }, "comercial", "gerir");
  });
});
