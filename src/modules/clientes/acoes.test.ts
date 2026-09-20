import { describe, expect, it } from "vitest";

import {
  ACAO_ALTERNAR_ATIVO,
  ACAO_COPIAR_DOCUMENTO,
  ACAO_COPIAR_EMAIL,
  ACAO_COPIAR_NOME,
  ACAO_EDITAR,
  ACAO_LOTE_DESATIVAR,
  ACAO_LOTE_REATIVAR,
  itensDeCliente,
  itensDeLoteClientes,
} from "./acoes";

const cliente = { id: "c1", ativo: true, documento: "12.345.678/0001-90", email: "a@b.com" };
const ids = (itens: { id: string }[]) => itens.map((i) => i.id);
const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);

describe("itensDeCliente", () => {
  it("quem gere recebe abrir, editar, desativar e as cópias", () => {
    expect(ids(itensDeCliente(cliente, { podeGerir: true }))).toEqual([
      "abrir",
      "abrir-nova-aba",
      ACAO_EDITAR,
      ACAO_ALTERNAR_ATIVO,
      "sep-copiar",
      ACAO_COPIAR_NOME,
      ACAO_COPIAR_DOCUMENTO,
      ACAO_COPIAR_EMAIL,
    ]);
  });

  // Regra 5 da ADR-0002: o que o PERFIL não permite some.
  it("quem só vê não recebe editar nem desativar", () => {
    const itens = itensDeCliente(cliente, { podeGerir: false });
    expect(achar(itens, ACAO_EDITAR)).toBeUndefined();
    expect(achar(itens, ACAO_ALTERNAR_ATIVO)).toBeUndefined();
    expect(achar(itens, "abrir")).toBeDefined();
  });

  it("o rótulo do alternar segue o estado", () => {
    expect(achar(itensDeCliente(cliente, { podeGerir: true }), ACAO_ALTERNAR_ATIVO)).toMatchObject({ rotulo: "Desativar" });
    expect(achar(itensDeCliente({ ...cliente, ativo: false }, { podeGerir: true }), ACAO_ALTERNAR_ATIVO)).toMatchObject({
      rotulo: "Reativar",
    });
  });

  it("não oferece copiar o que o cliente não tem", () => {
    const itens = itensDeCliente({ ...cliente, documento: null, email: null }, { podeGerir: true });
    expect(achar(itens, ACAO_COPIAR_DOCUMENTO)).toBeUndefined();
    expect(achar(itens, ACAO_COPIAR_EMAIL)).toBeUndefined();
    expect(achar(itens, ACAO_COPIAR_NOME)).toBeDefined();
  });

  it("o link de abrir em nova aba é um link de verdade", () => {
    expect(achar(itensDeCliente(cliente, { podeGerir: false }), "abrir-nova-aba")).toMatchObject({
      tipo: "link",
      href: "/clientes/c1",
      novaAba: true,
    });
  });
});

describe("itensDeLoteClientes", () => {
  it("quem gere: desativar e reativar", () => {
    expect(ids(itensDeLoteClientes({ podeGerir: true }))).toEqual([ACAO_LOTE_DESATIVAR, ACAO_LOTE_REATIVAR]);
  });

  it("quem só vê não tem ação em lote", () => {
    expect(itensDeLoteClientes({ podeGerir: false })).toEqual([]);
  });
});
