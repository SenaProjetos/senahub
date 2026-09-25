import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import { duracaoConvertida, type LinhaDuracaoLegada } from "./duracao-legada";

// 2026-10-12 é feriado (Nossa Senhora Aparecida).
const cal = criarCalendario({ feriados: ["2026-10-12"] });
const linha = (o: Partial<LinhaDuracaoLegada> = {}): LinhaDuracaoLegada => ({
  tipoEap: "atv",
  ehResumo: false,
  duracaoDias: 14,
  inicio: "2026-10-05",
  fim: "2026-10-18",
  ...o,
});

describe("duracaoConvertida", () => {
  it("duração em dias corridos (o que a F0 gravou) vira os dias úteis que as datas cobrem", () => {
    // 05/10 (seg) a 18/10 (dom): 14 corridos, 9 úteis (10 dias de semana menos o feriado de 12/10).
    expect(duracaoConvertida(linha(), cal)).toBe(9);
  });

  it("linha já em dias úteis (outro número) não é tocada — é o que torna o script seguro de repetir", () => {
    expect(duracaoConvertida(linha({ duracaoDias: 9 }), cal)).toBeNull();
    expect(duracaoConvertida(linha({ duracaoDias: 5 }), cal)).toBeNull();
  });

  it("quando corridos e úteis coincidem, não há o que mudar", () => {
    // Uma segunda-feira sozinha: 1 corrido, 1 útil.
    expect(duracaoConvertida(linha({ duracaoDias: 1, inicio: "2026-10-05", fim: "2026-10-05" }), cal)).toBeNull();
  });

  it("marco e agrupamento ficam de fora", () => {
    expect(duracaoConvertida(linha({ tipoEap: "mrc" }), cal)).toBeNull();
    expect(duracaoConvertida(linha({ ehResumo: true }), cal)).toBeNull();
  });

  it("linha só em fim de semana não fica com duração zero", () => {
    // Sábado e domingo: 2 corridos, 0 úteis → 1 (atividade não pode ter duração zero).
    expect(duracaoConvertida(linha({ duracaoDias: 2, inicio: "2026-10-10", fim: "2026-10-11" }), cal)).toBe(1);
  });

  it("fim antes do início (dado ruim) conta 1 corrido, como a F0", () => {
    expect(duracaoConvertida(linha({ duracaoDias: 1, inicio: "2026-10-09", fim: "2026-10-05" }), cal)).toBeNull();
  });
});
