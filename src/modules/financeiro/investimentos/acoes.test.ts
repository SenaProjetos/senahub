import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_ABRIR_ATIVO,
  ACAO_APORTAR,
  ACAO_ARQUIVAR,
  ACAO_DESARQUIVAR,
  ACAO_EXCLUIR_ATIVO,
  ACAO_EXCLUIR_MOVIMENTO,
  ACAO_RESGATAR,
  itensDoAtivo,
  itensDoMovimento,
} from "@/modules/financeiro/investimentos/acoes";
import { MOTIVO_ARQUIVADO, MOTIVO_ARQUIVAR_COM_SALDO, MOTIVO_EXCLUIR_COM_MOVIMENTO } from "@/modules/financeiro/investimentos/calculo";

const achar = (xs: readonly AcaoItem[], id: string) => xs.find((x) => x.id === id) as AcaoItemAcao | undefined;
const ativo = { id: "a", nome: "CDB", arquivado: false, valorAtual: 100, movimentos: 2 };

describe("ações do ativo", () => {
  it("quem só vê: só abrir", () => {
    expect(itensDoAtivo(ativo, { podeGerir: false }).map((i) => i.id)).toEqual([ACAO_ABRIR_ATIVO]);
  });
  it("com movimento não exclui; com valor não arquiva — com a frase do servidor", () => {
    const xs = itensDoAtivo(ativo, { podeGerir: true });
    expect(achar(xs, ACAO_EXCLUIR_ATIVO)?.desabilitado).toBe(MOTIVO_EXCLUIR_COM_MOVIMENTO);
    expect(achar(xs, ACAO_ARQUIVAR)?.desabilitado).toBe(MOTIVO_ARQUIVAR_COM_SALDO);
    const vazio = itensDoAtivo({ ...ativo, valorAtual: 0, movimentos: 0 }, { podeGerir: true });
    expect(achar(vazio, ACAO_EXCLUIR_ATIVO)?.desabilitado).toBeUndefined();
    expect(achar(vazio, ACAO_ARQUIVAR)?.desabilitado).toBeUndefined();
    expect(achar(vazio, ACAO_RESGATAR)?.desabilitado).toBeTruthy();
  });
  it("arquivado: aporte desabilitado e opção de voltar à carteira", () => {
    const xs = itensDoAtivo({ ...ativo, arquivado: true, valorAtual: 0 }, { podeGerir: true });
    expect(achar(xs, ACAO_APORTAR)?.desabilitado).toBe(MOTIVO_ARQUIVADO);
    expect(achar(xs, ACAO_DESARQUIVAR)).toBeTruthy();
  });
  it("na tela do ativo não oferece abri-lo de novo", () => {
    expect(achar(itensDoAtivo(ativo, { podeGerir: true, naTelaDoAtivo: true }), ACAO_ABRIR_ATIVO)).toBeUndefined();
  });
});

describe("ações do movimento", () => {
  it("excluir é destrutivo, confirma e explica a transferência inteira", () => {
    const xs = itensDoMovimento({ id: "l", movimento: "aporte" }, { podeGerir: true });
    const ex = achar(xs, ACAO_EXCLUIR_MOVIMENTO);
    expect(ex?.variant).toBe("destructive");
    expect(ex?.confirmar?.descricao).toContain("transferência inteira");
    expect(itensDoMovimento({ id: "l", movimento: "rendimento" }, { podeGerir: false }).some((i) => i.id === ACAO_EXCLUIR_MOVIMENTO)).toBe(false);
  });
});
