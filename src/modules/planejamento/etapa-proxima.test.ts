import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import { ANTECEDENCIA_DIAS_UTEIS, etapasParaAvisar, textoAvisoEtapa, type LinhaDeEtapa } from "./etapa-proxima";

// Segunda 12/10/2026 é feriado (N. Sra. Aparecida) neste calendário.
const cal = criarCalendario({ feriados: ["2026-10-12"] });
const l = (disciplinaEtapaId: string, inicio: string, extra: Partial<LinhaDeEtapa> = {}): LinhaDeEtapa => ({
  disciplinaEtapaId,
  inicio,
  iniciada: false,
  pessoas: [],
  ...extra,
});

describe("etapasParaAvisar — aviso da etapa que vem", () => {
  it("antecedência é de 2 dias úteis", () => {
    expect(ANTECEDENCIA_DIAS_UTEIS).toBe(2);
  });

  it("avisa a partir de 2 dias úteis antes do início, pulando fim de semana e feriado", () => {
    // Início quarta 14/10: 2 dias úteis antes = sexta 09/10 (pula sáb, dom e o feriado de segunda).
    const linhas = [l("bas", "2026-10-14")];
    expect(etapasParaAvisar(linhas, "2026-10-08", cal)).toEqual([]);
    expect(etapasParaAvisar(linhas, "2026-10-09", cal).map((e) => e.disciplinaEtapaId)).toEqual(["bas"]);
    expect(etapasParaAvisar(linhas, "2026-10-13", cal)).toHaveLength(1);
  });

  it("no dia do início ou depois não avisa mais", () => {
    expect(etapasParaAvisar([l("bas", "2026-10-14")], "2026-10-14", cal)).toEqual([]);
  });

  it("o início da etapa é o menor entre as linhas e as pessoas de todas as linhas se juntam", () => {
    const r = etapasParaAvisar(
      [
        l("bas", "2026-10-20", { pessoas: ["maria"] }),
        l("bas", "2026-10-15", { pessoas: ["joao", "maria"] }),
        l("exe", "2026-12-01", { pessoas: ["ana"] }),
      ],
      "2026-10-13",
      cal,
    );
    expect(r).toEqual([{ disciplinaEtapaId: "bas", inicio: "2026-10-15", pessoas: ["joao", "maria"] }]);
  });

  it("etapa com alguma linha já iniciada não avisa", () => {
    const r = etapasParaAvisar([l("bas", "2026-10-15"), l("bas", "2026-10-16", { iniciada: true })], "2026-10-14", cal);
    expect(r).toEqual([]);
  });
});

describe("etapasParaAvisar — fronteiras", () => {
  it("início numa segunda: o aviso sai na quinta anterior (2 dias úteis), não no fim de semana", () => {
    // Segunda 19/10/2026. 2 dias úteis antes = quinta 15/10.
    const linhas = [l("bas", "2026-10-19")];
    expect(etapasParaAvisar(linhas, "2026-10-14", cal)).toEqual([]);
    expect(etapasParaAvisar(linhas, "2026-10-15", cal)).toHaveLength(1);
    // Sábado e domingo ainda estão na janela (o job pode ter falhado na sexta): a chave do banco impede repetir.
    expect(etapasParaAvisar(linhas, "2026-10-17", cal)).toHaveLength(1);
    expect(etapasParaAvisar(linhas, "2026-10-18", cal)).toHaveLength(1);
  });

  it("início num sábado (calendário só com dias úteis): conta a partir do dia útil anterior", () => {
    expect(etapasParaAvisar([l("bas", "2026-10-17")], "2026-10-15", cal)).toHaveLength(1);
    expect(etapasParaAvisar([l("bas", "2026-10-17")], "2026-10-13", cal)).toEqual([]);
  });

  it("etapa que já começou há dias ou sem nenhuma linha não avisa", () => {
    expect(etapasParaAvisar([l("bas", "2026-10-01")], "2026-10-09", cal)).toEqual([]);
    expect(etapasParaAvisar([], "2026-10-09", cal)).toEqual([]);
  });

  it("várias etapas saem em ordem de início, e a pessoa repetida em linhas da mesma etapa entra uma vez", () => {
    const r = etapasParaAvisar(
      [l("exe", "2026-10-15", { pessoas: ["ana"] }), l("bas", "2026-10-14", { pessoas: ["maria", "maria"] }), l("bas", "2026-10-16", { pessoas: ["maria"] })],
      "2026-10-13",
      cal,
    );
    expect(r.map((e) => e.disciplinaEtapaId)).toEqual(["bas", "exe"]);
    expect(r[0].pessoas).toEqual(["maria"]);
  });
});

describe("textoAvisoEtapa", () => {
  it("diz disciplina, etapa, projeto e a data", () => {
    const t = textoAvisoEtapa({ disciplina: "Estrutural", etapa: "Básico", projetoCodigo: "26.012", inicio: "2026-10-15" });
    expect(t.titulo).toBe("Próxima etapa: Estrutural · Básico");
    expect(t.corpo).toContain("26.012");
    expect(t.corpo).toContain("15/10/2026");
  });
});
