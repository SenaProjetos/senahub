import { describe, expect, it } from "vitest";
import { direcoesDeTela, passoDoTeclado } from "@/modules/coordenacao/teclado-realinhamento";

const tecla = (key: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean }> = {}) => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

const perto = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe("direcoesDeTela", () => {
  it("câmera olhando para +Y (frontal): direita = +X", () => {
    const d = direcoesDeTela([0, 1, 0], [0, 0, 1]);
    perto(d.afastar, [0, 1]);
    perto(d.direita, [1, 0]);
  });
  it("vista de cima: usa o 'cima' da câmera para saber o que é longe", () => {
    const d = direcoesDeTela([0, 0, -1], [0, 1, 0]);
    perto(d.afastar, [0, 1]);
    perto(d.direita, [1, 0]);
  });
  it("vista de cima com ruído na frente não gira as setas", () => {
    // Frente quase vertical, com um resto horizontal torto (ruído da câmera).
    const d = direcoesDeTela([0.0005, 0.001, -1], [0, 1, 0.001]);
    perto(d.afastar, [0, 1]);
    perto(d.direita, [1, 0]);
  });
  it("câmera olhando para −X: direita = +Y", () => {
    const d = direcoesDeTela([-1, 0, -0.5], [0, 0, 1]);
    perto(d.direita, [0, 1]);
  });
});

describe("passoDoTeclado", () => {
  const frontal = direcoesDeTela([0, 1, 0], [0, 0, 1]);

  it("setas andam 10 cm em planta, relativas à tela", () => {
    perto(passoDoTeclado(tecla("ArrowRight"), frontal)!.delta, [0.1, 0, 0]);
    perto(passoDoTeclado(tecla("ArrowUp"), frontal)!.delta, [0, 0.1, 0]);
    perto(passoDoTeclado(tecla("ArrowLeft"), frontal)!.delta, [-0.1, 0, 0]);
  });
  it("Shift = 1 m, Alt = 1 cm; PageUp/PageDown sobem e descem", () => {
    perto(passoDoTeclado(tecla("ArrowDown", { shiftKey: true }), frontal)!.delta, [0, -1, 0]);
    perto(passoDoTeclado(tecla("PageUp", { altKey: true }), frontal)!.delta, [0, 0, 0.01]);
    perto(passoDoTeclado(tecla("PageDown"), frontal)!.delta, [0, 0, -0.1]);
  });
  it("Q gira anti-horário, E horário; Shift = 10°", () => {
    expect(passoDoTeclado(tecla("q"), frontal)!.graus).toBe(1);
    expect(passoDoTeclado(tecla("E", { shiftKey: true }), frontal)!.graus).toBe(-10);
  });
  it("com Ctrl ou outra tecla, nada (Ctrl+Z é do desfazer)", () => {
    expect(passoDoTeclado(tecla("ArrowRight", { ctrlKey: true }), frontal)).toBeNull();
    expect(passoDoTeclado(tecla("x"), frontal)).toBeNull();
  });
});
