import { describe, expect, it } from "vitest";
import {
  colunaDoCard,
  decidirSoltura,
  lerColunasFechadas,
  type CardRef,
} from "./funil";

const lead = (status: Extract<CardRef, { tipo: "LEAD" }>["status"]): CardRef => ({ tipo: "LEAD", status });
const neg = (estagio: Extract<CardRef, { tipo: "NEGOCIACAO" }>["estagio"]): CardRef => ({
  tipo: "NEGOCIACAO",
  estagio,
});

describe("colunaDoCard", () => {
  it("lead já qualificado some — quem o representa é a negociação", () => {
    expect(colunaDoCard(lead("OPORTUNIDADE_CRIADA"))).toBeNull();
  });

  it("os 6 terminais caem no mesmo grupo Encerrados", () => {
    for (const s of ["SEM_OPORTUNIDADE", "EM_ESPERA", "DESCARTADO"] as const) {
      expect(colunaDoCard(lead(s))).toBe("ENCERRADOS");
    }
    for (const e of ["PERDIDO", "EM_ESPERA", "CANCELADO"] as const) {
      expect(colunaDoCard(neg(e))).toBe("ENCERRADOS");
    }
  });
});

describe("decidirSoltura — a costura do ADR-0004", () => {
  it("lead solto em Levantamento qualifica (sem reativar quando está no fluxo)", () => {
    expect(decidirSoltura(lead("EM_CONTATO"), "LEVANTAMENTO")).toEqual({
      acao: "qualificar",
      reativa: false,
      statusAtual: "EM_CONTATO",
    });
  });

  it("lead fora do fluxo em Levantamento exige reativação", () => {
    expect(decidirSoltura(lead("DESCARTADO"), "LEVANTAMENTO")).toMatchObject({
      acao: "qualificar",
      reativa: true,
    });
  });

  it("lead não pula direto para estágios depois de Levantamento", () => {
    expect(decidirSoltura(lead("QUALIFICADO"), "ORCAMENTO").acao).toBe("recusar");
  });

  it("negociação nunca volta para a prospecção", () => {
    expect(decidirSoltura(neg("LEVANTAMENTO"), "QUALIFICADO").acao).toBe("recusar");
  });

  it("lead encerrado volta ao funil de prospecção como movimento comum", () => {
    expect(decidirSoltura(lead("EM_ESPERA"), "EM_CONTATO")).toEqual({
      acao: "mover-lead",
      para: "EM_CONTATO",
    });
  });

  it("soltar em Encerrados pergunta qual encerramento, sem oferecer o atual", () => {
    const enc = decidirSoltura(lead("IDENTIFICADO"), "ENCERRADOS");
    expect(enc.acao === "encerrar" && enc.opcoes.map((o) => o.para)).toEqual([
      "SEM_OPORTUNIDADE",
      "EM_ESPERA",
      "DESCARTADO",
    ]);
  });

  it("negociação contratada não é encerrada pelo board", () => {
    expect(decidirSoltura(neg("CONTRATADO"), "ENCERRADOS").acao).toBe("recusar");
  });

  it("negociação ativa pode ser perdida, pausada ou cancelada", () => {
    const r = decidirSoltura(neg("NEGOCIACAO"), "ENCERRADOS");
    expect(r.acao === "encerrar" && r.opcoes.map((o) => o.para)).toEqual([
      "PERDIDO",
      "EM_ESPERA",
      "CANCELADO",
    ]);
  });

  it("mesma coluna não faz nada — inclusive dentro do grupo Encerrados", () => {
    expect(decidirSoltura(neg("PERDIDO"), "ENCERRADOS")).toEqual({ acao: "nada" });
    expect(decidirSoltura(lead("QUALIFICADO"), "QUALIFICADO")).toEqual({ acao: "nada" });
  });
});

describe("lerColunasFechadas", () => {
  it("sem cookie, Encerrados nasce recolhido", () => {
    expect([...lerColunasFechadas(undefined)]).toEqual(["ENCERRADOS"]);
  });

  it("cookie vazio significa todas abertas; lixo é ignorado", () => {
    expect(lerColunasFechadas("").size).toBe(0);
    expect([...lerColunasFechadas("ORCAMENTO,xyz")]).toEqual(["ORCAMENTO"]);
  });
});
