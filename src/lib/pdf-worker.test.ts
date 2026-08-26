import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("worker público do pdf.js", () => {
  it("é idêntico ao worker da dependência instalada", () => {
    const publico = readFileSync(resolve("public/pdf.worker.min.mjs"));
    const instalado = readFileSync(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs"));

    expect(publico.equals(instalado)).toBe(true);
  });
});
