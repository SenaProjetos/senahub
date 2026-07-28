import { describe, it, expect } from "vitest";
import { ROLES } from "@/lib/roles";
import { CHAVE_POR_ROLE } from "./perfil-semente";

describe("CHAVE_POR_ROLE", () => {
  it("todo role exceto admin tem uma chave de perfil semente", () => {
    for (const role of ROLES) {
      if (role === "admin") {
        expect(CHAVE_POR_ROLE[role]).toBeUndefined();
      } else {
        expect(CHAVE_POR_ROLE[role], `chave de ${role}`).toBeTruthy();
      }
    }
  });

  it("chaves são únicas — dois roles nunca colapsam no mesmo perfil semente", () => {
    const chaves = Object.values(CHAVE_POR_ROLE);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("clt e projetista_pj têm chaves DISTINTAS — não consolida por função nesta onda", () => {
    // Matrizes reais diferem entre os dois hoje (ex.: só clt tem arquivos:ver_todas_disciplinas).
    // Consolidar cedo demais quebraria o espelho fiel que a Onda B promete.
    expect(CHAVE_POR_ROLE.clt).not.toBe(CHAVE_POR_ROLE.projetista_pj);
  });
});
