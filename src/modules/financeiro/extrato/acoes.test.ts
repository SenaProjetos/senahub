import { describe, expect, it } from "vitest";
import type { AcaoItem } from "@/components/ui/acoes";
import { ACAO_CONCILIAR_LINHA, ACAO_ESTORNAR_LINHA, MOTIVO_JA_CONCILIADO, itensDeLinhaDoExtrato } from "./acoes";
import { MOTIVO_CONCILIADO, MOTIVO_PROJETISTA } from "@/modules/financeiro/lancamentos/transicoes";

const achar = (xs: readonly AcaoItem[], id: string) => xs.find((x) => x.id === id);
const base = { id: "l1", conciliado: false, deProducao: false };
const tudo = { podeGerir: true, podeConciliar: true };

describe("itensDeLinhaDoExtrato", () => {
  it("ver o lançamento e conciliar são links de verdade", () => {
    const itens = itensDeLinhaDoExtrato(base, tudo);
    expect(achar(itens, "ver-lancamento")).toMatchObject({ tipo: "link", href: "/financeiro/lancamentos?lancamento=l1" });
    expect(achar(itens, ACAO_CONCILIAR_LINHA)).toMatchObject({ tipo: "link", href: "/financeiro/conciliacao" });
  });
  it("já conciliado: conciliar desabilitado com motivo e estornar desabilitado com a frase do servidor", () => {
    const itens = itensDeLinhaDoExtrato({ ...base, conciliado: true }, tudo);
    expect(achar(itens, ACAO_CONCILIAR_LINHA)).toMatchObject({ tipo: "acao", desabilitado: MOTIVO_JA_CONCILIADO });
    expect(achar(itens, ACAO_ESTORNAR_LINHA)).toMatchObject({ desabilitado: MOTIVO_CONCILIADO });
  });
  it("produção estorna pela Produção", () => {
    expect(achar(itensDeLinhaDoExtrato({ ...base, deProducao: true }, tudo), ACAO_ESTORNAR_LINHA)).toMatchObject({ desabilitado: MOTIVO_PROJETISTA });
  });
  it("quem só vê: sem estornar nem conciliar (omitidos), sem separador solto", () => {
    const itens = itensDeLinhaDoExtrato(base, { podeGerir: false, podeConciliar: false });
    expect(itens.map((i) => i.id)).toEqual(["ver-lancamento", "copiar-descricao"]);
  });
});
