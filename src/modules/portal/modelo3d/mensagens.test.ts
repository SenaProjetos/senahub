import { describe, expect, it } from "vitest";
import { MSG_ABRIR_FALHOU, MSG_ROTA_ARQUIVO_SUMIU, MSG_ROTA_SEM_SESSAO, mensagemDaFalhaAoAbrir } from "./mensagens";

describe("mensagemDaFalhaAoAbrir", () => {
  it("frase da rota do portal passa (já é escrita para o cliente)", () => {
    expect(mensagemDaFalhaAoAbrir(new Error(MSG_ROTA_SEM_SESSAO))).toBe(MSG_ROTA_SEM_SESSAO);
    expect(mensagemDaFalhaAoAbrir(new Error(MSG_ROTA_ARQUIVO_SUMIU))).toBe(MSG_ROTA_ARQUIVO_SUMIU);
  });

  it("erro técnico, em inglês ou sem mensagem vira a frase fixa", () => {
    expect(mensagemDaFalhaAoAbrir(new TypeError("Failed to fetch"))).toBe(MSG_ABRIR_FALHOU);
    expect(mensagemDaFalhaAoAbrir(new Error("Falha ao baixar o modelo (502)."))).toBe(MSG_ABRIR_FALHOU);
    expect(mensagemDaFalhaAoAbrir(new Error(""))).toBe(MSG_ABRIR_FALHOU);
    expect(mensagemDaFalhaAoAbrir("texto solto")).toBe(MSG_ABRIR_FALHOU);
    expect(mensagemDaFalhaAoAbrir(null)).toBe(MSG_ABRIR_FALHOU);
  });
});
