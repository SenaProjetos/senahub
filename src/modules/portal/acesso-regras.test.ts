import { describe, expect, it } from "vitest";
import { decidirAcessoPortal, type EntradaAcessoPortal } from "./acesso-regras";

const base: EntradaAcessoPortal = {
  temSessao: true,
  tipo: "externo",
  clienteId: "c1",
  mustChangePassword: false,
  termoPendente: false,
  projetoClienteId: "c1",
};
const indisponivel = { ok: false, status: 404, erro: "Arquivo indisponível." };

describe("decidirAcessoPortal", () => {
  it("cliente do projeto, com termo e senha em dia, acessa", () => {
    expect(decidirAcessoPortal(base)).toEqual({ ok: true });
  });

  it("sem sessão → 401", () => {
    expect(decidirAcessoPortal({ ...base, temSessao: false })).toEqual({ ok: false, status: 401, erro: "Não autenticado." });
  });

  it("interno → 404 (o portal não é tela dele)", () => {
    expect(decidirAcessoPortal({ ...base, tipo: "interno" })).toEqual(indisponivel);
  });

  it("externo sem cliente vinculado → 404", () => {
    expect(decidirAcessoPortal({ ...base, clienteId: null })).toEqual(indisponivel);
  });

  it("projeto de outro cliente e projeto inexistente dão a mesma resposta", () => {
    expect(decidirAcessoPortal({ ...base, projetoClienteId: "c2" })).toEqual(indisponivel);
    expect(decidirAcessoPortal({ ...base, projetoClienteId: null })).toEqual(indisponivel);
  });

  it("troca de senha pendente → 403", () => {
    expect(decidirAcessoPortal({ ...base, mustChangePassword: true })).toEqual({
      ok: false,
      status: 403,
      erro: "Troque a senha para continuar.",
    });
  });

  it("termo pendente → 403", () => {
    expect(decidirAcessoPortal({ ...base, termoPendente: true })).toEqual({
      ok: false,
      status: 403,
      erro: "Aceite o termo de uso para continuar.",
    });
  });

  it("senha é cobrada antes do termo", () => {
    expect(decidirAcessoPortal({ ...base, mustChangePassword: true, termoPendente: true })).toMatchObject({
      erro: "Troque a senha para continuar.",
    });
  });

  it("termo/senha só depois do projeto: projeto alheio com termo pendente segue 404", () => {
    expect(decidirAcessoPortal({ ...base, projetoClienteId: "c2", termoPendente: true })).toEqual(indisponivel);
  });
});
