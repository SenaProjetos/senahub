import { describe, expect, it } from "vitest";
import { montarHorasPorDisciplina } from "./horas-disciplina";

const base = {
  disciplinas: [{ id: "d1", nome: "Estrutural" }, { id: "d2", nome: "Hidráulica" }],
  orcado: [{ disciplinaId: "d1", horas: 100 }],
  planejado: [{ disciplinaId: "d1", horas: 120 }, { disciplinaId: "d2", horas: 40 }],
  realizado: [
    { disciplinaId: "d1", userId: "u1", nome: "Ana", minutos: 3000 },
    { disciplinaId: "d1", userId: "u2", nome: "Beto", minutos: 1200 },
  ],
  custo: [{ disciplinaId: "d1", cent: 250000 }],
};

describe("montarHorasPorDisciplina (decisões 16 e 19)", () => {
  it("coordenador com custo vê tudo, em minutos e centavos", () => {
    const r = montarHorasPorDisciplina({ ...base, viewer: { userId: "x", coordenador: true, podeVerCusto: true } });
    expect(r[0]).toEqual({
      disciplinaId: "d1", nome: "Estrutural", orcadoMin: 6000, planejadoMin: 7200, realizadoMin: 4200,
      porPessoa: [{ userId: "u1", nome: "Ana", minutos: 3000 }, { userId: "u2", nome: "Beto", minutos: 1200 }],
      custoCent: 250000,
    });
  });
  it("coordenador sem permissão de custo: horas completas, reais nulos", () => {
    const r = montarHorasPorDisciplina({ ...base, viewer: { userId: "x", coordenador: true, podeVerCusto: false } });
    expect(r[0].custoCent).toBeNull();
    expect(r[0].porPessoa).toHaveLength(2);
  });
  it("membro comum vê só as próprias horas por pessoa, mas o total da disciplina inteiro", () => {
    const r = montarHorasPorDisciplina({ ...base, viewer: { userId: "u2", coordenador: false, podeVerCusto: false } });
    expect(r[0].realizadoMin).toBe(4200);
    expect(r[0].porPessoa).toEqual([{ userId: "u2", nome: "Beto", minutos: 1200 }]);
    expect(r[0].custoCent).toBeNull();
  });
  it("sem linha de base o orçado é nulo; disciplina sem nada fica com zeros", () => {
    const r = montarHorasPorDisciplina({ ...base, orcado: null, viewer: { userId: "x", coordenador: true, podeVerCusto: true } });
    expect(r[0].orcadoMin).toBeNull();
    expect(r[1]).toEqual({ disciplinaId: "d2", nome: "Hidráulica", orcadoMin: null, planejadoMin: 2400, realizadoMin: 0, porPessoa: [], custoCent: 0 });
  });
  it("orçado só para algumas disciplinas: as outras ficam com 0 (tinha base, mas não essa disciplina)", () => {
    const r = montarHorasPorDisciplina({ ...base, viewer: { userId: "x", coordenador: true, podeVerCusto: true } });
    expect(r[1].orcadoMin).toBe(0);
  });
  it("horas fracionadas viram minutos arredondados", () => {
    const r = montarHorasPorDisciplina({ ...base, orcado: [{ disciplinaId: "d1", horas: 1.5 }], viewer: { userId: "x", coordenador: true, podeVerCusto: true } });
    expect(r[0].orcadoMin).toBe(90);
  });
});
