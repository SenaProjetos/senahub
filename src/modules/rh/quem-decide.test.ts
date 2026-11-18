import { describe, expect, it } from "vitest";
import {
  MOTIVO_ATESTADO_SO_ADMINISTRADOR,
  MOTIVO_ATESTADO_SO_RH,
  bloqueioDeDecisao,
  motivoParaNaoVerAtestado,
  podeVerAtestado,
} from "@/modules/rh/quem-decide";

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

describe("podeVerAtestado", () => {
  const rhGere = { ...rh, gereRh: true };
  const adminGere = { ...admin, gereRh: true };

  it("o dono abre o próprio, mesmo sem ser do RH", () => {
    expect(podeVerAtestado({ id: "u2", ehRh: false }, { id: "u2", superUsuario: false, gereRh: false })).toBe(true);
    expect(podeVerAtestado({ id: "rh1", ehRh: true }, rhGere)).toBe(true);
  });

  it("o RH abre o de quem não é do RH", () => {
    expect(podeVerAtestado({ id: "u2", ehRh: false }, rhGere)).toBe(true);
  });

  it("o RH não abre o de um colega do RH: só um administrador", () => {
    expect(podeVerAtestado({ id: "rh2", ehRh: true }, rhGere)).toBe(false);
    expect(podeVerAtestado({ id: "rh2", ehRh: true }, adminGere)).toBe(true);
  });

  it("sem a Gestão de RH, só o próprio", () => {
    expect(podeVerAtestado({ id: "u2", ehRh: false }, { id: "u3", superUsuario: false, gereRh: false })).toBe(false);
  });

  it("a frase diz quem abre: o RH para quem não tem a Gestão de RH, o administrador para o colega do RH", () => {
    const semRh = { id: "u3", superUsuario: false, gereRh: false };
    expect(motivoParaNaoVerAtestado({ id: "u2", ehRh: false }, semRh)).toBe(MOTIVO_ATESTADO_SO_RH);
    expect(motivoParaNaoVerAtestado({ id: "rh2", ehRh: true }, semRh)).toBe(MOTIVO_ATESTADO_SO_RH);
    expect(motivoParaNaoVerAtestado({ id: "rh2", ehRh: true }, rhGere)).toBe(MOTIVO_ATESTADO_SO_ADMINISTRADOR);
    expect(motivoParaNaoVerAtestado({ id: "u2", ehRh: false }, rhGere)).toBeNull();
  });
});
