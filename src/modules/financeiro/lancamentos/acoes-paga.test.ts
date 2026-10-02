import { describe, expect, it } from "vitest";
import type { AcaoItem } from "@/components/ui/acoes";
import { ACAO_DETALHES_PAGA, ACAO_ESTORNAR_PAGA, ACAO_VER_NO_EXTRATO, itensDePaga } from "./acoes-paga";
import { MOTIVO_CONCILIADO, MOTIVO_PROJETISTA } from "./transicoes";

const base = { anexos: 0, conciliado: false, deProducao: false, temConta: true };
const ids = (xs: readonly AcaoItem[]) => xs.map((x) => x.id);
const achar = (xs: readonly AcaoItem[], id: string) => xs.find((x) => x.id === id);

describe("itensDePaga", () => {
  it("quem gere: detalhes, extrato, copiar e estornar (com confirmação)", () => {
    const itens = itensDePaga(base, { podeGerir: true });
    expect(ids(itens)).toEqual([ACAO_DETALHES_PAGA, ACAO_VER_NO_EXTRATO, "copiar-descricao", "sep-estorno", ACAO_ESTORNAR_PAGA]);
    expect(achar(itens, ACAO_ESTORNAR_PAGA)).toMatchObject({ desabilitado: undefined, confirmar: { rotuloConfirmar: "Estornar" } });
  });
  it("quem só vê não recebe o estorno (item omitido, não desabilitado)", () => {
    expect(ids(itensDePaga(base, { podeGerir: false }))).toEqual([ACAO_DETALHES_PAGA, ACAO_VER_NO_EXTRATO, "copiar-descricao"]);
  });
  it("conciliado e produção desabilitam o estorno com a frase do servidor", () => {
    expect(achar(itensDePaga({ ...base, conciliado: true }, { podeGerir: true }), ACAO_ESTORNAR_PAGA)).toMatchObject({ desabilitado: MOTIVO_CONCILIADO });
    expect(achar(itensDePaga({ ...base, deProducao: true }, { podeGerir: true }), ACAO_ESTORNAR_PAGA)).toMatchObject({ desabilitado: MOTIVO_PROJETISTA });
  });
  it("sem conta não há extrato para abrir; anexos aparecem no rótulo", () => {
    expect(achar(itensDePaga({ ...base, temConta: false }, { podeGerir: false }), ACAO_VER_NO_EXTRATO)).toBeUndefined();
    expect(achar(itensDePaga({ ...base, anexos: 2 }, { podeGerir: false }), ACAO_DETALHES_PAGA)).toMatchObject({ rotulo: "Detalhes (2)" });
  });
});
