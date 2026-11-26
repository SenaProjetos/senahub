import { describe, expect, it } from "vitest";
import { conflitosNovos, diasDoConflito, paraTela, textoDoAvisoDeCascata } from "./cascata";
import type { SobrecargaDia } from "./recursos";

const parcela = (projetoId: string, linhaId: string, horas: number, rascunho = false, userId = "mireli", dia = "2026-11-26") => ({
  userId,
  dia,
  projetoId,
  linhaId,
  atribuicaoId: `${linhaId}-a`,
  horas,
  rascunho,
});

const dia = (d: string, parcelas: ReturnType<typeof parcela>[], capacidade = 8, userId = "mireli"): SobrecargaDia => {
  const carga = parcelas.reduce((t, p) => t + p.horas, 0);
  return {
    userId,
    dia: d,
    carga,
    capacidade,
    excesso: carga - capacidade,
    parcelas: parcelas.map((p) => ({ ...p, dia: d, userId })),
    motivosReducao: [],
  };
};

describe("conflitosNovos", () => {
  it("exemplo 2 do Ryan: X atrasa, Mireli passa a ter X e Y no dia 26 — novo, e avisa a coordenação do Y", () => {
    const depois = [dia("2026-11-26", [parcela("X", "x1", 8), parcela("Y", "y1", 8)])];
    expect(conflitosNovos([], depois, "X", true)).toEqual([
      {
        userId: "mireli",
        outroId: "Y",
        outroRascunho: false,
        dias: ["2026-11-26"],
        avisarCoordenacao: true,
        linhasDeste: ["x1"],
        linhasDoOutro: ["y1"],
      },
    ]);
  });

  it("conflito que já existia não é novo (decisão F); o dia novo do mesmo par é", () => {
    const antes = [dia("2026-11-26", [parcela("X", "x1", 8), parcela("Y", "y1", 8)])];
    const depois = [...antes, dia("2026-11-27", [parcela("X", "x1", 8), parcela("Y", "y1", 8)])];
    expect(conflitosNovos(antes, antes, "X", true)).toEqual([]);
    const [c] = conflitosNovos(antes, depois, "X", true);
    expect(c.dias).toEqual(["2026-11-27"]);
  });

  it("rascunho afetado entra na lista e ninguém é avisado (decisão 8)", () => {
    const depois = [dia("2026-11-26", [parcela("X", "x1", 8), parcela("W", "w1", 4, true)])];
    expect(conflitosNovos([], depois, "X", true)).toMatchObject([{ outroId: "W", outroRascunho: true, avisarCoordenacao: false }]);
  });

  it("dia que só passa da jornada por causa de um rascunho: o aprovado Y fica na lista, mas não é avisado (decisão J)", () => {
    const depois = [dia("2026-11-26", [parcela("X", "x1", 4), parcela("Y", "y1", 4), parcela("W", "w1", 4, true)])];
    const novos = conflitosNovos([], depois, "X", true);
    expect(novos.map((n) => [n.outroId, n.avisarCoordenacao])).toEqual([
      ["W", false],
      ["Y", false],
    ]);
  });

  it("o par já estava na lista por causa de um rascunho e agora passa só com aprovados: avisa", () => {
    const antes = [dia("2026-11-26", [parcela("X", "x1", 4), parcela("Y", "y1", 4), parcela("W", "w1", 4, true)])];
    const depois = [dia("2026-11-26", [parcela("X", "x1", 8), parcela("Y", "y1", 4), parcela("W", "w1", 4, true)])];
    expect(conflitosNovos(antes, depois, "X", true)).toMatchObject([{ outroId: "Y", avisarCoordenacao: true }]);
  });

  it("projeto em rascunho registrando data real: lista, mas nunca avisa um aprovado", () => {
    const depois = [dia("2026-11-26", [parcela("X", "x1", 8, true), parcela("Y", "y1", 8)])];
    expect(conflitosNovos([], depois, "X", false)).toMatchObject([{ outroId: "Y", avisarCoordenacao: false }]);
  });

  it("dia acima da jornada sem hora deste projeto não conta; dentro da folga entre aprovados não avisa", () => {
    expect(conflitosNovos([], [dia("2026-11-26", [parcela("Y", "y1", 6), parcela("Z", "z1", 6)])], "X", true)).toEqual([]);
    expect(conflitosNovos([], [dia("2026-11-26", [parcela("X", "x1", 4.002), parcela("Y", "y1", 4)])], "X", true)).toMatchObject([
      { avisarCoordenacao: false },
    ]);
  });
});

describe("paraTela", () => {
  const novos = conflitosNovos([], [dia("2026-11-26", [parcela("X", "x1", 8), parcela("Y", "y1", 8)])], "X", true);
  const contexto = {
    nomes: new Map([["mireli", "Mireli"]]),
    linhas: { x1: { nome: "Modelagem" }, y1: { nome: "Revisão interna" } },
    projetos: { Y: { codigo: "Y", nome: "Projeto Y" } },
    verCargaDaEquipe: true,
    avisados: new Set(["Y"]),
  };

  it("nomes resolvidos e coordenação avisada só se alguém recebeu", () => {
    expect(paraTela(novos, contexto)).toEqual([
      {
        userId: "mireli",
        nome: "Mireli",
        dias: ["2026-11-26"],
        outro: { codigo: "Y", rotulo: "Y — Projeto Y", linhas: ["Revisão interna"] },
        outroRascunho: false,
        coordenacaoAvisada: true,
        linhasDeste: ["Modelagem"],
      },
    ]);
    expect(paraTela(novos, { ...contexto, avisados: new Set() })[0].coordenacaoAvisada).toBe(false);
  });

  it("sem recursos:ver o outro projeto não tem nome, tarefa, situação nem aviso", () => {
    const sem = paraTela(novos, { ...contexto, verCargaDaEquipe: false })[0];
    expect(sem.outro).toBeNull();
    expect([sem.outroRascunho, sem.coordenacaoAvisada]).toEqual([false, false]);
  });
});

describe("textos", () => {
  const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  it("dias", () => {
    expect(diasDoConflito(["2026-11-26"], curta)).toBe("26/11");
    expect(diasDoConflito(["2026-11-26", "2026-11-27"], curta)).toBe("26/11 e 27/11");
    expect(diasDoConflito(["2026-11-26", "2026-11-27", "2026-11-30"], curta)).toBe("26/11 e mais 2 dias");
  });

  it("aviso à coordenação, com e sem o nome do projeto de origem", () => {
    expect(textoDoAvisoDeCascata({ afetado: "Y", origem: "X — Projeto X", pessoas: [{ nome: "Mireli", dias: "26/11" }] })).toEqual({
      titulo: "Conflito de recurso no Y",
      corpo:
        'Mireli passou da jornada em 26/11 depois de uma data registrada no X — Projeto X. Nenhuma data do Y mudou: veja se é caso de abrir "Revisar planejamento".',
    });
    const dois = textoDoAvisoDeCascata({
      afetado: "Y",
      origem: null,
      pessoas: [
        { nome: "Mireli", dias: "26/11" },
        { nome: "João", dias: "27/11" },
      ],
    });
    expect(dois.corpo).toMatch(/^Mireli \(26\/11\) e João \(27\/11\) passaram da jornada depois de uma data registrada em outro cronograma\./);
  });
});
