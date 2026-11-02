import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { respostaDeErroDeExportacao, slugCalculo } from "./export-util";

describe("respostaDeErroDeExportacao", () => {
  it("entrada que o motor recusa → 422 com o motivo", async () => {
    const r = z.object({ x: z.number({ message: "Informe x." }) }).safeParse({});
    const resposta = respostaDeErroDeExportacao(r.error);
    expect(resposta.status).toBe(422);
    expect(await resposta.text()).toContain("Informe x.");
  });

  it("sessão/permissão (redirect e notFound do Next) → 401", () => {
    const e = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sem-permissao;307;" });
    expect(respostaDeErroDeExportacao(e).status).toBe(401);
  });

  it("qualquer outra falha → 500 com mensagem em português, sem vazar detalhe", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const resposta = respostaDeErroDeExportacao(new Error("connection refused 10.0.0.5"));
    expect(resposta.status).toBe(500);
    expect(await resposta.text()).not.toContain("10.0.0.5");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("slugCalculo", () => {
  it("tira acento e símbolos", () => {
    expect(slugCalculo("Memória — Casa 1")).toBe("memoria-casa-1");
  });
});
