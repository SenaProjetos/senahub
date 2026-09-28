import { describe, expect, it } from "vitest";
import { abatimentoParcial, expandirAbonos, minutosJanela } from "@/modules/ponto/abono";
import { esperadoPorDiaMes } from "@/modules/ponto/esperado";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ini = d("2026-09-01");
const fimExcl = d("2026-10-01");
const escala = Array.from({ length: 7 }, (_, i) => ({ ativo: i >= 1 && i <= 5, horasDia: 6 }));
const base = { ano: 2026, mes: 9, escala, feriados: new Set<string>(), ferias: new Set<string>(), piso: null, teto: null, controlaJornada: true };

describe("abono", () => {
  it("dia inteiro cobre o intervalo e recorta ao mês", () => {
    const r = expandirAbonos([{ dataInicio: d("2026-08-30"), dataFim: d("2026-09-02"), horaInicio: null, horaFim: null, tratamento: "abonar" as const }], ini, fimExcl);
    expect([...r.inteiros]).toEqual(["2026-09-01", "2026-09-02"]);
    expect(r.parciais.size).toBe(0);
  });

  it("dia inteiro zera o esperado (via ferias) e o dia seguinte segue cobrado", () => {
    const r = expandirAbonos([{ dataInicio: d("2026-09-21"), dataFim: d("2026-09-21"), horaInicio: null, horaFim: null, tratamento: "abonar" as const }], ini, fimExcl);
    const m = esperadoPorDiaMes({ ...base, ferias: r.inteiros });
    expect(m["2026-09-21"]).toBe(0);
    expect(m["2026-09-22"]).toBe(360);
  });

  it("parcial abate só a janela", () => {
    const r = expandirAbonos([{ dataInicio: d("2026-09-22"), dataFim: d("2026-09-22"), horaInicio: "14:00", horaFim: "16:00", tratamento: "abonar" as const }], ini, fimExcl);
    expect(r.inteiros.size).toBe(0);
    const m = esperadoPorDiaMes({ ...base, abatimentos: abatimentoParcial(r.parciais) });
    expect(m["2026-09-22"]).toBe(240);
  });

  it("parcial maior que o dia não deixa esperado negativo", () => {
    const m = esperadoPorDiaMes({ ...base, abatimentos: { "2026-09-22": 900 } });
    expect(m["2026-09-22"]).toBe(0);
  });

  it("janela inválida ou invertida vale 0", () => {
    expect(minutosJanela("16:00", "14:00")).toBe(0);
    expect(minutosJanela("25:00", "26:00")).toBe(0);
    expect(minutosJanela(null, "10:00")).toBe(0);
  });

  it("horário em intervalo de vários dias é ignorado (vira dia inteiro)", () => {
    const r = expandirAbonos([{ dataInicio: d("2026-09-22"), dataFim: d("2026-09-23"), horaInicio: "14:00", horaFim: "16:00", tratamento: "abonar" as const }], ini, fimExcl);
    expect(r.inteiros.size).toBe(2);
  });

  it("banco de horas justifica mas NÃO altera o esperado", () => {
    const r = expandirAbonos(
      [
        { dataInicio: d("2026-09-21"), dataFim: d("2026-09-21"), horaInicio: null, horaFim: null, tratamento: "banco_horas" },
        { dataInicio: d("2026-09-22"), dataFim: d("2026-09-22"), horaInicio: "14:00", horaFim: "16:00", tratamento: "banco_horas" },
      ],
      ini,
      fimExcl,
    );
    expect(r.inteiros.size).toBe(0);
    expect(r.parciais.size).toBe(0);
    expect([...r.bancoInteiros]).toEqual(["2026-09-21"]);
    expect(r.bancoParciais.get("2026-09-22")?.minutos).toBe(120);
    const m = esperadoPorDiaMes({ ...base, ferias: r.inteiros, abatimentos: abatimentoParcial(r.parciais) });
    expect(m["2026-09-21"]).toBe(360);
    expect(m["2026-09-22"]).toBe(360);
  });
});
