import { describe, expect, it } from "vitest";

import {
  ACAO_DESATIVAR,
  ACAO_EDITAR,
  ACAO_ENVIAR_LINK_SENHA,
  ACAO_EXCLUIR,
  ACAO_LOTE_ENVIAR_LINK_SENHA,
  ACAO_LOTE_DESATIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_REATIVAR,
  ACAO_REATIVAR,
  ACAO_PERMISSOES,
  ACAO_REINICIAR_SENHA,
  ACAO_VER_FICHA,
  MOTIVO_EXCLUIR_SO_INATIVOS,
  MOTIVO_LINK_TODOS_INATIVOS,
  MOTIVO_TODOS_ATIVOS,
  MOTIVO_TODOS_INATIVOS,
  MOTIVO_UM_POR_VEZ,
  itensDeLoteUsuarios,
  itensDeUsuario,
  recebemLinkEmLote,
} from "./acoes";
import { MOTIVO_LINK_CONTA_INATIVA, MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA } from "@/modules/auth/redefinir-senha";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);
const ativo = { ativo: true, tipo: "interno" as const };
const inativo = { ativo: false, tipo: "interno" as const };
const clientePortal = { ativo: true, tipo: "externo" as const };

describe("itensDeUsuario", () => {
  it("equipe interna: oferece a ficha e as permissões individuais (RH → Pessoas)", () => {
    const itens = itensDeUsuario(ativo, { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false });
    expect(achar(itens, ACAO_VER_FICHA)).toBeDefined();
    expect(achar(itens, ACAO_PERMISSOES)).toBeDefined();
  });

  it("cliente do portal não tem ficha de RH nem permissões individuais", () => {
    const itens = itensDeUsuario(clientePortal, { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false });
    expect(achar(itens, ACAO_VER_FICHA)).toBeUndefined();
    expect(achar(itens, ACAO_PERMISSOES)).toBeUndefined();
  });

  it("ativo: oferece desativar, nunca reativar nem excluir", () => {
    const itens = itensDeUsuario(ativo, { podeExcluir: true, emailDoSistema: true, souSuperUsuario: false });
    expect(achar(itens, ACAO_DESATIVAR)).toBeDefined();
    expect(achar(itens, ACAO_REATIVAR)).toBeUndefined();
    expect(achar(itens, ACAO_EXCLUIR)).toBeUndefined();
  });

  it("inativo: oferece reativar e, a quem pode, excluir", () => {
    const itens = itensDeUsuario(inativo, { podeExcluir: true, emailDoSistema: true, souSuperUsuario: false });
    expect(achar(itens, ACAO_REATIVAR)).toBeDefined();
    expect(achar(itens, ACAO_EXCLUIR)).toBeDefined();
    expect(achar(itens, ACAO_DESATIVAR)).toBeUndefined();
  });

  // Regra 5 da ADR-0002: o que o PERFIL não permite some.
  it("quem não pode excluir não recebe o item", () => {
    expect(achar(itensDeUsuario(inativo, { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false }), ACAO_EXCLUIR)).toBeUndefined();
  });

  // Antes o "Desativar" do "..." agia direto, sem perguntar.
  it("desativar é destrutivo e pede confirmação (regra 4 da ADR-0002)", () => {
    const d = achar(itensDeUsuario(ativo, { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false }), ACAO_DESATIVAR);
    expect(d).toMatchObject({ variant: "destructive" });
    expect((d as { confirmar?: { titulo: string } }).confirmar?.titulo).toBeTruthy();
  });

  it("excluir é destrutivo, mas a confirmação é a da própria tela (não duplica)", () => {
    const e = achar(itensDeUsuario(inativo, { podeExcluir: true, emailDoSistema: true, souSuperUsuario: false }), ACAO_EXCLUIR);
    expect(e).toMatchObject({ variant: "destructive" });
    expect(e).not.toHaveProperty("confirmar");
  });
});

