import { promises as fsp } from "node:fs";
import { afterAll, describe, it, expect, vi } from "vitest";

// O módulo captura STORAGE_BASE_PATH no load — precisa estar setado ANTES do import.
process.env.STORAGE_BASE_PATH =
  process.platform === "win32" ? "C:\\tmp\\senahub" : "/tmp/senahub";

const {
  resolverCaminho,
  slug,
  nomeArquivoLimpo,
  salvarArquivo,
  copiarArquivo,
  lerArquivo,
  removerArquivo,
  arquivoParaStream,
  SUFIXO_GRAVACAO_PARCIAL,
} = await import("@/lib/storage");

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

describe("storage — arquivoParaStream (download sem carregar o arquivo na memória)", () => {
  async function lerTudo(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const partes: Buffer[] = [];
    const leitor = stream.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(Buffer.from(value));
    }
    return Buffer.concat(partes);
  }

  it("devolve o tamanho do disco e um stream com o conteúdo inteiro", async () => {
    const conteudo = Buffer.from(`stream-${Date.now()}`.repeat(5000));
    const rel = `teste-stream/${Date.now()}-a.bin`;
    await salvarArquivo(rel, conteudo);
    try {
      const arquivo = await arquivoParaStream(rel);
      expect(arquivo.tamanho).toBe(conteudo.length);
      expect((await lerTudo(arquivo.abrir())).equals(conteudo)).toBe(true);
    } finally {
      await removerArquivo(rel);
    }
  });

  it("arquivo que não existe lança antes de abrir o stream (a rota responde 410)", async () => {
    await expect(arquivoParaStream("teste-stream/nao-existe.bin")).rejects.toThrow();
  });

  it("pasta no lugar do arquivo lança", async () => {
    const rel = `teste-stream/${Date.now()}-pasta/x.bin`;
    await salvarArquivo(rel, Buffer.from("x"));
    try {
      await expect(arquivoParaStream(rel.replace(/\/x\.bin$/, ""))).rejects.toThrow();
    } finally {
      await removerArquivo(rel);
    }
  });

  it("caminho fora do base lança", async () => {
    await expect(arquivoParaStream("../../fora.bin")).rejects.toThrow();
  });
});

