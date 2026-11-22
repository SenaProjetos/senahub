import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { ACAO_ANULAR, ACAO_CANCELAR, ACAO_REGISTRAR_POR_FORA, ACAO_VER_COMPROVANTE, itensDaAprovacao } from "./acoes";
import { MOTIVO_DESATUALIZADO_EQUIPE } from "./regras";
import type { RespostaDTO } from "./queries";

const resposta = (extra: Partial<RespostaDTO> = {}): RespostaDTO => ({
  id: "r1",
  resposta: "aprovado",
  texto: null,
  origem: "portal",
  respondidoPorNome: "Mariana",
  respondidoEm: "2026-12-01T12:00:00.000Z",
  anulada: null,
  registradoPorNome: null,
  comprovante: null,
  ...extra,
});

const ids = (itens: AcaoItem[]) => itens.map((i) => i.id);
const acao = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id) as AcaoItemAcao | undefined;

describe("aprovação da entrega — ações da equipe", () => {
  it("aguardando atual oferece registrar e cancelar", () => {
    const itens = itensDaAprovacao({ id: "a1", status: "aguardando", desatualizado: false, respostas: [] });
    expect(ids(itens)).toEqual([ACAO_REGISTRAR_POR_FORA, ACAO_CANCELAR]);
    expect(acao(itens, ACAO_REGISTRAR_POR_FORA)?.desabilitado).toBeUndefined();
    expect(acao(itens, ACAO_CANCELAR)).toMatchObject({ variant: "destructive" });
    expect(acao(itens, ACAO_CANCELAR)?.confirmar).toBeDefined();
  });

  it("aguardando desatualizado desabilita registrar com a frase do servidor", () => {
    const itens = itensDaAprovacao({ id: "a1", status: "aguardando", desatualizado: true, respostas: [] });
    expect(acao(itens, ACAO_REGISTRAR_POR_FORA)?.desabilitado).toBe(MOTIVO_DESATUALIZADO_EQUIPE);
    expect(acao(itens, ACAO_CANCELAR)?.desabilitado).toBeUndefined();
  });

  it("respondido oferece anular e, com comprovante, ver comprovante", () => {
    const sem = itensDaAprovacao({ id: "a1", status: "respondido", desatualizado: false, respostas: [resposta()] });
    expect(ids(sem)).toEqual([ACAO_ANULAR]);
    expect(acao(sem, ACAO_ANULAR)).toMatchObject({ variant: "destructive" });
    const com = itensDaAprovacao({
      id: "a1",
      status: "respondido",
      desatualizado: false,
      respostas: [resposta({ origem: "equipe", comprovante: { id: "c1", nome: "email.pdf" } })],
    });
    expect(ids(com)).toEqual([ACAO_ANULAR, ACAO_VER_COMPROVANTE]);
    const ver = com.find((i) => i.id === ACAO_VER_COMPROVANTE);
    expect(ver).toMatchObject({ tipo: "link" });
  });

  it("cancelado não tem ações", () => {
    expect(itensDaAprovacao({ id: "a1", status: "cancelado", desatualizado: false, respostas: [] })).toEqual([]);
  });
});
