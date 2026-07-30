import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  can: vi.fn(),
  findFirst: vi.fn(),
  removerArquivo: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}));
vi.mock("@/lib/permissions", () => ({
  can: (...args: unknown[]) => mocks.can(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    custoImportacao: {
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
    },
  },
}));
vi.mock("@/lib/storage", () => ({
  nomeArquivoLimpo: vi.fn((nome: string) => nome),
  salvarArquivo: vi.fn(),
  removerArquivo: (...args: unknown[]) => mocks.removerArquivo(...args),
}));

import { DELETE } from "./route";

const caminho = "custos/importacoes/0123456789abcdef01234567.xlsx";

function pedidoDelete(caminhoArquivo = caminho) {
  return new Request("http://localhost/api/custos/importar-base", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caminho: caminhoArquivo }),
  });
}

describe("DELETE /api/custos/importar-base", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "diretoria" } });
    mocks.can.mockResolvedValue(true);
  });

  it("rejeita com 409 um arquivo que já pertence a CustoImportacao", async () => {
    mocks.findFirst.mockResolvedValue({ id: "imp1" });

    const resposta = await DELETE(pedidoDelete());

    expect(resposta.status).toBe(409);
    await expect(resposta.json()).resolves.toEqual({
      error: "O arquivo já pertence a uma importação e não pode ser removido.",
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { caminhoArquivo: caminho },
      select: { id: true },
    });
    expect(mocks.removerArquivo).not.toHaveBeenCalled();
  });

  it("remove um upload temporário ainda não referenciado", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const resposta = await DELETE(pedidoDelete());

    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toEqual({ ok: true });
    expect(mocks.removerArquivo).toHaveBeenCalledWith(caminho);
  });

  it("rejeita caminhos fora do namespace temporário antes de consultar o banco", async () => {
    const resposta = await DELETE(pedidoDelete("../segredo.xlsx"));

    expect(resposta.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.removerArquivo).not.toHaveBeenCalled();
  });
});
