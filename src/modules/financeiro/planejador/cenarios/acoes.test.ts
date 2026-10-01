import { describe, expect, it } from "vitest";
import {
  ACAO_ARQUIVAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_COMPARAR,
  ACAO_RENOMEAR,
  ACAO_RESTAURAR,
  itensDeCenario,
  itensDeLoteCenarios,
  MOTIVO_COMPARAR_MAX,
  type ContextoCenario,
} from "@/modules/financeiro/planejador/cenarios/acoes";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const meu = { id: "c1", nome: "Outubro", situacao: "rascunho" as const, autorId: "eu" };
const ctx = (p: Partial<ContextoCenario> = {}): ContextoCenario => ({ usuarioId: "eu", podeSalvar: true, podeGerir: false, ...p });

describe("itensDeCenario (ADR-0002)", () => {
  it("dono: tudo, com excluir destrutivo e confirmado", () => {
    const itens = itensDeCenario(meu, ctx());
    expect(ids(itens)).toEqual(["abrir", "comparar", "duplicar", ACAO_RENOMEAR, "sep", "copiar-link", ACAO_ARQUIVAR, ACAO_EXCLUIR]);
    expect(itens.find((i) => i.id === ACAO_EXCLUIR)).toMatchObject({ variant: "destructive", confirmar: expect.any(Object) });
    expect(itens[0]).toMatchObject({ tipo: "link", href: "/financeiro/planejador?cenario=c1" });
  });

  it("cenário de outra pessoa: sem renomear/arquivar/excluir, a menos que gere o Financeiro", () => {
    const outro = { ...meu, autorId: "ela" };
    expect(ids(itensDeCenario(outro, ctx()))).not.toContain(ACAO_RENOMEAR);
    expect(ids(itensDeCenario(outro, ctx()))).not.toContain(ACAO_EXCLUIR);
    expect(ids(itensDeCenario(outro, ctx({ podeGerir: true })))).toContain(ACAO_EXCLUIR);
  });

  it("sócio que só lê: abrir, comparar e copiar link", () => {
    expect(ids(itensDeCenario(meu, ctx({ podeSalvar: false })))).toEqual(["abrir", "comparar", "sep", "copiar-link"]);
  });

  it("arquivado: restaurar no lugar de arquivar", () => {
    const itens = ids(itensDeCenario({ ...meu, situacao: "arquivado" }, ctx()));
    expect(itens).toContain(ACAO_RESTAURAR);
    expect(itens).not.toContain(ACAO_ARQUIVAR);
  });
});

describe("itensDeLoteCenarios", () => {
  it("comparar desabilita acima de 3 com o motivo", () => {
    expect(itensDeLoteCenarios(4, ctx(), false)[0]).toMatchObject({ id: ACAO_LOTE_COMPARAR, desabilitado: MOTIVO_COMPARAR_MAX });
    expect(itensDeLoteCenarios(2, ctx(), false)[0]).toMatchObject({ desabilitado: undefined });
  });
  it("arquivar só para quem salva e fora da aba de arquivados", () => {
    expect(ids(itensDeLoteCenarios(2, ctx(), false))).toContain(ACAO_LOTE_ARQUIVAR);
    expect(ids(itensDeLoteCenarios(2, ctx(), true))).not.toContain(ACAO_LOTE_ARQUIVAR);
    expect(ids(itensDeLoteCenarios(2, ctx({ podeSalvar: false }), false))).not.toContain(ACAO_LOTE_ARQUIVAR);
  });
});
