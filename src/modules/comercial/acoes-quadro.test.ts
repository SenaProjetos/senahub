import { describe, expect, it } from "vitest";

import type { AcaoItem, AcaoItemSub } from "@/components/ui/acoes";
import {
  ACAO_ABRIR,
  ACAO_COPIAR_NOME,
  ACAO_REABRIR,
  PREFIXO_MOVER,
  destinoDoMover,
  destinosDeNegociacao,
  destinosDeProspeccao,
  itensDeCardQuadro,
  negociacaoPodeReabrir,
} from "./acoes-quadro";

const COLUNAS = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "CONTRATADO",
  "PERDIDO",
  "EM_ESPERA",
  "CANCELADO",
] as const;

const achar = (itens: AcaoItem[], id: string) => itens.find((i) => i.id === id);
const sub = (itens: AcaoItem[]) => achar(itens, "mover") as AcaoItemSub;

describe("destinosDeNegociacao", () => {
  it("não oferece o estágio atual", () => {
    expect(destinosDeNegociacao("ORCAMENTO", COLUNAS).map((d) => d.id)).not.toContain("ORCAMENTO");
  });

  it("desabilita o que a jornada não permite, com o motivo do servidor", () => {
    const d = destinosDeNegociacao("LEVANTAMENTO", COLUNAS).find((x) => x.id === "CONTRATADO");
    expect(d?.desabilitado).toBe('Não é possível mover de "Levantamento" para "Contratado".');
  });

  it("libera o que é permitido", () => {
    const d = destinosDeNegociacao("NEGOCIACAO", COLUNAS);
    expect(d.find((x) => x.id === "CONTRATADO")?.desabilitado).toBeUndefined();
    expect(d.find((x) => x.id === "PERDIDO")?.desabilitado).toBeUndefined();
  });

  it("CONTRATADO é terminal: todos os destinos ficam desabilitados", () => {
    expect(destinosDeNegociacao("CONTRATADO", COLUNAS).every((d) => d.desabilitado)).toBe(true);
  });
});

describe("destinosDeProspeccao", () => {
  it("lista as outras colunas, sem o status atual", () => {
    const ids = destinosDeProspeccao("EM_CONTATO").map((d) => d.id);
    expect(ids).not.toContain("EM_CONTATO");
    expect(ids).toContain("QUALIFICADO");
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
  const destinos = destinosDeProspeccao("IDENTIFICADO");

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
