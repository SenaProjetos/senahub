import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_CANCELAR_REUNIAO,
  ACAO_EDITAR_REUNIAO,
  ACAO_ESCREVER_NOTA,
  ACAO_IMPORTAR_ATA,
  ACAO_REMOVER_NOTA,
  ACAO_VER_ATA,
  itensDeMarcoAgenda,
  itensDeReuniaoAgendada,
} from "./acoes";
import { MOTIVO_MARCO_ENTREGUE, MOTIVO_SEM_NOTA } from "./marcos";
import { MOTIVO_ATA_ANTES_DO_DIA, MOTIVO_REUNIAO_CANCELADA, MOTIVO_REUNIAO_PASSADA } from "./reunioes";

const ids = (itens: AcaoItem[]) => itens.map((i) => i.id);
const acao = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id) as AcaoItemAcao;

describe("agenda — ações do marco", () => {
  it("sem nota: escrever habilitado e remover desabilitado com a frase do servidor", () => {
    const itens = itensDeMarcoAgenda({ situacao: "alterada", nota: null });
    expect(ids(itens)).toEqual([ACAO_ESCREVER_NOTA, ACAO_REMOVER_NOTA]);
    expect(acao(itens, ACAO_ESCREVER_NOTA).rotulo).toBe("Escrever nota");
    expect(acao(itens, ACAO_ESCREVER_NOTA).desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_REMOVER_NOTA).desabilitado).toBe(MOTIVO_SEM_NOTA);
  });

  it("com nota: editar e remover habilitados", () => {
    const itens = itensDeMarcoAgenda({ situacao: "no_prazo", nota: "Aguardando o cliente" });
    expect(acao(itens, ACAO_ESCREVER_NOTA).rotulo).toBe("Editar nota");
    expect(acao(itens, ACAO_ESCREVER_NOTA).desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_REMOVER_NOTA).desabilitado).toBeUndefined();
  });

  it("marco entregue: os dois desabilitados com a mesma frase", () => {
    const itens = itensDeMarcoAgenda({ situacao: "entregue", nota: "x" });
    expect(acao(itens, ACAO_ESCREVER_NOTA).desabilitado).toBe(MOTIVO_MARCO_ENTREGUE);
    expect(acao(itens, ACAO_REMOVER_NOTA).desabilitado).toBe(MOTIVO_MARCO_ENTREGUE);
  });

  it("remover é destrutivo", () => {
    expect(acao(itensDeMarcoAgenda({ situacao: "alterada", nota: "x" }), ACAO_REMOVER_NOTA).variant).toBe("destructive");
  });
});

describe("agenda — ações da reunião", () => {
  const livre = { motivoNaoEditar: null, podeImportarAta: null, temAta: false };

  it("futura: editar e cancelar habilitados; importar ata desabilitado antes do dia", () => {
    const itens = itensDeReuniaoAgendada({ ...livre, podeImportarAta: MOTIVO_ATA_ANTES_DO_DIA });
    expect(ids(itens)).toEqual([ACAO_EDITAR_REUNIAO, ACAO_CANCELAR_REUNIAO, ACAO_IMPORTAR_ATA]);
    expect(acao(itens, ACAO_EDITAR_REUNIAO).desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_CANCELAR_REUNIAO).desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_CANCELAR_REUNIAO).variant).toBe("destructive");
    expect(acao(itens, ACAO_IMPORTAR_ATA).desabilitado).toBe(MOTIVO_ATA_ANTES_DO_DIA);
  });

  it("cancelada e passada: editar e cancelar desabilitados com a frase do servidor", () => {
    const cancelada = itensDeReuniaoAgendada({ ...livre, motivoNaoEditar: MOTIVO_REUNIAO_CANCELADA, podeImportarAta: MOTIVO_REUNIAO_CANCELADA });
    expect(acao(cancelada, ACAO_EDITAR_REUNIAO).desabilitado).toBe(MOTIVO_REUNIAO_CANCELADA);
    expect(acao(cancelada, ACAO_CANCELAR_REUNIAO).desabilitado).toBe(MOTIVO_REUNIAO_CANCELADA);
    const passada = itensDeReuniaoAgendada({ ...livre, motivoNaoEditar: MOTIVO_REUNIAO_PASSADA });
    expect(acao(passada, ACAO_EDITAR_REUNIAO).desabilitado).toBe(MOTIVO_REUNIAO_PASSADA);
    expect(acao(passada, ACAO_IMPORTAR_ATA).desabilitado).toBeUndefined();
  });

  it("com ata ligada: sem importar ata, e com o atalho para ver a ata", () => {
    const itens = itensDeReuniaoAgendada({ ...livre, motivoNaoEditar: MOTIVO_REUNIAO_PASSADA, temAta: true });
    expect(ids(itens)).toEqual([ACAO_EDITAR_REUNIAO, ACAO_CANCELAR_REUNIAO, ACAO_VER_ATA]);
    expect(itens.find((i) => i.id === ACAO_VER_ATA)?.tipo).toBe("link");
  });
});
