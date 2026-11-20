import { describe, expect, it } from "vitest";
import {
  chaveDoRascunho,
  chaveDoRascunhoModelo,
  gravarRascunho,
  gravarRascunhoModelo,
  lerRascunho,
  lerRascunhoModelo,
  limparRascunho,
  type RascunhoModelo,
  type RascunhoPedido,
} from "./rascunho-local";

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

const K1 = chaveDoRascunho("u1", "c1");
const K2 = chaveDoRascunho("u2", "c1");

const rascunho: RascunhoPedido = {
  comentario: "Mudar a porta",
  marcacoes: [{ id: "a", pagina: 1, x: 0.1, y: 0.2, texto: "aqui", marcacao: null, paginaPt: { w: 100, h: 50 } }],
};

describe("rascunho local do pedido", () => {
  it("chave por conta e upload: duas contas no mesmo navegador não dividem o rascunho", () => {
    expect(chaveDoRascunho("u1", "conta1")).toBe("pedido-revisao:conta1:u1");
    const s = memoria();
    gravarRascunho(chaveDoRascunho("u1", "conta1"), rascunho, s);
    expect(lerRascunho(chaveDoRascunho("u1", "conta2"), s)).toBeNull();
  });
  it("grava, lê e limpa", () => {
    const s = memoria();
    gravarRascunho(K1, rascunho, s);
    expect(lerRascunho(K1, s)).toEqual(rascunho);
    expect(lerRascunho(K2, s)).toBeNull();
    limparRascunho(K1, s);
    expect(lerRascunho(K1, s)).toBeNull();
  });
  it("rascunho vazio não ocupa espaço", () => {
    const s = memoria();
    gravarRascunho(K1, rascunho, s);
    gravarRascunho(K1, { comentario: "  ", marcacoes: [] }, s);
    expect(s.length).toBe(0);
  });
  it("marcação em formato antigo ou estragado não volta (o resto do rascunho sim)", () => {
    const s = memoria();
    s.setItem(K1, JSON.stringify({ comentario: "oi", marcacoes: [{}, rascunho.marcacoes[0], { pagina: "1", x: 0, y: 0, texto: "x" }] }));
    expect(lerRascunho(K1, s)).toEqual({ comentario: "oi", marcacoes: [rascunho.marcacoes[0]] });
  });
  it("conteúdo estragado ou armazenamento que lança: null, sem erro", () => {
    const s = memoria();
    s.setItem(K1, "{nao é json");
    expect(lerRascunho(K1, s)).toBeNull();
    s.setItem(K1, JSON.stringify({ comentario: 1, marcacoes: "x" }));
    expect(lerRascunho(K1, s)).toBeNull();
    const quebrado = { ...memoria(), getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); } } as Storage;
    expect(lerRascunho(K1, quebrado)).toBeNull();
    expect(() => gravarRascunho(K1, rascunho, quebrado)).not.toThrow();
  });
});

describe("rascunho local do pedido no modelo 3D", () => {
  const modelo: RascunhoModelo = {
    comentario: "Revisar a escada",
    marcacoes: [
      { id: "a", modeloId: "u1", guids: ["g1"], ponto: [1, 2, 3], camera: { position: [9, 9, 9], target: [0, 0, 0] }, texto: "degrau" },
    ],
  };
  it("chave por conta e projeto, separada da chave da prancha", () => {
    expect(chaveDoRascunhoModelo("p1", "conta1")).toBe("pedido-revisao-modelo:conta1:p1");
    expect(chaveDoRascunhoModelo("p1", "conta1")).not.toBe(chaveDoRascunho("p1", "conta1"));
    const s = memoria();
    gravarRascunhoModelo(chaveDoRascunhoModelo("p1", "conta1"), modelo, s);
    expect(lerRascunhoModelo(chaveDoRascunhoModelo("p1", "conta2"), s)).toBeNull();
    expect(lerRascunhoModelo(chaveDoRascunhoModelo("p2", "conta1"), s)).toBeNull();
  });
  it("grava e lê (sem imagem: nada binário vai ao armazenamento)", () => {
    const s = memoria();
    const k = chaveDoRascunhoModelo("p1", "c1");
    gravarRascunhoModelo(k, modelo, s);
    expect(lerRascunhoModelo(k, s)).toEqual(modelo);
    expect(s.getItem(k)).not.toMatch(/blob|data:image/);
    gravarRascunhoModelo(k, { comentario: " ", marcacoes: [] }, s);
    expect(s.length).toBe(0);
  });
  it("marcação 3D estragada fica de fora; o resto volta", () => {
    const s = memoria();
    const k = chaveDoRascunhoModelo("p1", "c1");
    const ruins = [
      {},
      { ...modelo.marcacoes[0], ponto: [1, 2] },
      { ...modelo.marcacoes[0], camera: { position: [1, 2, 3] } },
      { ...modelo.marcacoes[0], guids: "g1" },
      { ...modelo.marcacoes[0], modeloId: 5 },
    ];
    s.setItem(k, JSON.stringify({ comentario: "oi", marcacoes: [...ruins, modelo.marcacoes[0]] }));
    expect(lerRascunhoModelo(k, s)).toEqual({ comentario: "oi", marcacoes: [modelo.marcacoes[0]] });
    s.setItem(k, "{x");
    expect(lerRascunhoModelo(k, s)).toBeNull();
  });
});
