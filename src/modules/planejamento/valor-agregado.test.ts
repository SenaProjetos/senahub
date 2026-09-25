import { describe, expect, it } from "vitest";
import { calcularRegua, faixaDoIndice, fracaoPlanejada, type LinhaBaseEvm } from "./valor-agregado";

// Calendário de teste: todo dia é útil — a fração fica fácil de conferir de cabeça.
const diasCorridos = (a: string, b: string) =>
  b < a ? 0 : Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

const linha = (extra: Partial<LinhaBaseEvm> = {}): LinhaBaseEvm => ({
  tarefaId: "a",
  inicio: "2026-10-01",
  fim: "2026-10-10",
  horas: 100,
  custo: 10000,
  resumo: false,
  ...extra,
});

describe("fracaoPlanejada", () => {
  it("antes do início 0, do término em diante 1, no meio pelos dias decorridos", () => {
    expect(fracaoPlanejada("2026-10-01", "2026-10-10", "2026-09-30", diasCorridos)).toBe(0);
    expect(fracaoPlanejada("2026-10-01", "2026-10-10", "2026-10-10", diasCorridos)).toBe(1);
    expect(fracaoPlanejada("2026-10-01", "2026-10-10", "2026-10-05", diasCorridos)).toBe(0.5);
  });
  it("marco: 0 antes, 1 no dia", () => {
    expect(fracaoPlanejada("2026-10-05", "2026-10-05", "2026-10-04", diasCorridos)).toBe(0);
    expect(fracaoPlanejada("2026-10-05", "2026-10-05", "2026-10-05", diasCorridos)).toBe(1);
  });
});

describe("calcularRegua", () => {
  const base = (over: Partial<Parameters<typeof calcularRegua>[0]> = {}) =>
    calcularRegua({
      regua: "horas",
      linhas: [linha()],
      progresso: new Map([["a", 40]]),
      dataStatus: "2026-10-05",
      diasUteis: diasCorridos,
      realizado: 50,
      ...over,
    });

  it("VP pela barra de base, VA pelo % informado, CR pelo apontado — e os índices", () => {
    const r = base();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.indices).toMatchObject({ ont: 100, vp: 50, va: 40, cr: 50, vpr: -10, vc: -10, idp: 0.8, idc: 0.8 });
    expect(r.indices.ent).toBe(125); // 100 ÷ 0,8
    expect(r.indices.vnt).toBe(-25);
    expect(r.indices.planejadoPct).toBe(50);
    expect(r.indices.realizadoPct).toBe(40);
  });

  it("agrupamento da baseline fica fora — senão o trabalho contaria duas vezes", () => {
    const r = base({ linhas: [linha(), linha({ tarefaId: "pai", resumo: true, horas: 100 })] });
    expect(r.ok && r.indices.ont).toBe(100);
  });

  it("orçamento desconhecido NUNCA vira zero: a régua fica sem número, com o motivo", () => {
    const r = base({ regua: "custo", linhas: [linha(), linha({ tarefaId: "b", custo: null })] });
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/1 atividade\(s\) da linha de base sem custo/) });
  });

  it("realizado desconhecido: VP/VA/IDP saem, CR/IDC/ENT não", () => {
    const r = base({ realizado: null, motivoRealizado: "Fulano apontou sem custo/hora." });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.indices).toMatchObject({ cr: null, vc: null, idc: null, ent: null, vnt: null, idp: 0.8 });
    expect(r.motivoRealizado).toMatch(/Fulano/);
  });

  it("sem apontamento: IDC indefinido (não infinito)", () => {
    const r = base({ realizado: 0 });
    expect(r.ok && r.indices.idc).toBeNull();
  });

  it("linha excluída depois da baseline conta como não feita", () => {
    const r = base({ linhas: [linha(), linha({ tarefaId: null })], realizado: 0 });
    expect(r.ok && r.indices.va).toBe(40);
    expect(r.ok && r.indices.ont).toBe(200);
  });

  it("antes de tudo começar: VP 0 e IDP indefinido", () => {
    const r = base({ dataStatus: "2026-09-01", progresso: new Map() });
    expect(r.ok && r.indices.vp).toBe(0);
    expect(r.ok && r.indices.idp).toBeNull();
  });
});

describe("faixaDoIndice", () => {
  it("≥1 bom, 0,9–1 atenção, <0,9 crítico, nulo sem dado", () => {
    expect(faixaDoIndice(1.05)).toBe("bom");
    expect(faixaDoIndice(0.95)).toBe("atencao");
    expect(faixaDoIndice(0.5)).toBe("critico");
    expect(faixaDoIndice(null)).toBe("sem_dado");
  });
});
