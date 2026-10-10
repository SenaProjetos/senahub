import { describe, expect, it } from "vitest";
import {
  comandoDeHistorico,
  desfazer,
  historicoVazio,
  JANELA_DIGITACAO_MS,
  LIMITE_PASSOS,
  refazer,
  registrarAntes,
  type EstadoRealinhamento,
} from "@/modules/coordenacao/historico-realinhamento";

const e = (x: number, graus = 0): EstadoRealinhamento => ({ vetor: [x, 0, 0], graus });

describe("desfazer/refazer do realinhamento", () => {
  it("um arraste sem querer volta com um Ctrl+Z", () => {
    let h = historicoVazio();
    h = registrarAntes(h, e(0), "arraste", 0);
    const r = desfazer(h, e(37))!;
    expect(r.estado).toEqual(e(0));
    expect(desfazer(r.historico, r.estado)).toBeNull();
  });

  it("refaz o que foi desfeito, e uma mudança nova apaga o refazer", () => {
    let h = registrarAntes(historicoVazio(), e(0), "arraste", 0);
    const d = desfazer(h, e(5))!;
    const r = refazer(d.historico, d.estado)!;
    expect(r.estado).toEqual(e(5));
    h = registrarAntes(d.historico, e(0), "pontos", 10);
    expect(refazer(h, e(9))).toBeNull();
  });

  it("digitação seguida no mesmo campo é um passo só", () => {
    let h = historicoVazio();
    h = registrarAntes(h, e(0), "campo-vetor", 0);
    h = registrarAntes(h, e(1), "campo-vetor", 200);
    h = registrarAntes(h, e(12), "campo-vetor", 400);
    expect(h.desfazer).toEqual([e(0)]);
    // Depois da pausa, nova edição vira outro passo.
    h = registrarAntes(h, e(12.5), "campo-vetor", 400 + JANELA_DIGITACAO_MS + 1);
    expect(h.desfazer).toEqual([e(0), e(12.5)]);
  });

  it("toques seguidos de teclado são um passo só", () => {
    let h = historicoVazio();
    h = registrarAntes(h, e(0), "teclado", 0);
    h = registrarAntes(h, e(0.1), "teclado", 150);
    h = registrarAntes(h, e(0.2), "teclado", 300);
    expect(h.desfazer).toEqual([e(0)]);
  });

  it("campos diferentes e arrastes não se juntam", () => {
    let h = historicoVazio();
    h = registrarAntes(h, e(0), "campo-vetor", 0);
    h = registrarAntes(h, e(3), "campo-giro", 100);
    h = registrarAntes(h, e(3, 15), "arraste", 150);
    h = registrarAntes(h, e(8, 15), "arraste", 160);
    expect(h.desfazer).toEqual([e(0), e(3), e(3, 15), e(8, 15)]);
  });

  it("estado repetido não ocupa passo; a pilha tem limite", () => {
    let h = registrarAntes(historicoVazio(), e(0), "arraste", 0);
    h = registrarAntes(h, e(0), "arraste", 10);
    expect(h.desfazer).toHaveLength(1);
    for (let i = 1; i <= LIMITE_PASSOS + 20; i++) h = registrarAntes(h, e(i), "arraste", i * 10);
    expect(h.desfazer).toHaveLength(LIMITE_PASSOS);
    expect(h.desfazer.at(-1)).toEqual(e(LIMITE_PASSOS + 20));
  });

  it("teclas: Ctrl+Z desfaz; Ctrl+Shift+Z e Ctrl+Y refazem; sem Ctrl nada", () => {
    const k = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
      comandoDeHistorico({ key, ctrlKey: true, metaKey: false, shiftKey: false, ...extra });
    expect(k("z")).toBe("desfazer");
    expect(k("Z", { shiftKey: true })).toBe("refazer");
    expect(k("y")).toBe("refazer");
    expect(k("z", { ctrlKey: false, metaKey: true })).toBe("desfazer");
    expect(k("z", { ctrlKey: false })).toBeNull();
  });
});
