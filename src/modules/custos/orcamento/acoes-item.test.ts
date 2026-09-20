import { describe, expect, it } from "vitest";

import {
  ACAO_DESTRAVAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_DESTRAVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_TRAVAR,
  ACAO_SERVICO_COMPOSICAO,
  ACAO_SUBGRUPO,
  ACAO_TRAVAR,
  ACAO_VINCULAR_COMPOSICAO,
  MOTIVO_NENHUM_TRAVADO,
  MOTIVO_SEM_BASE,
  MOTIVO_SO_SERVICO,
  MOTIVO_TODOS_TRAVADOS,
  MOTIVO_UM_POR_VEZ,
  itensDeItemOrcamento,
  itensDeLoteItensOrcamento,
  semDescendentesDeSelecionados,
} from "./acoes-item";

const achar = (itens: { id: string }[], id: string) => itens.find((i) => i.id === id);
const grupo = { tipo: "grupo", bloqueado: false };
const servico = { tipo: "servico", bloqueado: false };
const servicoTravado = { tipo: "servico", bloqueado: true };
const comBase = { temBasePreco: true };

describe("itensDeItemOrcamento", () => {
  it("grupo oferece criar dentro dele; serviço oferece vincular e travar", () => {
    const g = itensDeItemOrcamento(grupo, comBase);
    expect(achar(g, ACAO_SUBGRUPO)).toBeDefined();
    expect(achar(g, ACAO_SERVICO_COMPOSICAO)).toBeDefined();
    expect(achar(g, ACAO_VINCULAR_COMPOSICAO)).toBeUndefined();
    expect(achar(g, ACAO_TRAVAR)).toBeUndefined();

    const s = itensDeItemOrcamento(servico, comBase);
    expect(achar(s, ACAO_SUBGRUPO)).toBeUndefined();
    expect(achar(s, ACAO_VINCULAR_COMPOSICAO)).toBeDefined();
    expect(achar(s, ACAO_TRAVAR)).toBeDefined();
  });

  it("serviço travado oferece destravar, e não travar", () => {
    const itens = itensDeItemOrcamento(servicoTravado, comBase);
    expect(achar(itens, ACAO_DESTRAVAR)).toBeDefined();
    expect(achar(itens, ACAO_TRAVAR)).toBeUndefined();
  });

  it("sem base de preço, o que depende dela fica desabilitado com o motivo", () => {
    const itens = itensDeItemOrcamento(grupo, { temBasePreco: false });
    expect(achar(itens, ACAO_SERVICO_COMPOSICAO)).toMatchObject({ desabilitado: MOTIVO_SEM_BASE });
    expect((achar(itens, ACAO_SUBGRUPO) as { desabilitado?: string }).desabilitado).toBeUndefined();
  });

  it("excluir é destrutivo, mas a confirmação é a da própria tela (não duplica)", () => {
    const e = achar(itensDeItemOrcamento(servico, comBase), ACAO_EXCLUIR);
    expect(e).toMatchObject({ variant: "destructive" });
    expect(e).not.toHaveProperty("confirmar");
  });
});

describe("itensDeLoteItensOrcamento", () => {
  it("editar fica desabilitado, com o motivo, e não escondido", () => {
    expect(achar(itensDeLoteItensOrcamento([servico, grupo]), ACAO_EDITAR)).toMatchObject({
      desabilitado: MOTIVO_UM_POR_VEZ,
    });
  });

  it("travar só alcança serviços", () => {
    expect(achar(itensDeLoteItensOrcamento([grupo, grupo]), ACAO_LOTE_TRAVAR)).toMatchObject({
      desabilitado: MOTIVO_SO_SERVICO,
    });
    expect(achar(itensDeLoteItensOrcamento([servicoTravado, servicoTravado]), ACAO_LOTE_TRAVAR)).toMatchObject({
      desabilitado: MOTIVO_TODOS_TRAVADOS,
    });
    expect((achar(itensDeLoteItensOrcamento([servico, grupo]), ACAO_LOTE_TRAVAR) as { desabilitado?: string }).desabilitado).toBeUndefined();
  });

  it("destravar desabilita quando nenhum serviço está travado", () => {
    expect(achar(itensDeLoteItensOrcamento([servico, servico]), ACAO_LOTE_DESTRAVAR)).toMatchObject({
      desabilitado: MOTIVO_NENHUM_TRAVADO,
    });
  });

  it("excluir em lote pede confirmação", () => {
    const e = achar(itensDeLoteItensOrcamento([servico]), ACAO_LOTE_EXCLUIR) as { confirmar?: { titulo: string } };
    expect(e.confirmar?.titulo).toBeTruthy();
  });
});

describe("semDescendentesDeSelecionados", () => {
  const todos = [
    { id: "1", parentId: null },
    { id: "1.1", parentId: "1" },
    { id: "1.1.1", parentId: "1.1" },
    { id: "2", parentId: null },
  ];

  it("tira o filho quando o pai também está marcado, em qualquer profundidade", () => {
    const sel = [todos[0], todos[2], todos[3]];
    expect(semDescendentesDeSelecionados(sel, todos).map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("mantém o filho quando o pai não está marcado", () => {
    expect(semDescendentesDeSelecionados([todos[1], todos[2]], todos).map((i) => i.id)).toEqual(["1.1"]);
  });

  it("não trava com um ciclo de dados", () => {
    const ciclo = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(() => semDescendentesDeSelecionados([ciclo[0]], ciclo)).not.toThrow();
  });
});
