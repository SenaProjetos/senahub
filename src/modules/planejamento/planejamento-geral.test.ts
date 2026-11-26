import { describe, expect, it } from "vitest";
import type { SobrecargaDia } from "./recursos";
import {
  conflitosPorLinha,
  extremos,
  filtrarPlanejamentoGeral,
  linkDaPessoa,
  montarLinhasDoProjeto,
  opcoesDosFiltros,
  periodoDoPlanejamentoGeral,
  SEM_FILTRO,
  textoDosDias,
  type LinhaBruta,
  type ProjetoGeral,
} from "./planejamento-geral";

const parcela = (linhaId: string, projetoId: string, horas: number, rascunho = false) => ({
  userId: "u1",
  dia: "2026-12-02",
  projetoId,
  linhaId,
  atribuicaoId: `a-${linhaId}`,
  horas,
  rascunho,
});

const sobrecarga = (dia: string, capacidade: number, parcelas: ReturnType<typeof parcela>[]): SobrecargaDia => {
  const carga = parcelas.reduce((s, p) => s + p.horas, 0);
  return { userId: "u1", dia, carga, capacidade, excesso: carga - capacidade, parcelas: parcelas.map((p) => ({ ...p, dia })), motivosReducao: [] };
};

const linha = (o: Partial<LinhaBruta> & { id: string }): LinhaBruta => ({
  parentId: null,
  ordem: 0,
  nome: o.id,
  inicio: "2026-12-01",
  fim: "2026-12-04",
  marco: false,
  encerrada: false,
  progresso: 0,
  disciplina: null,
  atribuicoes: [],
  ...o,
});

describe("periodoDoPlanejamentoGeral", () => {
  it("sem nada = da segunda desta semana a 12 semanas depois", () => {
    expect(periodoDoPlanejamentoGeral(null, null, "2026-11-26")).toEqual({ de: "2026-11-23", ate: "2027-02-14" });
  });
  it("data inválida (31/02) cai no padrão; ate antes do de troca; mais de 1 ano corta", () => {
    expect(periodoDoPlanejamentoGeral("2026-02-31", null, "2026-11-26").de).toBe("2026-11-23");
    expect(periodoDoPlanejamentoGeral("2026-12-10", "2026-12-01", "2026-11-26")).toEqual({ de: "2026-12-01", ate: "2026-12-10" });
    expect(periodoDoPlanejamentoGeral("2026-01-01", "2028-01-01", "2026-11-26")).toEqual({ de: "2026-01-01", ate: "2027-01-01" });
  });
});

describe("conflitosPorLinha", () => {
  const periodo = { de: "2026-12-01", ate: "2026-12-31" };

  it("dia acima da jornada só com aprovados: as duas linhas aprovadas marcam a pessoa", () => {
    const m = conflitosPorLinha([sobrecarga("2026-12-02", 8, [parcela("L1", "P1", 8), parcela("L2", "P2", 4)])], periodo);
    expect(m.get("L1")?.get("u1")).toEqual(["2026-12-02"]);
    expect(m.get("L2")?.get("u1")).toEqual(["2026-12-02"]);
  });

  it("o rascunho que estoura o dia marca só a linha do rascunho (o aprovado não ganha alerta por rascunho)", () => {
    const m = conflitosPorLinha([sobrecarga("2026-12-02", 8, [parcela("L1", "P1", 6), parcela("R1", "P3", 4, true)])], periodo);
    expect(m.has("L1")).toBe(false);
    expect(m.get("R1")?.get("u1")).toEqual(["2026-12-02"]);
  });

  it("fora do período e parcela zerada não contam", () => {
    const m = conflitosPorLinha(
      [sobrecarga("2027-01-05", 8, [parcela("L1", "P1", 10)]), sobrecarga("2026-12-03", 8, [parcela("L1", "P1", 10), parcela("L9", "P1", 0)])],
      periodo,
    );
    expect(m.get("L1")?.get("u1")).toEqual(["2026-12-03"]);
    expect(m.has("L9")).toBe(false);
  });
});

describe("montarLinhasDoProjeto", () => {
  it("EDT pela árvore, pessoas sem repetir com o conflito, perfil à parte e Externo como marca", () => {
    const linhas = montarLinhasDoProjeto(
      [
        linha({ id: "G", ordem: 0 }),
        linha({
          id: "A",
          parentId: "G",
          ordem: 0,
          atribuicoes: [
            { userId: "u1", nome: "Mireli", papel: "pro", rotuloPapel: "Projetista" },
            { userId: "u1", nome: "Mireli", papel: "rev", rotuloPapel: "Revisor" },
            { userId: null, nome: null, papel: "pro", rotuloPapel: "Projetista" },
            { userId: null, nome: null, papel: "ext", rotuloPapel: "Externo" },
          ],
        }),
        linha({ id: "M", parentId: "G", ordem: 1, marco: true, inicio: "2026-12-10", fim: null }),
      ],
      new Map([["A", new Map([["u1", ["2026-12-02"]]])]]),
    );
    expect(linhas.map((l) => [l.id, l.codigo, l.nivel, l.temFilhos])).toEqual([
      ["G", "1", 1, true],
      ["A", "1.1", 2, false],
      ["M", "1.2", 2, false],
    ]);
    expect(linhas[1].responsaveis).toEqual([{ userId: "u1", nome: "Mireli", conflitos: ["2026-12-02"] }]);
    expect(linhas[1].perfis).toEqual(["Projetista"]);
    expect(linhas[1].externo).toBe(true);
    expect(linhas[2].fim).toBe("2026-12-10");
  });
});

