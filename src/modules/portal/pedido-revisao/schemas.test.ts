import { describe, expect, it } from "vitest";
import { criarPedidoModeloSchema, criarPedidoSchema, recusarPedidoSchema } from "./schemas";
import { MAX_GUIDS_MARCACAO } from "./modelo-regras";
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

const marca3d = {
  modeloId: "u1",
  guids: ["2O2Fr$t4X7Zf8NOew3FLOH"],
  ponto: [1, 2, 3],
  camera: { position: [10, 10, 10], target: [0, 0, 0] },
  texto: "Trocar esta parede",
};

describe("schema do pedido no modelo 3D", () => {
  it("marcação válida passa", () => {
    expect(criarPedidoModeloSchema.safeParse({ projetoId: "p", comentario: "x", marcacoes: [marca3d] }).success).toBe(true);
  });
  it("pedido só com comentário passa", () => {
    expect(criarPedidoModeloSchema.safeParse({ projetoId: "p", comentario: "x", marcacoes: [] }).success).toBe(true);
  });
  it(`mais de ${MAX_GUIDS_MARCACAO} elementos numa marcação`, () => {
    const r = criarPedidoModeloSchema.safeParse({
      projetoId: "p",
      comentario: "x",
      marcacoes: [{ ...marca3d, guids: Array.from({ length: MAX_GUIDS_MARCACAO + 1 }, (_, i) => `g${i}`) }],
    });
    expect(r.error?.issues[0]?.message).toBe(`Uma marcação aceita no máximo ${MAX_GUIDS_MARCACAO} elementos.`);
  });
  it("ponto e câmera sem número válido: fora do modelo", () => {
    const semNumero = criarPedidoModeloSchema.safeParse({ projetoId: "p", comentario: "x", marcacoes: [{ ...marca3d, ponto: [1, "a", 3] }] });
    expect(semNumero.error?.issues[0]?.message).toBe("Marcação fora do modelo.");
    const infinito = criarPedidoModeloSchema.safeParse({
      projetoId: "p",
      comentario: "x",
      marcacoes: [{ ...marca3d, camera: { position: [Infinity, 0, 0], target: [0, 0, 0] } }],
    });
    expect(infinito.success).toBe(false);
    const curto = criarPedidoModeloSchema.safeParse({ projetoId: "p", comentario: "x", marcacoes: [{ ...marca3d, ponto: [1, 2] }] });
    expect(curto.success).toBe(false);
  });
  it(`mais de ${MAX_MARCACOES} marcações`, () => {
    const r = criarPedidoModeloSchema.safeParse({
      projetoId: "p",
      comentario: "x",
      marcacoes: Array.from({ length: MAX_MARCACOES + 1 }, () => marca3d),
    });
    expect(r.error?.issues[0]?.message).toBe(`O pedido aceita no máximo ${MAX_MARCACOES} marcações.`);
  });
});

describe("schemas do pedido: tipo errado também tem mensagem em português", () => {
  /** Toda mensagem do resultado (nenhuma pode ser o padrão em inglês do Zod). */
  const mensagens = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];
  const emIngles = /invalid|expected|received|required/i;

  it("prancha: id, comentário, lista e campos da marcação com tipo errado", () => {
    const casos = [
      { projetoId: 1, uploadId: "u", comentario: "x" },
      { projetoId: "p", uploadId: null, comentario: "x" },
      { projetoId: "p", uploadId: "u", comentario: 5 },
      { projetoId: "p", uploadId: "u", comentario: "x", marcacoes: "não é lista" },
      { projetoId: "p", uploadId: "u", comentario: "x", marcacoes: [{ ...marca, texto: 3 }] },
      { projetoId: "p", uploadId: "u", comentario: "x", marcacoes: [{ ...marca, x: "1" }] },
      { projetoId: "p", uploadId: "u", comentario: "x", marcacoes: ["solta"] },
    ];
    for (const c of casos) {
      const r = criarPedidoSchema.safeParse(c);
      expect(r.success).toBe(false);
      for (const m of mensagens(r)) expect(m).not.toMatch(emIngles);
    }
  });

  it("modelo 3D: comentário, lista, guids, texto e modelo com tipo errado", () => {
    const casos = [
      { projetoId: "p", comentario: null, marcacoes: [] },
      { projetoId: "p", comentario: "x", marcacoes: {} },
      { projetoId: "p", comentario: "x", marcacoes: [{ ...marca3d, guids: "g" }] },
      { projetoId: "p", comentario: "x", marcacoes: [{ ...marca3d, guids: [1] }] },
      { projetoId: "p", comentario: "x", marcacoes: [{ ...marca3d, texto: false }] },
      { projetoId: "p", comentario: "x", marcacoes: [{ ...marca3d, modeloId: 7 }] },
      { projetoId: "p", comentario: "x", marcacoes: [1] },
    ];
    for (const c of casos) {
      const r = criarPedidoModeloSchema.safeParse(c);
      expect(r.success).toBe(false);
      for (const m of mensagens(r)) expect(m).not.toMatch(emIngles);
    }
  });

  it("resposta e id com tipo errado", () => {
    for (const r of [recusarPedidoSchema.safeParse({ id: "p", resposta: 1 }), recusarPedidoSchema.safeParse({ id: 2, resposta: "x" })]) {
      expect(r.success).toBe(false);
      for (const m of mensagens(r)) expect(m).not.toMatch(emIngles);
    }
  });
});
