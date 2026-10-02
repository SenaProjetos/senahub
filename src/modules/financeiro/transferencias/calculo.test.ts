import { describe, expect, it } from "vitest";
import {
  descricaoDaTransferencia,
  motivoParaNaoCriar,
  motivoParaNaoMexer,
  MOTIVO_INCOMPLETA,
  MOTIVO_MESMA_CONTA,
  MOTIVO_NAO_ESTA_PAGA,
  MOTIVO_NAO_ESTA_PREVISTA,
  MOTIVO_PERNAS_DIFERENTES,
  MOTIVO_TRANSFERENCIA_CANCELADA,
  MOTIVO_VALOR,
  situacaoDaTransferencia,
  type PernaDaTransferencia,
} from "@/modules/financeiro/transferencias/calculo";
import { MOTIVO_CONCILIADO } from "@/modules/financeiro/lancamentos/transicoes";

const par = (status: string, extra: Partial<PernaDaTransferencia> = {}): PernaDaTransferencia[] => [
  { id: "d", tipo: "despesa", status, conciliado: false },
  { id: "r", tipo: "receita", status, conciliado: false, ...extra },
];

describe("criar", () => {
  it("duas contas diferentes e valor positivo", () => {
    expect(motivoParaNaoCriar({ origemId: "a", destinoId: "b", valorCentavos: 100 })).toBeNull();
    expect(motivoParaNaoCriar({ origemId: "a", destinoId: "a", valorCentavos: 100 })).toBe(MOTIVO_MESMA_CONTA);
    expect(motivoParaNaoCriar({ origemId: "a", destinoId: "b", valorCentavos: 0 })).toBe(MOTIVO_VALOR);
    expect(motivoParaNaoCriar({ origemId: "", destinoId: "b", valorCentavos: 100 })).toContain("Escolha");
  });
});

describe("situação do par", () => {
  it("as duas pernas concordam ou a transferência é inconsistente", () => {
    expect(situacaoDaTransferencia(par("previsto"))).toBe("agendada");
    expect(situacaoDaTransferencia(par("confirmado"))).toBe("realizada");
    expect(situacaoDaTransferencia(par("cancelado"))).toBe("cancelada");
    expect(situacaoDaTransferencia([{ status: "previsto" }, { status: "confirmado" }])).toBe("inconsistente");
    expect(situacaoDaTransferencia([{ status: "previsto" }])).toBe("inconsistente");
  });
});

describe("o que se pode fazer com o par", () => {
  it("editar e excluir valem para agendada e realizada; baixar só agendada; estornar só realizada", () => {
    expect(motivoParaNaoMexer("editar", par("previsto"))).toBeNull();
    expect(motivoParaNaoMexer("editar", par("confirmado"))).toBeNull();
    expect(motivoParaNaoMexer("excluir", par("confirmado"))).toBeNull();
    expect(motivoParaNaoMexer("baixar", par("previsto"))).toBeNull();
    expect(motivoParaNaoMexer("baixar", par("confirmado"))).toBe(MOTIVO_NAO_ESTA_PREVISTA);
    expect(motivoParaNaoMexer("estornar", par("confirmado"))).toBeNull();
    expect(motivoParaNaoMexer("estornar", par("previsto"))).toBe(MOTIVO_NAO_ESTA_PAGA);
  });
  it("conciliada com o extrato de qualquer das contas não muda (editar, excluir, estornar)", () => {
    for (const op of ["editar", "excluir", "estornar"] as const) {
      expect(motivoParaNaoMexer(op, par("confirmado", { conciliado: true }))).toBe(MOTIVO_CONCILIADO);
    }
  });
  it("par incompleto, dessincronizado ou cancelado recusa tudo com a frase certa", () => {
    expect(motivoParaNaoMexer("editar", [par("previsto")[0]])).toBe(MOTIVO_INCOMPLETA);
    expect(motivoParaNaoMexer("editar", [{ id: "d", tipo: "despesa", status: "previsto", conciliado: false }, { id: "r", tipo: "receita", status: "confirmado", conciliado: false }])).toBe(MOTIVO_PERNAS_DIFERENTES);
    expect(motivoParaNaoMexer("excluir", par("cancelado"))).toBe(MOTIVO_TRANSFERENCIA_CANCELADA);
  });
  it("duas despesas (ou duas receitas) não são um par de transferência", () => {
    expect(motivoParaNaoMexer("editar", [par("previsto")[0], { ...par("previsto")[0], id: "x" }])).toBe(MOTIVO_INCOMPLETA);
  });
});

describe("descrição", () => {
  it("diz de onde para onde", () => {
    expect(descricaoDaTransferencia("Itaú PJ", "Nubank")).toBe("Transferência Itaú PJ → Nubank");
  });
});
