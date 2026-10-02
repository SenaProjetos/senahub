import { describe, expect, it } from "vitest";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_TRANSFERENCIA_BAIXAR,
  ACAO_TRANSFERENCIA_EDITAR,
  ACAO_TRANSFERENCIA_ESTORNAR,
  ACAO_TRANSFERENCIA_EXCLUIR,
  ehAcaoDeTransferencia,
  itensDaTransferencia,
} from "@/modules/financeiro/transferencias/acoes";
import { MOTIVO_CONCILIADO } from "@/modules/financeiro/lancamentos/transicoes";

const acoes = (r: ReturnType<typeof itensDaTransferencia>) => r.filter((i): i is AcaoItemAcao => i.tipo === "acao");
const achar = (r: ReturnType<typeof itensDaTransferencia>, id: string) => acoes(r).find((i) => i.id === id);

describe("ações da transferência", () => {
  it("quem só vê não recebe nenhuma ação", () => {
    expect(itensDaTransferencia({ realizada: true, conciliada: false }, { podeGerir: false })).toEqual([]);
  });
  it("agendada oferece dar baixa; realizada oferece estornar — nunca os dois", () => {
    const agendada = itensDaTransferencia({ realizada: false, conciliada: false }, { podeGerir: true });
    expect(achar(agendada, ACAO_TRANSFERENCIA_BAIXAR)).toBeTruthy();
    expect(achar(agendada, ACAO_TRANSFERENCIA_ESTORNAR)).toBeUndefined();
    const realizada = itensDaTransferencia({ realizada: true, conciliada: false }, { podeGerir: true });
    expect(achar(realizada, ACAO_TRANSFERENCIA_ESTORNAR)).toBeTruthy();
    expect(achar(realizada, ACAO_TRANSFERENCIA_BAIXAR)).toBeUndefined();
  });
  it("excluir é destrutivo e pede confirmação; baixar e estornar também", () => {
    const itens = itensDaTransferencia({ realizada: true, conciliada: false }, { podeGerir: true });
    expect(achar(itens, ACAO_TRANSFERENCIA_EXCLUIR)).toMatchObject({ variant: "destructive", confirmar: { rotuloConfirmar: "Excluir" } });
    expect(achar(itens, ACAO_TRANSFERENCIA_ESTORNAR)?.confirmar).toBeTruthy();
    expect(achar(itensDaTransferencia({ realizada: false, conciliada: false }, { podeGerir: true }), ACAO_TRANSFERENCIA_BAIXAR)?.confirmar).toBeTruthy();
  });
  it("conciliada com o extrato: editar, estornar e excluir desabilitados com a frase do servidor", () => {
    const itens = itensDaTransferencia({ realizada: true, conciliada: true }, { podeGerir: true });
    for (const id of [ACAO_TRANSFERENCIA_EDITAR, ACAO_TRANSFERENCIA_ESTORNAR, ACAO_TRANSFERENCIA_EXCLUIR]) {
      expect(achar(itens, id)?.desabilitado).toBe(MOTIVO_CONCILIADO);
    }
  });
  it("o prefixo diz que o clique é da transferência", () => {
    expect(ehAcaoDeTransferencia(ACAO_TRANSFERENCIA_EDITAR)).toBe(true);
    expect(ehAcaoDeTransferencia("estornar")).toBe(false);
  });
});
