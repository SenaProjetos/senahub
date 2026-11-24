import { describe, expect, it } from "vitest";
import { concluiPeloPercentual, datasPeloPlanejado, rotuloDaOrigem } from "./concluir-pelo-planejado";
import { MOTIVO_REABRIR_NA_CELULA, motivoParaBaixarPercentual } from "./execucao";

const HOJE = "2026-11-24";
const base = {
  inicioReal: null,
  inicioBaseline: "2026-10-01",
  fimBaseline: "2026-10-10",
  inicioPrevisto: "2026-10-05",
  fimPrevisto: "2026-10-20",
};

describe("datasPeloPlanejado", () => {
  it("linha de base no passado: as datas dela", () => {
    expect(datasPeloPlanejado(base, HOJE)).toEqual({ inicioReal: "2026-10-01", fimReal: "2026-10-10", origem: "linha_base" });
  });

  it("término da linha de base depois de hoje: termina hoje", () => {
    expect(datasPeloPlanejado({ ...base, fimBaseline: "2026-12-05" }, HOJE)).toEqual({
      inicioReal: "2026-10-01",
      fimReal: HOJE,
      origem: "linha_base",
    });
  });

  it("início da linha de base também depois de hoje: começa e termina hoje", () => {
    expect(datasPeloPlanejado({ ...base, inicioBaseline: "2026-11-30", fimBaseline: "2026-12-05" }, HOJE)).toEqual({
      inicioReal: HOJE,
      fimReal: HOJE,
      origem: "linha_base",
    });
  });

  it("início real já gravado é mantido", () => {
    expect(datasPeloPlanejado({ ...base, inicioReal: "2026-10-03" }, HOJE)).toEqual({
      inicioReal: "2026-10-03",
      fimReal: "2026-10-10",
      origem: "linha_base",
    });
  });

  it("início real depois do término da linha de base: termina no próprio início real", () => {
    expect(datasPeloPlanejado({ ...base, inicioReal: "2026-10-15" }, HOJE)).toEqual({
      inicioReal: "2026-10-15",
      fimReal: "2026-10-15",
      origem: "linha_base",
    });
  });

  it("sem linha de base completa: usa as datas previstas", () => {
    expect(datasPeloPlanejado({ ...base, fimBaseline: null }, HOJE)).toEqual({
      inicioReal: "2026-10-05",
      fimReal: "2026-10-20",
      origem: "previsto",
    });
  });

  it("sem linha de base nem previsto: null", () => {
    expect(
      datasPeloPlanejado({ inicioReal: null, inicioBaseline: null, fimBaseline: null, inicioPrevisto: null, fimPrevisto: null }, HOJE),
    ).toBeNull();
  });
});

describe("concluiPeloPercentual", () => {
  const atv = { tipoEap: "atv", ehResumo: false, status: "and" as const, progresso: 60, fimReal: null };

  it("atividade aberta indo a 100 conclui", () => {
    expect(concluiPeloPercentual(atv, 100)).toBe(true);
    expect(concluiPeloPercentual({ ...atv, status: "nin", progresso: 0 }, 100)).toBe(true);
    expect(concluiPeloPercentual({ ...atv, status: "rev" }, 100)).toBe(true);
  });

  it("menos de 100, ou já em 100, não conclui", () => {
    expect(concluiPeloPercentual(atv, 99)).toBe(false);
    expect(concluiPeloPercentual({ ...atv, progresso: 100 }, 100)).toBe(false);
  });

  it("marco, agrupamento, com término real, bloqueada ou fora da execução não conclui", () => {
    expect(concluiPeloPercentual({ ...atv, tipoEap: "mrc" }, 100)).toBe(false);
    expect(concluiPeloPercentual({ ...atv, ehResumo: true }, 100)).toBe(false);
    expect(concluiPeloPercentual({ ...atv, fimReal: "2026-10-10" }, 100)).toBe(false);
    for (const status of ["blq", "sus", "can", "arq", "con"] as const) {
      expect(concluiPeloPercentual({ ...atv, status }, 100)).toBe(false);
    }
  });
});

describe("motivoParaBaixarPercentual", () => {
  it("baixar o % de uma linha concluída pede o Atualizar tarefa", () => {
    expect(motivoParaBaixarPercentual({ ehResumo: false, status: "con", progresso: 100 }, 90)).toBe(MOTIVO_REABRIR_NA_CELULA);
  });

  it("linha aberta, agrupamento ou mesmo % passam", () => {
    expect(motivoParaBaixarPercentual({ ehResumo: false, status: "and", progresso: 100 }, 90)).toBeNull();
    expect(motivoParaBaixarPercentual({ ehResumo: true, status: "con", progresso: 100 }, 90)).toBeNull();
    expect(motivoParaBaixarPercentual({ ehResumo: false, status: "con", progresso: 100 }, 100)).toBeNull();
  });
});

describe("rotuloDaOrigem", () => {
  it("diz de onde vieram as datas", () => {
    expect(rotuloDaOrigem("linha_base")).toBe("linha de base");
    expect(rotuloDaOrigem("previsto")).toBe("datas previstas");
  });
});
