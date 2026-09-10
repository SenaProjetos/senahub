import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura mínima do fix da issue #2: `criarProposta` (caminho avulso, `/comercial/propostas`)
 * precisa herdar `leadId` da negociação escolhida, quando ela tiver um. Sem isso, a proposta
 * desaparecia do histórico do lead mesmo vindo de uma negociação que tinha lead.
 *
 * Mocka `@/lib/prisma` no padrão de `modules/ponto/apuracao.test.ts` — evita depender de banco
 * real, e isola exatamente a regra que mudou.
 */

const mocks = vi.hoisted(() => ({
  negociacaoFindUnique: vi.fn(),
  propostaSequenciaUpsert: vi.fn(),
  propostaCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    negociacao: { findUnique: (...a: unknown[]) => mocks.negociacaoFindUnique(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        propostaSequencia: { upsert: (...a: unknown[]) => mocks.propostaSequenciaUpsert(...a) },
        proposta: { create: (...a: unknown[]) => mocks.propostaCreate(...a) },
      }),
  },
}));

import { criarProposta } from "@/modules/comercial/service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.propostaSequenciaUpsert.mockResolvedValue({ ultimo: 7 });
  mocks.propostaCreate.mockImplementation(async ({ data }: { data: unknown }) => ({
    id: "p1",
    ...(data as Record<string, unknown>),
  }));
});

describe("criarProposta (avulsa)", () => {
  it("herda leadId da negociação quando ela tem um lead vinculado", async () => {
    mocks.negociacaoFindUnique.mockResolvedValue({
      id: "n1",
      clienteId: "c1",
      leadId: "lead-1",
    });

    await criarProposta({ titulo: "Proposta X", clienteId: "c1", negociacaoId: "n1" }, "autor1");

    expect(mocks.propostaCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: "lead-1" }) }),
    );
  });

  it("cria com leadId nulo quando a negociação não tem lead (criada direto)", async () => {
    mocks.negociacaoFindUnique.mockResolvedValue({
      id: "n2",
      clienteId: "c1",
      leadId: null,
    });

    await criarProposta({ titulo: "Proposta Y", clienteId: "c1", negociacaoId: "n2" }, "autor1");

    expect(mocks.propostaCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: null }) }),
    );
  });

  it("recusa quando a negociação é de outro cliente", async () => {
    mocks.negociacaoFindUnique.mockResolvedValue({ id: "n3", clienteId: "outro", leadId: null });

    await expect(
      criarProposta({ titulo: "Z", clienteId: "c1", negociacaoId: "n3" }, "autor1"),
    ).rejects.toThrow("não é desta empresa");
    expect(mocks.propostaCreate).not.toHaveBeenCalled();
  });
});
