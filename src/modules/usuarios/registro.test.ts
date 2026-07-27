import { describe, it, expect } from "vitest";
import { formatarRegistro, CONSELHOS, UFS } from "./registro";

describe("formatarRegistro", () => {
  it("monta o rótulo completo", () => {
    expect(formatarRegistro({ conselho: "CREA", registroProfissional: "123456", registroUf: "SP" })).toBe(
      "CREA-SP 123456",
    );
  });

  it("omite a UF quando ausente", () => {
    expect(formatarRegistro({ conselho: "CAU", registroProfissional: "A99" })).toBe("CAU A99");
  });

  it("retorna null sem conselho ou sem número", () => {
    expect(formatarRegistro({ conselho: "CREA" })).toBeNull();
    expect(formatarRegistro({ registroProfissional: "123" })).toBeNull();
    expect(formatarRegistro({})).toBeNull();
    expect(formatarRegistro(null)).toBeNull();
  });

  it("ignora strings vazias e espaços", () => {
    expect(formatarRegistro({ conselho: "  ", registroProfissional: "123" })).toBeNull();
    expect(formatarRegistro({ conselho: "CREA", registroProfissional: "  " })).toBeNull();
    expect(formatarRegistro({ conselho: " CREA ", registroProfissional: " 123 ", registroUf: " sp " })).toBe(
      "CREA-SP 123",
    );
  });

  it("expõe os catálogos de conselho e UF", () => {
    expect(CONSELHOS).toContain("CREA");
    expect(CONSELHOS).toContain("CAU");
    expect(UFS).toHaveLength(27);
  });
});
