import { describe, expect, it } from "vitest";
import type { AcaoItem } from "@/components/ui/acoes";
import { ACAO_DETALHES_PAGA, ACAO_ESTORNAR_PAGA, ACAO_VER_NO_EXTRATO, itensDePaga } from "./acoes-paga";
import { MOTIVO_CONCILIADO, MOTIVO_PROJETISTA } from "./transicoes";
import { ACAO_CORRIGIR_PAGAMENTO } from "./acoes-corrigir";
import { ACAO_TRANSFERENCIA_EDITAR, ACAO_TRANSFERENCIA_ESTORNAR, ACAO_TRANSFERENCIA_EXCLUIR } from "@/modules/financeiro/transferencias/acoes";

const base = { anexos: 0, conciliado: false, deProducao: false, temConta: true };
const ids = (xs: readonly AcaoItem[]) => xs.map((x) => x.id);
const achar = (xs: readonly AcaoItem[], id: string) => xs.find((x) => x.id === id);

describe("itensDePaga", () => {
  it("quem gere: detalhes, extrato, copiar, corrigir pagamento e estornar (com confirmação)", () => {
    const itens = itensDePaga(base, { podeGerir: true });
    expect(ids(itens)).toEqual([ACAO_DETALHES_PAGA, ACAO_VER_NO_EXTRATO, "copiar-descricao", ACAO_CORRIGIR_PAGAMENTO, "sep-estorno", ACAO_ESTORNAR_PAGA]);
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
  it("pagamento de produção: corrigir fica desabilitado com a frase da Produção", () => {
    expect(achar(itensDePaga({ ...base, deProducao: true }, { podeGerir: true }), ACAO_CORRIGIR_PAGAMENTO)).toMatchObject({ desabilitado: MOTIVO_PROJETISTA });
  });
  it("quem só vê não recebe o corrigir pagamento", () => {
    expect(achar(itensDePaga(base, { podeGerir: false }), ACAO_CORRIGIR_PAGAMENTO)).toBeUndefined();
  });
  it("perna de transferência: o menu é o da transferência inteira, sem estornar a perna solta", () => {
    const itens = itensDePaga({ ...base, deTransferencia: true }, { podeGerir: true });
    expect(achar(itens, ACAO_TRANSFERENCIA_EDITAR)).toBeTruthy();
    expect(achar(itens, ACAO_TRANSFERENCIA_ESTORNAR)).toBeTruthy();
    expect(achar(itens, ACAO_TRANSFERENCIA_EXCLUIR)).toBeTruthy();
    expect(achar(itens, ACAO_ESTORNAR_PAGA)).toBeUndefined();
    expect(achar(itens, ACAO_CORRIGIR_PAGAMENTO)).toBeUndefined();
  });
  it("transferência conciliada: editar, estornar e excluir desabilitados com a frase do servidor", () => {
    const itens = itensDePaga({ ...base, deTransferencia: true, conciliado: true }, { podeGerir: true });
    for (const id of [ACAO_TRANSFERENCIA_EDITAR, ACAO_TRANSFERENCIA_ESTORNAR, ACAO_TRANSFERENCIA_EXCLUIR]) {
      expect(achar(itens, id)).toMatchObject({ desabilitado: MOTIVO_CONCILIADO });
    }
  });
});
