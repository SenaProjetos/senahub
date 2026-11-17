import { describe, expect, it } from "vitest";
import { bloqueioDeDecisao } from "@/modules/rh/quem-decide";

const rh = { id: "rh1", superUsuario: false };
const admin = { id: "adm", superUsuario: true };

describe("bloqueioDeDecisao", () => {
  it("RH decide a de quem não é do RH", () => {
    expect(bloqueioDeDecisao({ id: "u2", ehRh: false }, rh)).toBeNull();
  });

  it("RH não decide a própria", () => {
    expect(bloqueioDeDecisao({ id: "rh1", ehRh: true }, rh)).toBe("propria");
  });

  it("RH não decide a de um colega do RH: só um administrador", () => {
    expect(bloqueioDeDecisao({ id: "rh2", ehRh: true }, rh)).toBe("de_rh");
  });

  it("o administrador decide qualquer uma, inclusive a própria", () => {
    expect(bloqueioDeDecisao({ id: "rh2", ehRh: true }, admin)).toBeNull();
    expect(bloqueioDeDecisao({ id: "u2", ehRh: false }, admin)).toBeNull();
    expect(bloqueioDeDecisao({ id: "adm", ehRh: true }, admin)).toBeNull();
  });
});
