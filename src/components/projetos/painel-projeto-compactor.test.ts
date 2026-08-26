import { cloneLayout, getAllCollisions, moveElement, type Layout } from "react-grid-layout/core";
import { describe, expect, it } from "vitest";
import { projectPanelCompactor } from "./painel-projeto-compactor";

function layoutBase(): Layout {
  return [
    { i: "a", x: 0, y: 0, w: 6, h: 5 },
    { i: "b", x: 0, y: 5, w: 6, h: 5 },
    { i: "c", x: 0, y: 10, w: 6, h: 5 },
  ];
}

function mover(layout: Layout, id: string, x: number, y: number) {
  const item = layout.find((atual) => atual.i === id);
  if (!item) throw new Error("Card inexistente no teste.");
  return moveElement(
    layout,
    item,
    x,
    y,
    true,
    projectPanelCompactor.preventCollision === true,
    projectPanelCompactor.type,
    24,
    projectPanelCompactor.allowOverlap,
  );
}

describe("compactador do painel de projeto", () => {
  it("mantém as posições livres e bloqueia soltura sobre outro card", () => {
    const layout = cloneLayout(layoutBase());
    const resultado = mover(layout, "c", 0, 0);

    expect(projectPanelCompactor).toMatchObject({ type: null, allowOverlap: false, preventCollision: true });
    expect(resultado.find((item) => item.i === "c")).toMatchObject({ x: 0, y: 10 });
    expect(
      resultado.flatMap((item) =>
        getAllCollisions(resultado, item).filter((outro) => outro.i > item.i),
      ),
    ).toHaveLength(0);
  });

  it("permite mover o card para uma área desocupada", () => {
    const layout = cloneLayout(layoutBase());
    const resultado = mover(layout, "b", 6, 5);

    expect(resultado.find((item) => item.i === "b")).toMatchObject({ x: 6, y: 5 });
  });
});