describe("storage — salvarArquivo (temporário + rename: o nome final nunca fica pela metade)", () => {
  const PASTA = "teste-salvar";
  const escreverDeVerdade = fsp.writeFile.bind(fsp);
  /** Disco cheio depois de gravar parte do conteúdo (a falha vem DEPOIS de abrir o arquivo). */
  const discoCheioNoMeio = async (alvo: unknown, dados: unknown) => {
    await escreverDeVerdade(alvo as string, (dados as Buffer).subarray(0, 10));
    throw Object.assign(new Error("ENOSPC simulado"), { code: "ENOSPC" });
  };
  const sobrasNaPasta = async () =>
    (await fsp.readdir(resolverCaminho(PASTA)).catch(() => [] as string[])).filter((n) =>
      n.endsWith(SUFIXO_GRAVACAO_PARCIAL),
    );

  afterAll(async () => {
    await fsp.rm(resolverCaminho(PASTA), { recursive: true, force: true });
  });

  it("grava e devolve hash e tamanho, sem deixar temporário", async () => {
    const rel = `${PASTA}/${Date.now()}-ok.bin`;
    const salvo = await salvarArquivo(rel, Buffer.from("conteudo"));
    expect(salvo).toMatchObject({ caminho: rel, tamanho: 8 });
    expect((await lerArquivo(rel)).toString()).toBe("conteudo");
    expect(await sobrasNaPasta()).toEqual([]);
  });

  it("arquivo novo que falha no meio: nem o nome final nem o temporário ficam no disco", async () => {
    const rel = `${PASTA}/${Date.now()}-novo.bin`;
    const espiao = vi.spyOn(fsp, "writeFile").mockImplementationOnce(discoCheioNoMeio);
    try {
      await expect(salvarArquivo(rel, Buffer.alloc(1000, 1))).rejects.toThrow("ENOSPC simulado");
      await expect(lerArquivo(rel)).rejects.toThrow();
      expect(await sobrasNaPasta()).toEqual([]);
    } finally {
      espiao.mockRestore();
    }
  });

  it("regravar um caminho que já existia e falhar no meio mantém o conteúdo anterior inteiro", async () => {
    const rel = `${PASTA}/${Date.now()}-existente.bin`;
    await salvarArquivo(rel, Buffer.from("conteudo-antigo"));
    const espiao = vi.spyOn(fsp, "writeFile").mockImplementationOnce(discoCheioNoMeio);
    try {
      await expect(salvarArquivo(rel, Buffer.alloc(1000, 2))).rejects.toThrow("ENOSPC simulado");
      expect((await lerArquivo(rel)).toString()).toBe("conteudo-antigo");
      expect(await sobrasNaPasta()).toEqual([]);
    } finally {
      espiao.mockRestore();
    }
  });

  it("caminho reservado vazio (reservarCaminhoLivre) fica vazio se a gravação falhar — quem reservou o apaga", async () => {
    const rel = `${PASTA}/${Date.now()}-reservado.bin`;
    await fsp.mkdir(resolverCaminho(PASTA), { recursive: true });
    await (await fsp.open(resolverCaminho(rel), "wx")).close();
    const espiao = vi.spyOn(fsp, "writeFile").mockImplementationOnce(discoCheioNoMeio);
    try {
      await expect(salvarArquivo(rel, Buffer.alloc(1000, 3))).rejects.toThrow("ENOSPC simulado");
      expect((await lerArquivo(rel)).length).toBe(0);
      expect(await sobrasNaPasta()).toEqual([]);
    } finally {
      espiao.mockRestore();
    }
  });

  it("destino segurado por outro programa um instante (EBUSY no rename): espera e grava", async () => {
    const rel = `${PASTA}/${Date.now()}-travado.bin`;
    await salvarArquivo(rel, Buffer.from("antigo"));
    const espiao = vi
      .spyOn(fsp, "rename")
      .mockRejectedValueOnce(Object.assign(new Error("EBUSY simulado"), { code: "EBUSY" }));
    try {
      await salvarArquivo(rel, Buffer.from("novo"));
      expect((await lerArquivo(rel)).toString()).toBe("novo");
      expect(espiao).toHaveBeenCalledTimes(2);
    } finally {
      espiao.mockRestore();
    }
  });

  it("destino travado de vez: desiste, apaga o temporário e mantém o conteúdo anterior", async () => {
    const rel = `${PASTA}/${Date.now()}-travado-de-vez.bin`;
    await salvarArquivo(rel, Buffer.from("antigo"));
    const espiao = vi
      .spyOn(fsp, "rename")
      .mockRejectedValue(Object.assign(new Error("EPERM simulado"), { code: "EPERM" }));
    try {
      await expect(salvarArquivo(rel, Buffer.from("novo"))).rejects.toThrow("EPERM simulado");
      expect(espiao).toHaveBeenCalledTimes(4);
    } finally {
      espiao.mockRestore();
    }
    expect((await lerArquivo(rel)).toString()).toBe("antigo");
    expect(await sobrasNaPasta()).toEqual([]);
  });

  it("duas gravações do mesmo caminho ao mesmo tempo terminam com um conteúdo inteiro, nunca misturado", async () => {
    const rel = `${PASTA}/${Date.now()}-corrida.bin`;
    const a = Buffer.alloc(200_000, 0x61);
    const b = Buffer.alloc(200_000, 0x62);
    await Promise.all([salvarArquivo(rel, a), salvarArquivo(rel, b)]);
    const final = await lerArquivo(rel);
    expect(final.equals(a) || final.equals(b)).toBe(true);
    expect(await sobrasNaPasta()).toEqual([]);
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
