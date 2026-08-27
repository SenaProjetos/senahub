import { describe, expect, it } from "vitest";
import { janelaExperienciaClt, prazoLegalDoVinculo, tetoEstagio } from "./prazo-legal";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("tetoEstagio", () => {
  it("dois anos a partir do início", () => {
    expect(tetoEstagio(dia("2026-03-01")).limite).toEqual(dia("2028-03-01"));
  });

  it("preserva o fim de mês em vez de transbordar", () => {
    // 31/01 + 24 meses cai num mês que não tem dia 31 no meio do caminho; o resultado tem que
    // continuar sendo 31/01, e a soma ingênua com `setMonth` produziria 02/03 ou 03/03.
    expect(tetoEstagio(dia("2026-01-31")).limite).toEqual(dia("2028-01-31"));
    // 29/02 de ano bissexto + 24 meses → 28/02 (2028 é bissexto, mas 2026+24m = 2028-02-29 existe)
    expect(tetoEstagio(dia("2024-02-29")).limite).toEqual(dia("2026-02-28"));
  });

  it("estagiário PCD é isento do teto (Lei 11.788 art. 11, parágrafo único)", () => {
    const t = tetoEstagio(dia("2026-03-01"), { pcd: true });
    expect(t.isento).toBe(true);
    // A data continua sendo devolvida para exibição — só não obriga.
    expect(t.limite).toEqual(dia("2028-03-01"));
  });

  it("sem PCD, obriga", () => {
    expect(tetoEstagio(dia("2026-03-01")).isento).toBe(false);
  });
});

describe("janelaExperienciaClt", () => {
  it("45+45: primeiro período em 45 dias, teto legal em 90", () => {
    const j = janelaExperienciaClt(dia("2026-03-01"), dia("2026-03-01"));
    expect(j.fimPrimeiroPeriodo).toEqual(dia("2026-04-15"));
    expect(j.limiteLegal).toEqual(dia("2026-05-30"));
    expect(j.diasRestantes).toBe(90);
    expect(j.excedido).toBe(false);
  });

  it("aceita outro desenho (30+60) — a lei fixa só o teto de 90", () => {
    const j = janelaExperienciaClt(dia("2026-03-01"), dia("2026-03-01"), 30);
    expect(j.fimPrimeiroPeriodo).toEqual(dia("2026-03-31"));
    expect(j.limiteLegal).toEqual(dia("2026-05-30")); // teto não muda
  });

  it("primeiro período não pode ultrapassar o teto nem se pedirem", () => {
    const j = janelaExperienciaClt(dia("2026-03-01"), dia("2026-03-01"), 120);
    expect(j.fimPrimeiroPeriodo).toEqual(j.limiteLegal);
  });

  it("passou dos 90 dias: excedido — o contrato virou por prazo indeterminado (CLT 451)", () => {
    const j = janelaExperienciaClt(dia("2026-03-01"), dia("2026-06-01"));
    expect(j.excedido).toBe(true);
    expect(j.diasRestantes).toBeLessThan(0);
  });

  it("no último dia ainda não excedeu", () => {
    const j = janelaExperienciaClt(dia("2026-03-01"), dia("2026-05-30"));
    expect(j.diasRestantes).toBe(0);
    expect(j.excedido).toBe(false);
  });
});

describe("prazoLegalDoVinculo", () => {
  it("estágio tem teto", () => {
    const p = prazoLegalDoVinculo("estagiario", dia("2026-03-01"));
    expect(p?.limite).toEqual(dia("2028-03-01"));
    expect(p?.obriga).toBe(true);
  });

  it("estágio PCD devolve o prazo mas NÃO obriga", () => {
    expect(prazoLegalDoVinculo("estagiario", dia("2026-03-01"), { pcd: true })?.obriga).toBe(false);
  });

  it("CLT/PJ/freelancer não têm prazo legal — devolver um seria inventar", () => {
    // CLT por prazo indeterminado é o caso normal e não tem data-limite. A experiência é contrato
    // à parte; quem precisar dela chama `janelaExperienciaClt` com a data DAQUELE contrato.
    expect(prazoLegalDoVinculo("clt", dia("2026-03-01"))).toBeNull();
    expect(prazoLegalDoVinculo("projetista_pj", dia("2026-03-01"))).toBeNull();
    expect(prazoLegalDoVinculo("freelancer", dia("2026-03-01"))).toBeNull();
  });
});
