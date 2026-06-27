import { describe, it, expect } from "vitest";
import {
  secaoDoPath,
  delta,
  serieDiaria,
  distribuicaoDiaHora,
  metricasPorSecao,
  type EventoAcesso,
  type EventoAcao,
} from "./uso";

const hoje = new Date(2026, 5, 27); // 27/06/2026

describe("secaoDoPath", () => {
  it("usa o 1º segmento da rota", () => {
    expect(secaoDoPath("/")).toBe("inicio");
    expect(secaoDoPath("/projetos/123/arquivos")).toBe("projetos");
    expect(secaoDoPath("/financeiro?aba=aging")).toBe("financeiro");
    expect(secaoDoPath("/auditoria/uso#x")).toBe("auditoria");
  });
});

describe("delta", () => {
  it("calcula variação e direção", () => {
    expect(delta(10, 5)).toEqual({ pct: 100, direcao: "up" });
    expect(delta(5, 10)).toEqual({ pct: -50, direcao: "down" });
    expect(delta(5, 5)).toEqual({ pct: 0, direcao: "flat" });
    expect(delta(3, 0)).toEqual({ pct: null, direcao: "up" }); // novo
    expect(delta(0, 0)).toEqual({ pct: 0, direcao: "flat" });
  });
});

describe("serieDiaria", () => {
  it("conta por dia na janela", () => {
    const ev = [{ em: new Date(2026, 5, 27) }, { em: new Date(2026, 5, 27) }, { em: new Date(2026, 5, 25) }];
    const s = serieDiaria(ev, { dias: 3, hoje });
    expect(s).toEqual([
      { rotulo: "25/06", valor: 1 },
      { rotulo: "26/06", valor: 0 },
      { rotulo: "27/06", valor: 2 },
    ]);
  });
});

describe("distribuicaoDiaHora", () => {
  it("agrega por dia-da-semana × hora", () => {
    // 27/06/2026 é um sábado (getDay=6)
    const ev = [{ em: new Date(2026, 5, 27, 9) }, { em: new Date(2026, 5, 27, 9) }, { em: new Date(2026, 5, 27, 14) }];
    const { matriz, max } = distribuicaoDiaHora(ev);
    expect(matriz[6][9]).toBe(2);
    expect(matriz[6][14]).toBe(1);
    expect(max).toBe(2);
  });
});

describe("metricasPorSecao", () => {
  it("combina acessos + ações e ordena por acessos desc", () => {
    const acessos: EventoAcesso[] = [
      { secao: "projetos", userId: "u1", em: new Date(2026, 5, 27, 10) },
      { secao: "projetos", userId: "u2", em: new Date(2026, 5, 26, 9) },
      { secao: "financeiro", userId: "u1", em: new Date(2026, 5, 25, 8) },
    ];
    const acessosAnt: EventoAcesso[] = [{ secao: "projetos", userId: "u1", em: new Date(2026, 5, 20) }];
    const acoes: EventoAcao[] = [
      { modulo: "projetos", acao: "criar-projeto", userId: "u1", em: new Date(2026, 5, 27, 10), resultado: "sucesso" },
      { modulo: "projetos", acao: "criar-projeto", userId: "u3", em: new Date(2026, 5, 27, 11), resultado: "falha" },
      { modulo: "projetos", acao: "editar-projeto", userId: "u1", em: new Date(2026, 5, 27, 12), resultado: "bloqueado" },
    ];

    const r = metricasPorSecao(acessos, acessosAnt, acoes);
    const proj = r.find((m) => m.secao === "projetos")!;
    const fin = r.find((m) => m.secao === "financeiro")!;

    expect(r[0].secao).toBe("projetos"); // mais acessos
    expect(proj.acessos).toBe(2);
    expect(proj.usuariosUnicos).toBe(3); // u1, u2 (acessos) + u3 (ação)
    expect(proj.deltaPct).toBe(100); // 2 vs 1 anterior
    expect(proj.acoes).toBe(3);
    expect(proj.topAcao).toEqual({ acao: "criar-projeto", total: 2 });
    expect(proj.falhas).toBe(1);
    expect(proj.bloqueios).toBe(1);
    expect(Math.round(proj.pctFalha)).toBe(33);
    expect(fin.acessos).toBe(1);
    expect(fin.acoes).toBe(0);
    expect(fin.topAcao).toBeNull();
  });
});
