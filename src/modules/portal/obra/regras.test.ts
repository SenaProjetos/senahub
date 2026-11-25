import { describe, expect, it } from "vitest";
import { MSG_PORTAL } from "../acesso-regras";
import {
  MOTIVO_OBRA_DE_OUTRO_CLIENTE,
  MOTIVO_OBRA_NAO_ENCONTRADA,
  decidirAcessoObra,
  deveReativarPorAcessoAte,
  motivoListaDeObras,
  normalizarEmpresa,
  obrasValidas,
  type EntradaAcessoObra,
} from "./regras";

const ok: EntradaAcessoObra = {
  temSessao: true,
  tipo: "externo",
  clienteIdDaConta: null,
  temContaObra: true,
  contaClienteId: null,
  contaClienteAtivo: false,
  naLista: true,
  projetoClienteId: "cA",
  projetoClienteAtivo: true,
  mustChangePassword: false,
  termoPendente: false,
};
const NEUTRO = { ok: false, status: 404, erro: MSG_PORTAL.indisponivel };

describe("decidirAcessoObra", () => {
  it("obra da lista, conta de fora, cliente do projeto ativo: entra", () => {
    expect(decidirAcessoObra(ok)).toEqual({ ok: true });
  });

  it("sem sessão: 401", () => {
    expect(decidirAcessoObra({ ...ok, temSessao: false })).toMatchObject({ ok: false, status: 401 });
  });

  it("quem não é conta de obra cai no 404 neutro", () => {
    expect(decidirAcessoObra({ ...ok, tipo: "interno" })).toEqual(NEUTRO);
    expect(decidirAcessoObra({ ...ok, clienteIdDaConta: "cA" })).toEqual(NEUTRO);
    expect(decidirAcessoObra({ ...ok, temContaObra: false })).toEqual(NEUTRO);
  });

  it("projeto inexistente, fora da lista ou de cliente desativado: 404 neutro", () => {
    expect(decidirAcessoObra({ ...ok, projetoClienteId: null })).toEqual(NEUTRO);
    expect(decidirAcessoObra({ ...ok, naLista: false })).toEqual(NEUTRO);
    expect(decidirAcessoObra({ ...ok, projetoClienteAtivo: false })).toEqual(NEUTRO);
  });

  it("conta do cliente: cliente da conta desativado ou projeto de outro cliente fecham", () => {
    const doCliente = { ...ok, contaClienteId: "cA", contaClienteAtivo: true };
    expect(decidirAcessoObra(doCliente)).toEqual({ ok: true });
    expect(decidirAcessoObra({ ...doCliente, contaClienteAtivo: false })).toEqual(NEUTRO);
    expect(decidirAcessoObra({ ...doCliente, projetoClienteId: "cB" })).toEqual(NEUTRO);
  });

  it("senha e termo dão 403 só depois de saber que a obra é da pessoa", () => {
    expect(decidirAcessoObra({ ...ok, mustChangePassword: true })).toEqual({ ok: false, status: 403, erro: MSG_PORTAL.senha });
    expect(decidirAcessoObra({ ...ok, termoPendente: true })).toEqual({ ok: false, status: 403, erro: MSG_PORTAL.termo });
    expect(decidirAcessoObra({ ...ok, naLista: false, mustChangePassword: true })).toEqual(NEUTRO);
  });
});

describe("obrasValidas", () => {
  const itens = [
    { projetoId: "p1", clienteId: "cA", clienteAtivo: true },
    { projetoId: "p2", clienteId: "cB", clienteAtivo: true },
    { projetoId: "p3", clienteId: "cC", clienteAtivo: false },
  ];

  it("conta de fora: só cliente do projeto ativo", () => {
    expect(obrasValidas({ clienteId: null, clienteAtivo: false }, itens).map((i) => i.projetoId)).toEqual(["p1", "p2"]);
  });

  it("conta do cliente: só obras desse cliente", () => {
    expect(obrasValidas({ clienteId: "cA", clienteAtivo: true }, itens).map((i) => i.projetoId)).toEqual(["p1"]);
  });

  it("conta do cliente com o cliente desativado: nada", () => {
    expect(obrasValidas({ clienteId: "cA", clienteAtivo: false }, itens)).toEqual([]);
  });
});

describe("motivoListaDeObras", () => {
  const projetos = [
    { id: "p1", clienteId: "cA" },
    { id: "p2", clienteId: "cB" },
  ];

  it("lista vazia ou conta de fora com clientes diferentes: aceita", () => {
    expect(motivoListaDeObras(null, projetos, [])).toBeNull();
    expect(motivoListaDeObras(null, projetos, ["p1", "p2"])).toBeNull();
  });

  it("projeto que não existe: recusa", () => {
    expect(motivoListaDeObras(null, projetos, ["p1", "pX"])).toBe(MOTIVO_OBRA_NAO_ENCONTRADA);
  });

  it("conta do cliente com obra de outro cliente: recusa", () => {
    expect(motivoListaDeObras("cA", projetos, ["p1"])).toBeNull();
    expect(motivoListaDeObras("cA", projetos, ["p1", "p2"])).toBe(MOTIVO_OBRA_DE_OUTRO_CLIENTE);
  });
});

describe("normalizarEmpresa", () => {
  it("apara e aceita de 1 a 120 caracteres", () => {
    expect(normalizarEmpresa("  Construtora Alfa  ")).toBe("Construtora Alfa");
    expect(normalizarEmpresa("x".repeat(120))).toBe("x".repeat(120));
  });

  it("vazio ou longo demais: null", () => {
    expect(normalizarEmpresa("   ")).toBeNull();
    expect(normalizarEmpresa("x".repeat(121))).toBeNull();
  });
});

describe("deveReativarPorAcessoAte", () => {
  const hoje = "2026-11-25";

  it("conta desligada pelo vencimento e data nova de hoje em diante: reativa", () => {
    expect(deveReativarPorAcessoAte({ ativo: false, acessoAteAntes: "2026-11-20", acessoAteNovo: "2026-12-31", hoje })).toBe(true);
    expect(deveReativarPorAcessoAte({ ativo: false, acessoAteAntes: "2026-11-24", acessoAteNovo: hoje, hoje })).toBe(true);
  });

  it("desativada à mão (sem data vencida), ativa, ou sem data nova: não reativa", () => {
    expect(deveReativarPorAcessoAte({ ativo: false, acessoAteAntes: null, acessoAteNovo: "2026-12-31", hoje })).toBe(false);
    expect(deveReativarPorAcessoAte({ ativo: false, acessoAteAntes: "2026-12-01", acessoAteNovo: "2026-12-31", hoje })).toBe(false);
    expect(deveReativarPorAcessoAte({ ativo: true, acessoAteAntes: "2026-11-20", acessoAteNovo: "2026-12-31", hoje })).toBe(false);
    expect(deveReativarPorAcessoAte({ ativo: false, acessoAteAntes: "2026-11-20", acessoAteNovo: null, hoje })).toBe(false);
  });
});
