import { describe, expect, it } from "vitest";
import { renomearVistaSchema } from "@/modules/coordenacao/schemas";

describe("renomearVistaSchema", () => {
  it("normaliza espaços antes de enviar a action", () => {
    expect(renomearVistaSchema.parse({ id: "vista-1", nome: "  Compatibilização final  " })).toEqual({
      id: "vista-1",
      nome: "Compatibilização final",
    });
  });

  it("rejeita nome vazio e acima do limite", () => {
    expect(renomearVistaSchema.safeParse({ id: "vista-1", nome: "   " }).success).toBe(false);
    expect(renomearVistaSchema.safeParse({ id: "vista-1", nome: "x".repeat(121) }).success).toBe(false);
  });
});
