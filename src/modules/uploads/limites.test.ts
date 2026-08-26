import { describe, expect, it } from "vitest";
import { LIMITE_FINALIZACOES_UPLOAD } from "./limites";

describe("LIMITE_FINALIZACOES_UPLOAD", () => {
  it("acomoda um lote normal sem abrir uma janela maior que dez minutos", () => {
    expect(LIMITE_FINALIZACOES_UPLOAD).toEqual({ maximo: 120, janelaMs: 600_000 });
  });
});
