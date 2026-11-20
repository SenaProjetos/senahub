import { describe, expect, it } from "vitest";
import { criarPedidoSchema, recusarPedidoSchema } from "./schemas";
import { MAX_MARCACOES } from "./regras";

const marca = { pagina: 1, x: 0.1, y: 0.1, texto: "aqui", marcacao: null };

describe("schemas do pedido de revisão: mensagens em português", () => {
  it(`mais de ${MAX_MARCACOES} marcações`, () => {
    const r = criarPedidoSchema.safeParse({
      projetoId: "p",
      uploadId: "u",
      comentario: "x",
      marcacoes: Array.from({ length: MAX_MARCACOES + 1 }, () => marca),
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(`O pedido aceita no máximo ${MAX_MARCACOES} marcações.`);
  });
  it("comentário longo demais", () => {
    const r = criarPedidoSchema.safeParse({ projetoId: "p", uploadId: "u", comentario: "x".repeat(10000) });
    expect(r.error?.issues[0]?.message).toMatch(/^O comentário passa de/);
  });
  it("marcação fora da página", () => {
    const r = criarPedidoSchema.safeParse({ projetoId: "p", uploadId: "u", comentario: "x", marcacoes: [{ ...marca, x: 2 }] });
    expect(r.error?.issues[0]?.message).toBe("Marcação fora da prancha.");
  });
  it("resposta longa demais", () => {
    const r = recusarPedidoSchema.safeParse({ id: "p", resposta: "x".repeat(10000) });
    expect(r.error?.issues[0]?.message).toMatch(/^A resposta passa de/);
  });
});
