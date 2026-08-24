import { describe, expect, it } from "vitest";
import { criarProspeccaoRapidaSchema } from "./schemas";

const entradaBase = {
  urlAlvo: "contato" as const,
  empresa: { nome: "Construtora Exemplo" },
  contato: { nome: "Ana" },
  canalId: "canal-indicacao",
  abordagem: { tipo: "NOTA" as const, nota: "Demanda recebida por indicação." },
};

describe("schema da entrada comercial", () => {
  it("mantém acompanhamento como destino padrão para chamadas antigas", () => {
    const parsed = criarProspeccaoRapidaSchema.parse(entradaBase);
    expect(parsed.destino).toBe("ACOMPANHAR");
  });

  it("exige o nome da demanda ao abrir uma negociação imediatamente", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      destino: "ABRIR_NEGOCIACAO",
      tituloDemanda: "   ",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "tituloDemanda")).toBe(true);
    }
  });

  it("aceita uma nova demanda que abre negociação", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      criarNovaDemanda: true,
      destino: "ABRIR_NEGOCIACAO",
      tituloDemanda: "Projeto estrutural do Edifício Aurora",
    });
    expect(parsed.success).toBe(true);
  });

  it("usa o nome de uma demanda existente ao abri-la como negociação", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      leadExistenteId: "lead-existente",
      destino: "ABRIR_NEGOCIACAO",
    });
    expect(parsed.success).toBe(true);
  });

  it("não permite escolher uma demanda existente e criar outra ao mesmo tempo", () => {
    const parsed = criarProspeccaoRapidaSchema.safeParse({
      ...entradaBase,
      leadExistenteId: "lead-existente",
      criarNovaDemanda: true,
    });
    expect(parsed.success).toBe(false);
  });
});
