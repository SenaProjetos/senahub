import { describe, expect, it } from "vitest";
import type { EstruturaModelo, LinhaModelo } from "./estrutura";
import { validarIntegridade } from "./edicao";
import { emOrdemDeArvore } from "./aplicar";
import { ID_RAIZ_DISCIPLINA, disciplinasDoModelo, estruturaDaDisciplina, extrairDisciplina, modeloPadraoDaDisciplina } from "./por-disciplina";

const l = (id: string, parentId: string | null, ordem: number, extra: Partial<LinhaModelo> = {}): LinhaModelo => ({
  id, parentId, ordem, nome: id, tipoEap: "atv", duracaoDias: 2,
  disciplinaCatalogoId: null, etapaId: null, deTerceiro: false, predecessoras: [], ...extra,
});
const fs = (id: string) => ({ id, tipo: "fs" as const, lagDias: 0 });

// GESTÃO > base (marco)
// BÁSICO > ESTR (e1a ← base, e1b ← e1a, e1m ← e1b) ; FUND (f1a ← e1m)
// validação (terceiro) ← e1m
// EXECUTIVO > ESTR (e2a ← validação, e2m ← e2a)
const origem: EstruturaModelo = {
  versao: 1,
  jornadaMinutos: 480,
  linhas: [
    l("G", null, 0, { tipoEap: "res", duracaoDias: 0 }),
    l("base", "G", 1, { tipoEap: "mrc", duracaoDias: 0 }),
    l("B", null, 2, { tipoEap: "fas", duracaoDias: 0, etapaId: "fb" }),
    l("E1", "B", 3, { tipoEap: "disc", duracaoDias: 0, disciplinaCatalogoId: "d-est", etapaId: "fb" }),
    l("e1a", "E1", 4, { etapaId: "fb", predecessoras: [fs("base")] }),
    l("e1b", "E1", 5, { etapaId: "fb", predecessoras: [fs("e1a")] }),
    l("e1m", "E1", 6, { tipoEap: "mrc", duracaoDias: 0, etapaId: "fb", predecessoras: [fs("e1b")] }),
    l("F1", "B", 7, { tipoEap: "disc", duracaoDias: 0, disciplinaCatalogoId: "d-fund", etapaId: "fb" }),
    l("f1a", "F1", 8, { etapaId: "fb", predecessoras: [fs("e1m")] }),
    l("V", null, 9, { deTerceiro: true, predecessoras: [fs("e1m")] }),
    l("X", null, 10, { tipoEap: "fas", duracaoDias: 0, etapaId: "fx" }),
    l("E2", "X", 11, { tipoEap: "disc", duracaoDias: 0, disciplinaCatalogoId: "d-est", etapaId: "fx" }),
    l("e2a", "E2", 12, { etapaId: "fx", predecessoras: [fs("V")] }),
    l("e2m", "E2", 13, { tipoEap: "mrc", duracaoDias: 0, etapaId: "fx", predecessoras: [fs("e2a")] }),
  ],
  mapaDisciplina: {},
  mapaFase: {},
  percentuaisPorFase: { fb: 60, fx: 40 },
  avisos: [],
};
const nomes = (disciplina: string) => ({ disciplina, fase: (id: string) => ({ fb: "Projeto Básico", fx: "Projeto Executivo" })[id] ?? null });
const tela = (linhas: LinhaModelo[]) => emOrdemDeArvore(linhas).map((x) => `${x.parentId ?? "·"}>${x.id}`);

describe("extrairDisciplina", () => {
  const e = extrairDisciplina(origem, "d-est", nomes("Estrutural"));
  const porId = new Map(e.linhas.map((x) => [x.id, x]));

  it("disciplina › fase › tarefas, juntando as aparições da disciplina em cada fase", () => {
    expect(tela(e.linhas)).toEqual([
      `·>${ID_RAIZ_DISCIPLINA}`, `${ID_RAIZ_DISCIPLINA}>E1`, "E1>e1a", "E1>e1b", "E1>e1m", `${ID_RAIZ_DISCIPLINA}>E2`, "E2>e2a", "E2>e2m",
    ]);
    expect(porId.get(ID_RAIZ_DISCIPLINA)).toMatchObject({ tipoEap: "disc", nome: "Estrutural", disciplinaCatalogoId: "d-est" });
    expect(porId.get("E1")).toMatchObject({ tipoEap: "fas", nome: "Projeto Básico", etapaId: "fb" });
    expect(porId.get("E2")).toMatchObject({ tipoEap: "fas", nome: "Projeto Executivo", etapaId: "fx" });
    expect(e.linhas.every((x) => x.disciplinaCatalogoId === "d-est")).toBe(true);
    expect(e.fases).toEqual(["fb", "fx"]);
  });

  it("vínculo com o que fica fora da disciplina cai; os de dentro ficam", () => {
    expect(porId.get("e1a")!.predecessoras).toEqual([]);
    expect(porId.get("e1b")!.predecessoras).toEqual([fs("e1a")]);
    expect(e.vinculosDeFora).toBe(2); // e1a ← gestão, e2a ← validação do cliente
  });

  it("a fase seguinte começa depois do fim da anterior (o marco que fecha a fase)", () => {
    expect(porId.get("e2a")!.predecessoras).toEqual([fs("e1m")]);
    expect(e.vinculosEntreFases).toBe(1);
  });

  it("o resultado é um modelo íntegro e não mexe no de origem", () => {
    expect(validarIntegridade(e.linhas)).toEqual({ ok: true });
    expect(origem.linhas.find((x) => x.id === "e1a")!.predecessoras).toEqual([fs("base")]);
  });
});

describe("estruturaDaDisciplina e disciplinasDoModelo", () => {
  it("lista as disciplinas do catálogo que têm linha de disciplina, na ordem do modelo", () => {
    expect(disciplinasDoModelo(origem)).toEqual(["d-est", "d-fund"]);
  });

  it("percentual por fase só vem quando a disciplina está em todas as fases com percentual", () => {
    const est = estruturaDaDisciplina(origem, extrairDisciplina(origem, "d-est", nomes("Estrutural")), "aviso");
    expect(est.percentuaisPorFase).toEqual({ fb: 60, fx: 40 });
    const fund = estruturaDaDisciplina(origem, extrairDisciplina(origem, "d-fund", nomes("Fundações")), "aviso");
    expect(fund.percentuaisPorFase).toEqual({});
    expect(fund.avisos).toEqual(["aviso"]);
    expect(fund.jornadaMinutos).toBe(480);
  });
});

describe("modeloPadraoDaDisciplina", () => {
  const m = (id: string, tipo: string | null, dia: number) => ({ id, tipoEmpreendimentoId: tipo, updatedAt: new Date(2026, 8, dia) });
  it("mesmo tipo do projeto, senão sem tipo, senão o mais recente", () => {
    const modelos = [m("casa", "t-casa", 1), m("geral", null, 2), m("predio", "t-predio", 3)];
    expect(modeloPadraoDaDisciplina(modelos, "t-casa")?.id).toBe("casa");
    expect(modeloPadraoDaDisciplina(modelos, "t-galpao")?.id).toBe("geral");
    expect(modeloPadraoDaDisciplina([m("casa", "t-casa", 1), m("predio", "t-predio", 3)], null)?.id).toBe("predio");
    expect(modeloPadraoDaDisciplina([], "t-casa")).toBeNull();
  });
});
