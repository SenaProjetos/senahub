import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { transformVisualInspectorSource } = require("../../../dev/visual-inspector-transform.cjs") as {
  transformVisualInspectorSource: (source: string, resourcePath: string, projectRoot: string) => string;
};

describe("transformVisualInspectorSource", () => {
  it("marca elementos nativos com a origem do JSX", () => {
    const output = transformVisualInspectorSource(
      'export function Example() { return <section><button>Salvar</button></section>; }',
      "C:/repo/src/components/example.tsx",
      "C:/repo",
    );

    expect(output).toContain('data-visual-source="src/components/example.tsx:1:36"');
    expect(output).toContain('data-visual-source="src/components/example.tsx:1:45"');
  });

  it("não injeta atributos em componentes React", () => {
    const output = transformVisualInspectorSource(
      'export function Example() { return <Card><div /></Card>; }',
      "C:/repo/src/components/example.tsx",
      "C:/repo",
    );

    expect(output).not.toMatch(/<Card[^>]*data-visual-source/);
    expect(output).toContain('data-visual-source="src/components/example.tsx:1:42"');
  });

  it("preserva uma marcação existente", () => {
    const output = transformVisualInspectorSource(
      'export function Example() { return <div data-visual-source="manual" />; }',
      "C:/repo/src/components/example.tsx",
      "C:/repo",
    );

    expect(output).toContain('data-visual-source="manual"');
    expect(output.match(/data-visual-source/g)).toHaveLength(1);
  });
});
