import { describe, expect, it } from "vitest";

import type { AcaoItem, AcaoItemSub } from "@/components/ui/acoes";
import type { EstagioNegociacao, StatusProspeccao } from "@/generated/prisma/client";
import type { CardRef } from "@/modules/comercial/funil";
import {
  ACAO_ABRIR,
  ACAO_COPIAR_NOME,
  ACAO_REABRIR,
  PREFIXO_MOVER,
  destinoDoMover,
  destinosDoFunil,
  itensDeCardQuadro,
  negociacaoPodeReabrir,
} from "./acoes-quadro";

const achar = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id);
const sub = (itens: AcaoItem[]) => achar(itens, "mover") as AcaoItemSub;

const lead = (status: StatusProspeccao): CardRef => ({ tipo: "LEAD", status });
const neg = (estagio: EstagioNegociacao): CardRef => ({ tipo: "NEGOCIACAO", estagio });
const dest = (card: CardRef, id: string) => destinosDoFunil(card).find((d) => d.id === id);

describe("destinosDoFunil", () => {
  it("não oferece a coluna onde o card já está", () => {
    expect(destinosDoFunil(neg("ORCAMENTO")).map((d) => d.id)).not.toContain("ORCAMENTO");
    expect(destinosDoFunil(lead("EM_CONTATO")).map((d) => d.id)).not.toContain("EM_CONTATO");
  });

  it("negociação perdida/cancelada mora em ENCERRADOS: essa coluna não é destino", () => {
    expect(destinosDoFunil(neg("PERDIDO")).map((d) => d.id)).not.toContain("ENCERRADOS");
  });

  it("lead: só as colunas da prospecção, Levantamento (qualifica) e Encerrados ficam livres", () => {
    const livres = destinosDoFunil(lead("EM_CONTATO"))
      .filter((d) => !d.desabilitado)
      .map((d) => d.id);
    expect(livres).toContain("QUALIFICADO");
    expect(livres).toContain("LEVANTAMENTO");
    expect(livres).toContain("ENCERRADOS");
    expect(livres).not.toContain("ORCAMENTO");
  });

  it("lead não pula para os estágios seguintes: desabilitado com a frase do arrasto", () => {
    expect(dest(lead("EM_CONTATO"), "PROPOSTA_ENVIADA")?.desabilitado).toBe(
      "Uma prospecção entra na negociação por Levantamento — solte o card lá.",
    );
  });

  it("negociação não volta para a prospecção", () => {
    const d = dest(neg("ORCAMENTO"), "EM_CONTATO");
    expect(d?.desabilitado).toBe(
      "Esta negociação já saiu da prospecção — mova-a entre os estágios de negociação.",
    );
  });

  it("negociação: desabilita o salto que a jornada não permite, com a frase do servidor", () => {
    expect(dest(neg("LEVANTAMENTO"), "CONTRATADO")?.desabilitado).toBe(
      'Não é possível mover de "Levantamento" para "Contratado".',
    );
  });

  it("negociação: libera o que a jornada permite", () => {
    expect(dest(neg("NEGOCIACAO"), "CONTRATADO")?.desabilitado).toBeUndefined();
    expect(dest(neg("NEGOCIACAO"), "ENCERRADOS")?.desabilitado).toBeUndefined();
  });

  it("CONTRATADO é terminal: nada a oferecer além de coluna desabilitada", () => {
    expect(destinosDoFunil(neg("CONTRATADO")).every((d) => d.desabilitado)).toBe(true);
  });

  it("o rótulo é o da coluna, como no cabeçalho do funil", () => {
    expect(dest(lead("EM_CONTATO"), "LEVANTAMENTO")?.rotulo).toBe("Levantamento");
  });
});

describe("negociacaoPodeReabrir", () => {
  it("só nas encerradas sem contrato", () => {
    expect(negociacaoPodeReabrir("PERDIDO")).toBe(true);
    expect(negociacaoPodeReabrir("CANCELADO")).toBe(true);
    expect(negociacaoPodeReabrir("CONTRATADO")).toBe(false);
    expect(negociacaoPodeReabrir("LEVANTAMENTO")).toBe(false);
  });
});

describe("itensDeCardQuadro", () => {
  const destinos = destinosDoFunil(lead("IDENTIFICADO"));

  it("Abrir é link quando há href e some quando não há", () => {
    expect(achar(itensDeCardQuadro({ href: "/comercial/1", destinos }), ACAO_ABRIR)).toMatchObject({
      tipo: "link",
      href: "/comercial/1",
    });
    expect(achar(itensDeCardQuadro({ destinos }), ACAO_ABRIR)).toBeUndefined();
  });

  it("Mover para vira um item por destino, com o prefixo que a tela decodifica", () => {
    const itens = sub(itensDeCardQuadro({ destinos })).itens;
    expect(itens.length).toBe(destinos.length);
    expect(itens.every((i) => i.id.startsWith(PREFIXO_MOVER))).toBe(true);
    expect(destinoDoMover(`${PREFIXO_MOVER}EM_CONTATO`)).toBe("EM_CONTATO");
    expect(destinoDoMover("copiar-nome")).toBeNull();
  });

  it("Reabrir só aparece quando o card pode ser reaberto", () => {
    expect(achar(itensDeCardQuadro({ destinos, podeReabrir: true }), ACAO_REABRIR)).toBeDefined();
    expect(achar(itensDeCardQuadro({ destinos }), ACAO_REABRIR)).toBeUndefined();
  });

  it("sempre oferece copiar o nome, e sem separador sobrando", () => {
    const itens = itensDeCardQuadro({ destinos: [] });
    expect(achar(itens, ACAO_COPIAR_NOME)).toBeDefined();
    expect(itens[0].tipo).not.toBe("separador");
  });
});
