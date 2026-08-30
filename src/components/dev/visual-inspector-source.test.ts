import { describe, expect, it } from "vitest";
import {
  reactFiberForElement,
  sourceLocationFromReactFiber,
  sourceLocationFromVisualAttribute,
} from "./visual-inspector-source";

describe("sourceLocationFromVisualAttribute", () => {
  it("lê caminho Windows e posição", () => {
    expect(sourceLocationFromVisualAttribute("src/components/ui/button.tsx:57:7")).toEqual({
      fileName: "src/components/ui/button.tsx",
      lineNumber: 57,
      columnNumber: 7,
    });
  });

  it("rejeita valor que não representa uma posição", () => {
    expect(sourceLocationFromVisualAttribute("manual")).toBeNull();
  });
});

describe("sourceLocationFromReactFiber", () => {
  it("retorna a origem de depuração da própria Fiber", () => {
    function ProjectCard() {
      return null;
    }

    expect(
      sourceLocationFromReactFiber({
        type: ProjectCard,
        _debugSource: { fileName: "src/components/projetos/project-card.tsx", lineNumber: 18, columnNumber: 7 },
      }),
    ).toEqual({
      fileName: "src/components/projetos/project-card.tsx",
      lineNumber: 18,
      columnNumber: 7,
      componentName: "ProjectCard",
    });
  });

  it("sobe para o dono quando a Fiber do host não possui origem", () => {
    function Button() {
      return null;
    }

    const owner = {
      type: Button,
      _debugSource: { fileName: "src/components/ui/button.tsx", lineNumber: 57 },
    };

    expect(sourceLocationFromReactFiber({ type: "button", _debugOwner: owner })).toMatchObject({
      fileName: "src/components/ui/button.tsx",
      lineNumber: 57,
      componentName: "Button",
    });
  });

  it("aceita a fonte presente em props de desenvolvimento", () => {
    expect(
      sourceLocationFromReactFiber({
        type: "span",
        pendingProps: { __source: { fileName: "src/components/exemplo.tsx", lineNumber: 4, columnNumber: 12 } },
      }),
    ).toMatchObject({ fileName: "src/components/exemplo.tsx", lineNumber: 4, columnNumber: 12 });
  });

  it("não entra em loop em uma Fiber circular sem metadados", () => {
    const fiber: Record<string, unknown> = {};
    fiber.return = fiber;

    expect(sourceLocationFromReactFiber(fiber)).toBeNull();
  });
});

describe("reactFiberForElement", () => {
  it("encontra a Fiber associada ao elemento pelo marcador de desenvolvimento", () => {
    const fiber = { type: "div" };
    const element = { "__reactFiber$senahub": fiber } as unknown as Element;

    expect(reactFiberForElement(element)).toBe(fiber);
  });
});
