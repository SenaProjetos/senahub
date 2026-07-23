import { describe, expect, it } from "vitest";
import {
  podeConfirmarOuRecusarAprovacao,
  podeSolicitarAprovacao,
  rotuloStatusDisciplina,
} from "./regras";

describe("podeSolicitarAprovacao", () => {
  it("exige responsável E status em_andamento", () => {
    expect(podeSolicitarAprovacao({ ehResponsavel: true, status: "em_andamento" })).toBe(true);
    expect(podeSolicitarAprovacao({ ehResponsavel: false, status: "em_andamento" })).toBe(false);
    expect(podeSolicitarAprovacao({ ehResponsavel: true, status: "aguardando" })).toBe(false);
    expect(podeSolicitarAprovacao({ ehResponsavel: true, status: "entregue" })).toBe(false);
  });
});

describe("podeConfirmarOuRecusarAprovacao", () => {
  it("só admin e supervisor — nunca outros perfis, mesmo com podeVerTudo (sócio)", () => {
    expect(podeConfirmarOuRecusarAprovacao("admin")).toBe(true);
    expect(podeConfirmarOuRecusarAprovacao("supervisor")).toBe(true);
    expect(podeConfirmarOuRecusarAprovacao("administrativo")).toBe(false);
    expect(podeConfirmarOuRecusarAprovacao("clt")).toBe(false);
    expect(podeConfirmarOuRecusarAprovacao("projetista_pj")).toBe(false);
  });
});

describe("rotuloStatusDisciplina", () => {
  it("entregue + solicitação em aberto vira 'Aguardando confirmação'", () => {
    expect(
      rotuloStatusDisciplina({ status: "entregue", aprovacaoSolicitadaEm: new Date() }),
    ).toBe("Aguardando confirmação");
  });

  it("entregue sem solicitação usa o rótulo padrão", () => {
    expect(rotuloStatusDisciplina({ status: "entregue", aprovacaoSolicitadaEm: null })).toBe(
      "Entregue",
    );
  });

  it("outros status usam o rótulo padrão mesmo com aprovacaoSolicitadaEm setado", () => {
    expect(
      rotuloStatusDisciplina({ status: "aprovado", aprovacaoSolicitadaEm: new Date() }),
    ).toBe("Aprovado");
    expect(
      rotuloStatusDisciplina({ status: "em_andamento", aprovacaoSolicitadaEm: null }),
    ).toBe("Em andamento");
  });
});
