import { describe, it, expect, vi } from "vitest";
import { proximoCodigoProjeto, formatarCodigo } from "@/modules/projetos/numbering";
import type { Prisma } from "@/generated/prisma/client";

function txComUltimo(ultimo: number) {
  return {
    projetoSequencia: { upsert: vi.fn().mockResolvedValue({ ano: 2026, ultimo }) },
  } as unknown as Prisma.TransactionClient;
}

describe("numeração de projeto AAXXXX", () => {
  it("formata ano de 2 dígitos + sequencial de 4 dígitos", async () => {
    const r = await proximoCodigoProjeto(txComUltimo(142), 2026);
    expect(r.codigo).toBe("260142");
    expect(r.ano).toBe(2026);
    expect(r.sequencial).toBe(142);
  });

  it("zero-padda o primeiro projeto do ano", async () => {
    const r = await proximoCodigoProjeto(txComUltimo(1), 2026);
    expect(r.codigo).toBe("260001");
  });

  it("usa os 2 últimos dígitos do ano", async () => {
    const r = await proximoCodigoProjeto(txComUltimo(7), 2030);
    expect(r.codigo).toBe("300007");
  });

  it("formatarCodigo insere o traço para exibição", () => {
    expect(formatarCodigo("260142")).toBe("26-0142");
    expect(formatarCodigo("abc")).toBe("abc");
  });
});
