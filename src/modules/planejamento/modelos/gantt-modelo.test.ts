import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import type { LinhaModelo } from "./estrutura";
import { agendarModelo, linhasDoGantt } from "./gantt-modelo";

const l = (id: string, parentId: string | null, ordem: number, extra: Partial<LinhaModelo> = {}): LinhaModelo => ({
  id, parentId, ordem, nome: `T${id}`, tipoEap: "atv", duracaoDias: 2,
  disciplinaCatalogoId: null, etapaId: null, deTerceiro: false, predecessoras: [], ...extra,
});

const linhas: LinhaModelo[] = [
  l("1", null, 0, { tipoEap: "fas", duracaoDias: 0, etapaId: "f-bas" }),
  l("2", "1", 1, { disciplinaCatalogoId: "d-arq" }),
  l("3", "1", 2, { predecessoras: [{ id: "2", tipo: "fs", lagDias: 0 }] }),
  l("4", "1", 3, { predecessoras: [{ id: "3", tipo: "fs", lagDias: 1 }], deTerceiro: true }),
  l("5", null, 4, { tipoEap: "mrc", duracaoDias: 0, predecessoras: [{ id: "4", tipo: "fs", lagDias: 0 }] }),
  l("6", null, 5, { duracaoDias: 1 }),
];

// 2026-10-05 é segunda-feira; sem feriado para a conta ficar à vista.
const cal = criarCalendario({ feriados: [] });
const nomes = { disciplina: new Map([["d-arq", "Arquitetura"]]), faseSigla: new Map([["f-bas", "BAS"]]) };

describe("linhasDoGantt", () => {
  const resultado = agendarModelo(linhas, "2026-10-05", cal);
  const g = new Map(linhasDoGantt(linhas, resultado, "2026-10-05", nomes).map((t) => [t.id, t]));

  it("datas do motor em dias úteis, com a defasagem pulando o fim de semana", () => {
    expect([g.get("2")!.inicioPrevisto, g.get("2")!.fimPrevisto]).toEqual(["2026-10-05", "2026-10-06"]);
    expect([g.get("3")!.inicioPrevisto, g.get("3")!.fimPrevisto]).toEqual(["2026-10-07", "2026-10-08"]);
    // sexta 09 é a defasagem de 1 dia útil; começa na segunda 12
    expect([g.get("4")!.inicioPrevisto, g.get("4")!.fimPrevisto]).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("o agrupamento cobre os filhos e é resumo", () => {
    expect(g.get("1")).toMatchObject({ inicioPrevisto: "2026-10-05", fimPrevisto: "2026-10-13", ehResumo: true, progressoDerivado: true });
  });

  it("código EAP, marco, disciplina e fase pelo nome, terceiro", () => {
    expect(["1", "2", "3", "4", "5", "6"].map((id) => g.get(id)!.codigoEap)).toEqual(["1", "1.1", "1.2", "1.3", "2", "3"]);
    expect(g.get("5")).toMatchObject({ marco: true, duracaoDias: 0 });
    expect(g.get("2")!.disciplinaNome).toBe("Arquitetura");
    expect(g.get("1")!.etapaSigla).toBe("BAS");
    expect(g.get("4")!.deTerceiro).toBe(true);
  });

  it("caminho crítico: a cadeia longa é crítica, a tarefa solta não", () => {
    expect(["2", "3", "4"].every((id) => g.get(id)!.critica)).toBe(true);
    expect(g.get("6")!.critica).toBe(false);
    expect(g.get("6")!.folgaTotal).toBeGreaterThan(0);
  });

  it("o que o modelo não tem sai vazio", () => {
    expect(g.get("2")).toMatchObject({ progresso: 0, inicioBaseline: null, inicioReal: null, atribuicoes: [], custo: null, idCorporativo: null });
  });
});
