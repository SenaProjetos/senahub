import { describe, expect, it } from "vitest";
import { desfazerDispensaSchema, dispensarSchema, MOTIVO_MINIMO_DISPENSA } from "./pendencias-schemas";

const base = { alvoId: "r1", tipo: "publicada_com_lixeira" as const, chave: "lix:1:arquivado" };

describe("dispensarSchema", () => {
  it("aceita motivo com o mínimo de caracteres e apara os espaços", () => {
    const r = dispensarSchema.safeParse({ ...base, motivo: "  Limpeza de arquivos antigos  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motivo).toBe("Limpeza de arquivos antigos");
  });

  it("recusa motivo só com espaços ou curto, com a mensagem de campo", () => {
    for (const motivo of ["", "          ", "curto"]) {
      const r = dispensarSchema.safeParse({ ...base, motivo });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe(`Explique o motivo (pelo menos ${MOTIVO_MINIMO_DISPENSA} caracteres).`);
    }
  });

  it("recusa motivo acima de 500 caracteres", () => {
    expect(dispensarSchema.safeParse({ ...base, motivo: "x".repeat(501) }).success).toBe(false);
  });

  it("recusa tipo fora dos dispensáveis (I5 não tem dispensa)", () => {
    expect(dispensarSchema.safeParse({ ...base, tipo: "controle_fora_de_publicada", motivo: "Motivo válido aqui" }).success).toBe(false);
  });

  it("exige alvo e assinatura", () => {
    expect(dispensarSchema.safeParse({ ...base, alvoId: "", motivo: "Motivo válido aqui" }).success).toBe(false);
    expect(dispensarSchema.safeParse({ ...base, chave: "", motivo: "Motivo válido aqui" }).success).toBe(false);
  });
});

describe("desfazerDispensaSchema", () => {
  it("só alvo e tipo", () => {
    expect(desfazerDispensaSchema.safeParse({ alvoId: "r1", tipo: "analise_parada" }).success).toBe(true);
    expect(desfazerDispensaSchema.safeParse({ alvoId: "r1", tipo: "outro" }).success).toBe(false);
  });
});
