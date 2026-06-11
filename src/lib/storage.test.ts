import { describe, it, expect } from "vitest";

// O módulo captura STORAGE_BASE_PATH no load — precisa estar setado ANTES do import.
process.env.STORAGE_BASE_PATH =
  process.platform === "win32" ? "C:\\tmp\\senahub" : "/tmp/senahub";

const { resolverCaminho, slug, nomeArquivoLimpo } = await import("@/lib/storage");

describe("storage — guarda anti path-traversal", () => {
  it("resolve caminho relativo dentro do base", () => {
    const p = resolverCaminho("2026/cliente/projeto/disciplina/A/arq.pdf");
    expect(p).toContain("senahub");
    expect(p).toContain("arq.pdf");
  });

  it("bloqueia escape com ../", () => {
    expect(() => resolverCaminho("../../etc/passwd")).toThrow();
    expect(() => resolverCaminho("2026/../../../segredo")).toThrow();
  });

  it("slug remove acentos e caracteres perigosos", () => {
    expect(slug("Hidrossanitário")).toBe("Hidrossanitario");
    expect(slug("a/b\\c")).toBe("a_b_c");
    expect(slug("  ")).toBe("item");
  });

  it("nomeArquivoLimpo descarta o caminho original", () => {
    expect(nomeArquivoLimpo("C:\\Users\\x\\planta.dwg")).toBe("planta.dwg");
    expect(nomeArquivoLimpo("pasta/sub/memorial.pdf")).toBe("memorial.pdf");
  });
});