describe("itensDeLoteUsuarios", () => {
  const todos = { podeExcluir: true, emailDoSistema: true, souSuperUsuario: false };

  it("editar e reiniciar senha ficam desabilitados, com o motivo, e não escondidos", () => {
    const itens = itensDeLoteUsuarios([ativo, inativo], todos);
    expect(achar(itens, ACAO_EDITAR)).toMatchObject({ desabilitado: MOTIVO_UM_POR_VEZ });
    expect(achar(itens, ACAO_REINICIAR_SENHA)).toMatchObject({ desabilitado: MOTIVO_UM_POR_VEZ });
  });

  it("desativar/reativar desabilitam quando o estado impede", () => {
    expect(achar(itensDeLoteUsuarios([inativo, inativo], todos), ACAO_LOTE_DESATIVAR)).toMatchObject({
      desabilitado: MOTIVO_TODOS_INATIVOS,
    });
    expect(achar(itensDeLoteUsuarios([ativo, ativo], todos), ACAO_LOTE_REATIVAR)).toMatchObject({
      desabilitado: MOTIVO_TODOS_ATIVOS,
    });
  });

  it("excluir em lote: desabilitado se todos estão ativos, ausente para quem não pode", () => {
    expect(achar(itensDeLoteUsuarios([ativo, ativo], todos), ACAO_LOTE_EXCLUIR)).toMatchObject({
      desabilitado: MOTIVO_EXCLUIR_SO_INATIVOS,
    });
    expect(achar(itensDeLoteUsuarios([inativo], { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false }), ACAO_LOTE_EXCLUIR)).toBeUndefined();
  });

  it("desativar e excluir em lote pedem confirmação", () => {
    const itens = itensDeLoteUsuarios([ativo, inativo], todos);
    for (const id of [ACAO_LOTE_DESATIVAR, ACAO_LOTE_EXCLUIR]) {
      expect((achar(itens, id) as { confirmar?: { titulo: string } }).confirmar?.titulo).toBeTruthy();
    }
  });
});

describe("enviar link de nova senha", () => {
  const ctx = { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false };

  it("ativo (equipe e cliente do portal): habilitado, ao lado de gerar senha temporária", () => {
    for (const u of [ativo, clientePortal]) {
      const itens = itensDeUsuario(u, ctx);
      expect(achar(itens, ACAO_ENVIAR_LINK_SENHA)).toMatchObject({ desabilitado: undefined });
      expect(achar(itens, ACAO_REINICIAR_SENHA)).toMatchObject({ rotulo: "Gerar senha temporária" });
    }
  });

  it("conta desativada: desabilitado com a frase da action", () => {
    expect(achar(itensDeUsuario(inativo, ctx), ACAO_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: MOTIVO_LINK_CONTA_INATIVA,
    });
  });

  it("sem e-mail do sistema: desabilitado com o motivo, na linha e no lote", () => {
    const semEmail = { podeExcluir: false, emailDoSistema: false, souSuperUsuario: false };
    expect(achar(itensDeUsuario(ativo, semEmail), ACAO_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA,
    });
    expect(achar(itensDeLoteUsuarios([ativo], semEmail), ACAO_LOTE_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: MOTIVO_LINK_SEM_EMAIL_DO_SISTEMA,
    });
  });

  it("lote: vai para vários; só desabilita se todos estão desativados", () => {
    expect(achar(itensDeLoteUsuarios([ativo, inativo], ctx), ACAO_LOTE_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: undefined,
    });
    expect(achar(itensDeLoteUsuarios([inativo, inativo], ctx), ACAO_LOTE_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: MOTIVO_LINK_TODOS_INATIVOS,
    });
  });
});

describe("senha de superusuário e acesso encerrado", () => {
  const naoSuper = { podeExcluir: false, emailDoSistema: true, souSuperUsuario: false };
  const souSuper = { ...naoSuper, souSuperUsuario: true };
  const superAlvo = { ativo: true, tipo: "interno" as const, superUsuario: true };
  const encerrado = { ativo: true, tipo: "interno" as const, acessoEncerrado: true };

  it("quem não é superusuário não vê os itens de senha de um superusuário", () => {
    const itens = itensDeUsuario(superAlvo, naoSuper);
    expect(achar(itens, ACAO_ENVIAR_LINK_SENHA)).toBeUndefined();
    expect(achar(itens, ACAO_REINICIAR_SENHA)).toBeUndefined();
  });

  it("superusuário vê os itens de senha de outro superusuário", () => {
    const itens = itensDeUsuario(superAlvo, souSuper);
    expect(achar(itens, ACAO_ENVIAR_LINK_SENHA)).toBeDefined();
    expect(achar(itens, ACAO_REINICIAR_SENHA)).toBeDefined();
  });

  it("ativo com acesso encerrado: link desabilitado com a frase da action", () => {
    expect(achar(itensDeUsuario(encerrado, naoSuper), ACAO_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: MOTIVO_LINK_CONTA_INATIVA,
    });
  });

  it("lote: só recebe quem tem acesso e cuja senha quem olha pode mexer; confirma antes", () => {
    const sel = [ativo, inativo, encerrado, superAlvo];
    expect(recebemLinkEmLote(sel, naoSuper)).toEqual([ativo]);
    expect(recebemLinkEmLote(sel, souSuper)).toEqual([ativo, superAlvo]);
    expect(achar(itensDeLoteUsuarios([encerrado, superAlvo], naoSuper), ACAO_LOTE_ENVIAR_LINK_SENHA)).toMatchObject({
      desabilitado: MOTIVO_LINK_TODOS_INATIVOS,
    });
    const item = achar(itensDeLoteUsuarios(sel, naoSuper), ACAO_LOTE_ENVIAR_LINK_SENHA) as { confirmar?: { titulo: string } };
    expect(item.confirmar?.titulo).toBeTruthy();
  });
});
