import { describe, expect, it } from "vitest";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_CLASSIFICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_REPLICAR,
  ACAO_RESOLVER_NA_REVISAO,
  ACAO_RESPONDER,
  PREFIXO_ESTADO,
  destinoDoItem,
  itensDoApontamento,
  type ApontamentoParaAcoes,
  type ContextoAcoesApontamento,
} from "./acoes-apontamento";

const achar = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id) as AcaoItemAcao | undefined;
const ids = (itens: AcaoItem[]) => itens.filter((i) => i.tipo === "acao").map((i) => i.id);

const aberto: ApontamentoParaAcoes = {
  numero: 3,
  status: "aberta",
  autorId: "eu",
  tarefaId: null,
  totalRespostas: 0,
  deOutraRevisao: false,
  revisaoOrigemId: "rev1",
};

/** Quem valida a prancha (e escreveu o apontamento), sem ser responsável nem global. */
const validador: ContextoAcoesApontamento = {
  papeis: { ehValidador: true, ehResponsavel: false, ehGlobal: false },
  usuarioId: "eu",
  ehAdmin: false,
  podeValidar: true,
  temPranchaParaReplicar: true,
  revisaoAtualId: "rev1",
  revisaoAtualNumero: 1,
};

/** Projetista responsável pela disciplina: corrige, não valida. */
const projetista: ContextoAcoesApontamento = {
  ...validador,
  papeis: { ehValidador: false, ehResponsavel: true, ehGlobal: false },
  usuarioId: "outro",
  podeValidar: false,
};

describe("itensDoApontamento", () => {
  it("todo apontamento pode ser respondido, e o rótulo conta as respostas", () => {
    expect(achar(itensDoApontamento(aberto, projetista), ACAO_RESPONDER)?.rotulo).toBe("Responder");
    expect(achar(itensDoApontamento({ ...aberto, totalRespostas: 2 }, projetista), ACAO_RESPONDER)?.rotulo).toBe(
      "Responder (2)",
    );
  });

  // Regra 5 da ADR-0002: o PERFIL que não pode não vê o item.
  it("editar e excluir só para quem escreveu (ou admin)", () => {
    const deOutro = itensDoApontamento(aberto, { ...validador, usuarioId: "terceiro" });
    expect(achar(deOutro, ACAO_EDITAR)).toBeUndefined();
    expect(achar(deOutro, ACAO_EXCLUIR)).toBeUndefined();
    const admin = itensDoApontamento(aberto, { ...validador, usuarioId: "terceiro", ehAdmin: true });
    expect(achar(admin, ACAO_EDITAR)).toBeDefined();
    expect(achar(admin, ACAO_EXCLUIR)).toBeDefined();
  });

  // ...e o ESTADO que impede deixa o item à vista, desabilitado com a frase do servidor.
  it("depois de virar tarefa, editar e excluir ficam desabilitados com o motivo", () => {
    const itens = itensDoApontamento({ ...aberto, tarefaId: "t1" }, validador);
    expect(achar(itens, ACAO_EDITAR)?.desabilitado).toBe("Pendência já enviada como tarefa — não pode ser editada.");
    expect(achar(itens, ACAO_EXCLUIR)?.desabilitado).toBe("Pendência já vinculada a uma tarefa — não pode ser excluída.");
  });

  it("editar exige apontamento aberto; excluir segue a regra do servidor (só a tarefa impede)", () => {
    const itens = itensDoApontamento({ ...aberto, status: "resolvida" }, validador);
    expect(achar(itens, ACAO_EDITAR)?.desabilitado).toBe("Só pendências abertas podem ser editadas.");
    expect(achar(itens, ACAO_EXCLUIR)?.desabilitado).toBeUndefined();
  });

  it("excluir é destrutivo e pede confirmação com o número do apontamento", () => {
    const e = achar(itensDoApontamento(aberto, validador), ACAO_EXCLUIR);
    expect(e?.variant).toBe("destructive");
    expect(e?.confirmar?.titulo).toBe("Excluir o apontamento #3?");
  });

  it("as mudanças de estado saem da máquina: projetista assume e resolve; validador descarta", () => {
    expect(ids(itensDoApontamento(aberto, projetista))).toEqual([
      ACAO_RESPONDER,
      `${PREFIXO_ESTADO}em_correcao`,
      `${PREFIXO_ESTADO}resolvida`,
    ]);
    expect(ids(itensDoApontamento(aberto, validador))).toContain(`${PREFIXO_ESTADO}descartada`);
    expect(ids(itensDoApontamento(aberto, validador))).not.toContain(`${PREFIXO_ESTADO}em_correcao`);
  });

  it("voltar para aberto muda de nome conforme de onde vem", () => {
    const rotulo = (status: string, ctx: ContextoAcoesApontamento) =>
      achar(itensDoApontamento({ ...aberto, status }, ctx), `${PREFIXO_ESTADO}aberta`)?.rotulo;
    expect(rotulo("em_correcao", projetista)).toBe("Voltar à fila");
    expect(rotulo("resolvida", projetista)).toBe("Reabrir");
    const global = { ...validador, papeis: { ehValidador: true, ehResponsavel: true, ehGlobal: true } };
    expect(rotulo("adiado", global)).toBe("Reativar");
  });

  it("herdado de revisão anterior: resolver grava a revisão atual", () => {
    const herdado = { ...aberto, deOutraRevisao: true, revisaoOrigemId: "rev1" };
    const itens = itensDoApontamento(herdado, { ...projetista, revisaoAtualId: "rev2", revisaoAtualNumero: 2 });
    expect(achar(itens, `${PREFIXO_ESTADO}resolvida`)).toBeUndefined();
    expect(achar(itens, ACAO_RESOLVER_NA_REVISAO)?.rotulo).toBe("Resolver na R01");
  });

  it("classificar é de quem valida; encerrado fica desabilitado com o motivo", () => {
    expect(achar(itensDoApontamento(aberto, projetista), ACAO_CLASSIFICAR)).toBeUndefined();
    expect(achar(itensDoApontamento({ ...aberto, status: "fechada" }, validador), ACAO_CLASSIFICAR)?.desabilitado).toBe(
      "Pendência já encerrada — não pode ser reclassificada.",
    );
  });

  it("replicar exige quem valida e outra prancha para receber a cópia", () => {
    expect(achar(itensDoApontamento(aberto, validador), ACAO_REPLICAR)).toBeDefined();
    expect(achar(itensDoApontamento(aberto, { ...validador, temPranchaParaReplicar: false }), ACAO_REPLICAR)).toBeUndefined();
  });

  it("toda ação traz a dica que o painel mostra no hover", () => {
    for (const ctx of [validador, projetista]) {
      for (const item of itensDoApontamento(aberto, ctx)) {
        if (item.tipo === "acao") expect(item.dica, item.id).toBeTruthy();
      }
    }
  });
});

describe("destinoDoItem", () => {
  it("lê o destino da mudança de estado e ignora os demais itens", () => {
    expect(destinoDoItem(`${PREFIXO_ESTADO}fechada`)).toBe("fechada");
    expect(destinoDoItem(ACAO_EDITAR)).toBeNull();
  });
});
