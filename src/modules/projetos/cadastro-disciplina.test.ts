import { describe, expect, it } from "vitest";
import { motivoCodigoTravado, normalizarPasta } from "./cadastro-disciplina";
import { editarCadastroDisciplinaSchema } from "./schemas";

describe("motivoCodigoTravado", () => {
  it("sem projeto usando: a pasta dos arquivos pode mudar", () => {
    expect(motivoCodigoTravado(0)).toBeNull();
  });

  it("em uso: trava com o motivo, no singular e no plural", () => {
    expect(motivoCodigoTravado(1)).toBe("Em uso em 1 projeto: mudar agora separaria os arquivos em duas pastas.");
    expect(motivoCodigoTravado(22)).toBe("Em uso em 22 projetos: mudar agora separaria os arquivos em duas pastas.");
  });
});

describe("normalizarPasta", () => {
  it("maiúscula, sem acento e só A-Z/0-9, até 6", () => {
    expect(normalizarPasta("ele")).toBe("ELE");
    expect(normalizarPasta("elé")).toBe("ELE");
    expect(normalizarPasta("A-1 b")).toBe("A1B");
    expect(normalizarPasta("abcdefghi")).toBe("ABCDEF");
    expect(normalizarPasta("  ")).toBe("");
  });
});

describe("editarCadastroDisciplinaSchema", () => {
  const base = { id: "d1", nome: "Elétrica" };

  it("numeração com decimal ou fora do limite: mensagem em português", () => {
    const dec = editarCadastroDisciplinaSchema.safeParse({ ...base, numeracao: 1.5 });
    expect(!dec.success && dec.error.issues[0].message).toBe("Use um número inteiro.");
    const alto = editarCadastroDisciplinaSchema.safeParse({ ...base, numeracaoFim: 1000000 });
    expect(!alto.success && alto.error.issues[0].message).toBe("Use um número até 999999.");
    const neg = editarCadastroDisciplinaSchema.safeParse({ ...base, numeracao: -1 });
    expect(!neg.success && neg.error.issues[0].message).toBe("Use um número a partir de 0.");
  });

  it("aceita faixa válida e vazia", () => {
    expect(editarCadastroDisciplinaSchema.safeParse({ ...base, numeracao: 4000, numeracaoFim: 4999 }).success).toBe(true);
    expect(editarCadastroDisciplinaSchema.safeParse({ ...base, numeracao: null }).success).toBe(true);
  });
});
