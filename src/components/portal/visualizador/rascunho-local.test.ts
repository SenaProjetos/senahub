import { describe, expect, it } from "vitest";
import { chaveDoRascunho, gravarRascunho, lerRascunho, limparRascunho, type RascunhoPedido } from "./rascunho-local";

function memoria(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

const rascunho: RascunhoPedido = {
  comentario: "Mudar a porta",
  marcacoes: [{ id: "a", pagina: 1, x: 0.1, y: 0.2, texto: "aqui", marcacao: null, paginaPt: { w: 100, h: 50 } }],
};

describe("rascunho local do pedido", () => {
  it("chave por upload", () => {
    expect(chaveDoRascunho("u1")).toBe("pedido-revisao:u1");
  });
  it("grava, lê e limpa", () => {
    const s = memoria();
    gravarRascunho("u1", rascunho, s);
    expect(lerRascunho("u1", s)).toEqual(rascunho);
    expect(lerRascunho("u2", s)).toBeNull();
    limparRascunho("u1", s);
    expect(lerRascunho("u1", s)).toBeNull();
  });
  it("rascunho vazio não ocupa espaço", () => {
    const s = memoria();
    gravarRascunho("u1", rascunho, s);
    gravarRascunho("u1", { comentario: "  ", marcacoes: [] }, s);
    expect(s.length).toBe(0);
  });
  it("conteúdo estragado ou armazenamento que lança: null, sem erro", () => {
    const s = memoria();
    s.setItem(chaveDoRascunho("u1"), "{nao é json");
    expect(lerRascunho("u1", s)).toBeNull();
    s.setItem(chaveDoRascunho("u1"), JSON.stringify({ comentario: 1, marcacoes: "x" }));
    expect(lerRascunho("u1", s)).toBeNull();
    const quebrado = { ...memoria(), getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); } } as Storage;
    expect(lerRascunho("u1", quebrado)).toBeNull();
    expect(() => gravarRascunho("u1", rascunho, quebrado)).not.toThrow();
  });
});
