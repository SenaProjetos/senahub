import { describe, expect, it } from "vitest";
import {
  ACAO_CONCILIAR,
  ACAO_CRIAR,
  ACAO_IGNORAR,
  idDeConciliar,
  itensDeTransacao,
  lancamentoDeConciliar,
  MOTIVO_SEM_CATEGORIA,
  MOTIVO_SEM_SUGESTAO,
} from "@/modules/financeiro/conciliacao/acoes";

const ids = (itens: ReturnType<typeof itensDeTransacao>) => itens.map((i) => i.id);
const prev = (id: string, descricao: string) => ({ id, descricao, status: "previsto" });

describe("itensDeTransacao", () => {
  it("quem não concilia não recebe menu nenhum", () => {
    expect(itensDeTransacao({ sugestoes: [prev("l1", "Aluguel")], temCategoria: true }, { podeConciliar: false })).toEqual([]);
  });

  it("uma sugestão vira item direto, com o id carregando o lançamento", () => {
    const itens = itensDeTransacao({ sugestoes: [prev("l1", "Aluguel")], temCategoria: true }, { podeConciliar: true });
    expect(ids(itens)).toEqual([idDeConciliar("l1"), ACAO_CRIAR, "sep", ACAO_IGNORAR]);
    expect(lancamentoDeConciliar(idDeConciliar("l1"))).toBe("l1");
    expect(lancamentoDeConciliar(ACAO_CRIAR)).toBeNull();
  });

  it("várias sugestões viram submenu", () => {
    const itens = itensDeTransacao({ sugestoes: [prev("l1", "A"), prev("l2", "B")], temCategoria: true }, { podeConciliar: true });
    const sub = itens.find((i) => i.id === ACAO_CONCILIAR);
    expect(sub?.tipo).toBe("sub");
    expect(sub?.tipo === "sub" && sub.itens.map((i) => i.id)).toEqual([idDeConciliar("l1"), idDeConciliar("l2")]);
  });

  it("lançamento já confirmado é anunciado como reconciliação", () => {
    const itens = itensDeTransacao({ sugestoes: [{ id: "l1", descricao: "Aluguel", status: "confirmado" }], temCategoria: true }, { podeConciliar: true });
    const i = itens.find((x) => x.id === idDeConciliar("l1"));
    expect(i?.tipo === "acao" && i.rotulo).toBe("Aluguel (já confirmado)");
  });

  it("sem sugestão e sem categoria, os dois caminhos dizem por que estão fechados", () => {
    const itens = itensDeTransacao({ sugestoes: [], temCategoria: false }, { podeConciliar: true });
    const conciliar = itens.find((i) => i.id === ACAO_CONCILIAR);
    const criar = itens.find((i) => i.id === ACAO_CRIAR);
    expect(conciliar?.tipo === "acao" && conciliar.desabilitado).toBe(MOTIVO_SEM_SUGESTAO);
    expect(criar?.tipo === "acao" && criar.desabilitado).toBe(MOTIVO_SEM_CATEGORIA);
  });

  it("ignorar é destrutivo e pede confirmação (regra 4 da ADR)", () => {
    const itens = itensDeTransacao({ sugestoes: [], temCategoria: true }, { podeConciliar: true });
    const ignorar = itens.find((i) => i.id === ACAO_IGNORAR);
    expect(ignorar?.tipo === "acao" && ignorar.variant).toBe("destructive");
    expect(ignorar?.tipo === "acao" && !!ignorar.confirmar).toBe(true);
  });
});