describe("filtrarPlanejamentoGeral", () => {
  const projeto = (id: string, aprovado: boolean, brutas: LinhaBruta[], conflitos = new Map()): ProjetoGeral => {
    const linhas = montarLinhasDoProjeto(brutas, conflitos);
    return { id, codigo: id, nome: id, cor: "projeto-1", aprovado, emRevisao: false, ...extremos(linhas), linhas };
  };
  const mireli = { userId: "u1", nome: "Mireli", papel: "pro", rotuloPapel: "Projetista" };
  const joao = { userId: "u2", nome: "João", papel: "pro", rotuloPapel: "Projetista" };
  const P1 = projeto(
    "P1",
    true,
    [
      linha({ id: "G1" }),
      linha({ id: "E1", parentId: "G1", ordem: 0, disciplina: "Elétrica", atribuicoes: [mireli] }),
      linha({ id: "G2", parentId: "G1", ordem: 1 }),
      linha({ id: "H1", parentId: "G2", ordem: 0, disciplina: "Hidráulica", atribuicoes: [joao], inicio: "2027-03-01", fim: "2027-03-05" }),
      linha({ id: "S1", ordem: 1, disciplina: "Elétrica", atribuicoes: [joao] }),
    ],
    new Map([["E1", new Map([["u1", ["2026-12-02", "2026-12-03"]]])]]),
  );
  const P2 = projeto("P2", false, [linha({ id: "R1", disciplina: "Hidráulica", atribuicoes: [mireli] })]);
  const periodo = { de: "2026-11-30", ate: "2027-01-31" };

  it("sem filtro: linhas do período com os agrupamentos acima; contador de vistos e total", () => {
    const r = filtrarPlanejamentoGeral([P1, P2], SEM_FILTRO, periodo);
    expect(r.vistos).toBe(2);
    expect(r.total).toBe(2);
    // H1 (março) sai; G2 fica sem filho no período e sai junto.
    expect(r.projetos[0].linhas.map((l) => l.id)).toEqual(["G1", "E1", "S1"]);
    expect(r.projetos[0].conflitos).toBe(2);
  });

  it("total da tela: a mesma pessoa no mesmo dia em dois projetos conta uma vez; filtro de pessoa conta só os dela", () => {
    const conflito = new Map([["X", new Map([["u1", ["2026-12-02"]], ["u2", ["2026-12-02"]]])]]);
    const Q1 = projeto("Q1", true, [linha({ id: "X", atribuicoes: [mireli, joao] })], conflito);
    const Q2 = projeto("Q2", true, [linha({ id: "Y", atribuicoes: [mireli] })], new Map([["Y", new Map([["u1", ["2026-12-02"]]])]]));
    const r = filtrarPlanejamentoGeral([Q1, Q2], SEM_FILTRO, periodo);
    expect(r.projetos.map((p) => p.conflitos)).toEqual([2, 1]);
    expect(r.conflitos).toBe(2);
    const soJoao = filtrarPlanejamentoGeral([Q1, Q2], { ...SEM_FILTRO, userId: "u2" }, periodo);
    expect(soJoao.conflitos).toBe(1);
    expect(soJoao.projetos[0].conflitos).toBe(1);
  });

  it("pessoa e disciplina casam na linha sem filhos e levam o agrupamento", () => {
    const r = filtrarPlanejamentoGeral([P1, P2], { ...SEM_FILTRO, userId: "u2", disciplina: "Hidráulica" }, { de: "2026-11-30", ate: "2027-12-31" });
    expect(r.projetos.map((p) => p.id)).toEqual(["P1"]);
    expect(r.projetos[0].linhas.map((l) => l.id)).toEqual(["G1", "G2", "H1"]);
  });

  it("vários projetos e aprovado × rascunho", () => {
    expect(filtrarPlanejamentoGeral([P1, P2], { ...SEM_FILTRO, projetoIds: ["P2"] }, periodo).projetos.map((p) => p.id)).toEqual(["P2"]);
    expect(filtrarPlanejamentoGeral([P1, P2], { ...SEM_FILTRO, cronograma: "rascunho" }, periodo).projetos.map((p) => p.id)).toEqual(["P2"]);
    expect(filtrarPlanejamentoGeral([P1, P2], { ...SEM_FILTRO, cronograma: "aprovado" }, periodo).projetos.map((p) => p.id)).toEqual(["P1"]);
  });

  it("projeto sem linha no período sai e o total segue", () => {
    const r = filtrarPlanejamentoGeral([P1, P2], SEM_FILTRO, { de: "2028-01-01", ate: "2028-02-01" });
    expect(r.vistos).toBe(0);
    expect(r.total).toBe(2);
  });

  it("opções dos filtros em ordem alfabética, sem agrupamento", () => {
    expect(opcoesDosFiltros([P1, P2])).toEqual({
      disciplinas: ["Elétrica", "Hidráulica"],
      pessoas: [
        { userId: "u2", nome: "João" },
        { userId: "u1", nome: "Mireli" },
      ],
    });
  });
});

describe("textos e links", () => {
  it("link da pessoa e dias", () => {
    expect(linkDaPessoa("u1", "2026-12-02")).toBe("/recursos/por-pessoa?pessoa=u1&de=2026-12-02");
    expect(linkDaPessoa("u1", null)).toBe("/recursos/por-pessoa?pessoa=u1");
    expect(textoDosDias(["2026-12-02"])).toBe("02/12");
    expect(textoDosDias(["2026-12-02", "2026-12-03"])).toBe("02/12 e 03/12");
    expect(textoDosDias(["2026-12-02", "2026-12-03", "2026-12-04", "2026-12-07"])).toBe("02/12, 03/12 e mais 2");
  });
});
