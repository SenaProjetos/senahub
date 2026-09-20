import { describe, expect, it } from "vitest";

import {
  ACAO_DESATIVAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_DESATIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_REATIVAR,
  ACAO_REATIVAR,
  ACAO_REINICIAR_SENHA,
  MOTIVO_EXCLUIR_SO_INATIVOS,
  MOTIVO_TODOS_ATIVOS,
  MOTIVO_TODOS_INATIVOS,
  MOTIVO_UM_POR_VEZ,
  itensDeLoteUsuarios,
  itensDeUsuario,
} from "./acoes";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);
const ativo = { ativo: true };
const inativo = { ativo: false };

describe("itensDeUsuario", () => {
  it("ativo: oferece desativar, nunca reativar nem excluir", () => {
    const itens = itensDeUsuario(ativo, { podeExcluir: true });
    expect(achar(itens, ACAO_DESATIVAR)).toBeDefined();
    expect(achar(itens, ACAO_REATIVAR)).toBeUndefined();
    expect(achar(itens, ACAO_EXCLUIR)).toBeUndefined();
  });

  it("inativo: oferece reativar e, a quem pode, excluir", () => {
    const itens = itensDeUsuario(inativo, { podeExcluir: true });
    expect(achar(itens, ACAO_REATIVAR)).toBeDefined();
    expect(achar(itens, ACAO_EXCLUIR)).toBeDefined();
    expect(achar(itens, ACAO_DESATIVAR)).toBeUndefined();
  });

  // Regra 5 da ADR-0002: o que o PERFIL não permite some.
  it("quem não pode excluir não recebe o item", () => {
    expect(achar(itensDeUsuario(inativo, { podeExcluir: false }), ACAO_EXCLUIR)).toBeUndefined();
  });

  // Antes o "Desativar" do "..." agia direto, sem perguntar.
  it("desativar é destrutivo e pede confirmação (regra 4 da ADR-0002)", () => {
    const d = achar(itensDeUsuario(ativo, { podeExcluir: false }), ACAO_DESATIVAR);
    expect(d).toMatchObject({ variant: "destructive" });
    expect((d as { confirmar?: { titulo: string } }).confirmar?.titulo).toBeTruthy();
  });

  it("excluir é destrutivo, mas a confirmação é a da própria tela (não duplica)", () => {
    const e = achar(itensDeUsuario(inativo, { podeExcluir: true }), ACAO_EXCLUIR);
    expect(e).toMatchObject({ variant: "destructive" });
    expect(e).not.toHaveProperty("confirmar");
  });
});

describe("itensDeLoteUsuarios", () => {
  const todos = { podeExcluir: true };

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
    expect(achar(itensDeLoteUsuarios([inativo], { podeExcluir: false }), ACAO_LOTE_EXCLUIR)).toBeUndefined();
  });

  it("desativar e excluir em lote pedem confirmação", () => {
    const itens = itensDeLoteUsuarios([ativo, inativo], todos);
    for (const id of [ACAO_LOTE_DESATIVAR, ACAO_LOTE_EXCLUIR]) {
      expect((achar(itens, id) as { confirmar?: { titulo: string } }).confirmar?.titulo).toBeTruthy();
    }
  });
});
