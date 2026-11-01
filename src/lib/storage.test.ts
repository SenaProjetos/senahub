import { describe, it, expect } from "vitest";

// O módulo captura STORAGE_BASE_PATH no load — precisa estar setado ANTES do import.
process.env.STORAGE_BASE_PATH =
  process.platform === "win32" ? "C:\\tmp\\senahub" : "/tmp/senahub";

const { resolverCaminho, slug, nomeArquivoLimpo, salvarArquivo, copiarArquivo, lerArquivo, removerArquivo } =
  await import("@/lib/storage");

describe("storage — copiarArquivo (stream, sem carregar o arquivo na memória)", () => {
  it("copia o conteúdo e devolve o mesmo hash e tamanho de quem gravou", async () => {
    const conteudo = Buffer.from(`copia-${Date.now()}`.repeat(1000));
    const origem = await salvarArquivo(`teste-copia/${Date.now()}-a.bin`, conteudo);
    const destinoRel = `teste-copia/${Date.now()}-b.bin`;
    try {
      const copia = await copiarArquivo(origem.caminho, destinoRel);
      expect(copia).toEqual({ caminho: destinoRel, hashSha256: origem.hashSha256, tamanho: origem.tamanho });
      expect((await lerArquivo(destinoRel)).equals(conteudo)).toBe(true);
    } finally {
      await removerArquivo(origem.caminho);
      await removerArquivo(destinoRel);
    }
  });

  it("origem inexistente lança e não deixa destino parcial", async () => {
    const destinoRel = `teste-copia/${Date.now()}-c.bin`;
    await expect(copiarArquivo("teste-copia/nao-existe.bin", destinoRel)).rejects.toThrow();
    await expect(lerArquivo(destinoRel)).rejects.toThrow();
  });

  it("recusa destino fora do base", async () => {
    await expect(copiarArquivo("teste-copia/x.bin", "../../fora.bin")).rejects.toThrow();
  });
});

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
