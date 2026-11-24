import { describe, expect, it } from "vitest";
import { diaDeSaoPaulo } from "@/lib/data";
import {
  caminhoDaLua,
  calcularCeu,
  faseDaLua,
  hhmm,
  horaDoCeu,
  iluminacaoDaLua,
  minutoDeSaoPaulo,
  nomeDaFase,
  rotuloDoMomento,
  saudacao,
  solDoDia,
} from "@/modules/dashboard/hero/ceu";

describe("tempo de São Paulo", () => {
  it("converte o instante para o minuto e o dia de São Paulo (UTC−3)", () => {
    const d = new Date("2026-11-24T01:30:00.000Z"); // 23/11 22:30 em SP
    expect(minutoDeSaoPaulo(d)).toBe(22 * 60 + 30);
    expect(diaDeSaoPaulo(d)).toBe("2026-11-23");
  });
});

describe("solDoDia (Recife)", () => {
  it("pôr do sol entre 17h e 17h50 o ano inteiro, nascer entre 4h50 e 5h50", () => {
    for (const dia of ["2026-01-15", "2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"]) {
      const s = solDoDia(dia);
      expect(s.por).toBeGreaterThan(17 * 60);
      expect(s.por).toBeLessThan(17 * 60 + 50);
      expect(s.nascer).toBeGreaterThan(4 * 60 + 50);
      expect(s.nascer).toBeLessThan(5 * 60 + 50);
    }
  });

  it("no inverno o sol nasce mais tarde que no verão", () => {
    expect(solDoDia("2026-06-21").nascer).toBeGreaterThan(solDoDia("2026-12-21").nascer + 20);
  });

  it("21/12/2026 bate com a referência de Recife (nascer ~5h00, pôr ~17h30)", () => {
    const s = solDoDia("2026-12-21");
    expect(Math.abs(s.nascer - (5 * 60 + 0))).toBeLessThan(8);
    expect(Math.abs(s.por - (17 * 60 + 30))).toBeLessThan(8);
  });
});

describe("horaDoCeu", () => {
  const sol = solDoDia("2026-11-23");
  it("o nascer e o pôr reais caem no nascer e pôr do modelo", () => {
    expect(horaDoCeu(sol.nascer, sol)).toBeCloseTo(5.2, 5);
    expect(horaDoCeu(sol.por, sol)).toBeCloseTo(17.8, 5);
    expect(horaDoCeu(0, sol)).toBe(0);
    expect(horaDoCeu(1440, sol)).toBe(24);
  });

  it("é crescente ao longo do dia", () => {
    let anterior = -1;
    for (let m = 0; m <= 1440; m += 15) {
      const h = horaDoCeu(m, sol);
      expect(h).toBeGreaterThan(anterior);
      anterior = h;
    }
  });
});

describe("rótulo e saudação", () => {
  const sol = { nascer: 5 * 60, meioDia: 11 * 60 + 15, por: 17 * 60 + 30 };
  it("rótulos pelo sol real", () => {
    expect(rotuloDoMomento(3 * 60, sol)).toBe("Madrugada");
    expect(rotuloDoMomento(5 * 60 + 10, sol)).toBe("Amanhecer");
    expect(rotuloDoMomento(10 * 60, sol)).toBe("Manhã");
    expect(rotuloDoMomento(14 * 60, sol)).toBe("Tarde");
    expect(rotuloDoMomento(17 * 60, sol)).toBe("Pôr do sol");
    expect(rotuloDoMomento(17 * 60 + 49, sol)).toBe("Pôr do sol");
    expect(rotuloDoMomento(17 * 60 + 50, sol)).toBe("Noite");
  });

  it('"Boa noite" só 20 min depois do pôr', () => {
    expect(saudacao(11 * 60, sol)).toBe("Bom dia");
    expect(saudacao(17 * 60 + 45, sol)).toBe("Boa tarde");
    expect(saudacao(17 * 60 + 50, sol)).toBe("Boa noite");
  });
});

describe("lua", () => {
  it("cheia em 24/11/2026 e 24/12/2026, nova perto de 09/12/2026", () => {
    expect(nomeDaFase(faseDaLua("2026-11-24"))).toBe("Lua cheia");
    expect(nomeDaFase(faseDaLua("2026-12-24"))).toBe("Lua cheia");
    expect(iluminacaoDaLua(faseDaLua("2026-12-09"))).toBeLessThan(0.05);
  });

  it("crescente desenha à esquerda; minguante é o espelho", () => {
    expect(caminhoDaLua(0.2).espelho).toBe(false);
    expect(caminhoDaLua(0.8).espelho).toBe(true);
    // menos da metade iluminada: o terminador curva para dentro (flag 1)
    expect(caminhoDaLua(0.1).d).toMatch(/0 0 1 50 0 Z$/);
    expect(caminhoDaLua(0.4).d).toMatch(/0 0 0 50 0 Z$/);
  });
});

describe("calcularCeu", () => {
  it("texto escuro de dia, claro à noite; véu nunca cinza", () => {
    expect(calcularCeu(12).textoEscuro).toBe(true);
    expect(calcularCeu(12).veu).toBe("rgba(255,255,255,0.88)");
    const noite = calcularCeu(21);
    expect(noite.textoEscuro).toBe(false);
    const [r, g, b] = noite.veu.match(/\d+/g)!.map(Number);
    expect(Math.max(r, g, b)).toBeLessThan(60);
  });

  it("sol só de dia e lua só de noite", () => {
    expect(calcularCeu(12).solOpacidade).toBe(1);
    expect(calcularCeu(12).luaOpacidade).toBe(0);
    expect(calcularCeu(23).solOpacidade).toBe(0);
    expect(calcularCeu(23).luaOpacidade).toBe(1);
  });

  it("ponto 'agora' na cor do sol de dia e claro à noite", () => {
    expect(calcularCeu(12).corDoAgora).toBe(calcularCeu(12).solNucleo);
    expect(calcularCeu(23).corDoAgora).toBe("#E2E8F0");
  });
});

describe("hhmm", () => {
  it("formata minutos", () => {
    expect(hhmm(7 * 60 + 5)).toBe("07:05");
    expect(hhmm(17 * 60 + 59.6)).toBe("18:00");
  });
});
