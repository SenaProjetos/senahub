import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { configSistema: { findUnique: mocks.findUnique } } }));

const { dadosEmpresa } = await import("./queries");

beforeEach(() => vi.clearAllMocks());

describe("dadosEmpresa", () => {
  it("ninguém configurou ainda → null (nenhuma linha em ConfigSistema)", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await dadosEmpresa()).toBeNull();
  });

  it("razão social ausente/vazia no JSON salvo → null (dado corrompido não quebra o PDF)", async () => {
    mocks.findUnique.mockResolvedValue({ valor: { razaoSocial: "" } });
    expect(await dadosEmpresa()).toBeNull();
  });

  it("normaliza campos opcionais ausentes pra null (não string vazia)", async () => {
    mocks.findUnique.mockResolvedValue({ valor: { razaoSocial: "Sena Estruturas" } });
    expect(await dadosEmpresa()).toEqual({
      razaoSocial: "Sena Estruturas",
      cnpj: null,
      endereco: null,
      logoPath: null,
    });
  });

  it("devolve todos os campos quando preenchidos", async () => {
    mocks.findUnique.mockResolvedValue({
      valor: { razaoSocial: "Sena Estruturas", cnpj: "00.000.000/0001-00", endereco: "Rua X", logoPath: "empresa/logo-1.png" },
    });
    expect(await dadosEmpresa()).toEqual({
      razaoSocial: "Sena Estruturas",
      cnpj: "00.000.000/0001-00",
      endereco: "Rua X",
      logoPath: "empresa/logo-1.png",
    });
  });
});
