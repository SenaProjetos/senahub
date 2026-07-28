import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "@/lib/roles";
import { aplicarSocio, derivarEixos } from "./mapa";

describe("derivarEixos", () => {
  it("é total sobre Role — todo perfil tem mapa", () => {
    for (const role of ROLES) {
      expect(() => derivarEixos(role)).not.toThrow();
      expect(derivarEixos(role)).toBeTruthy();
    }
  });

  it("só `cliente` é externo; todo o resto é interno", () => {
    const externos = ROLES.filter((r) => derivarEixos(r).tipo === "externo");
    expect(externos).toEqual(["cliente"]);
  });

  it("quem cria vínculo tem setor E contratação; quem não cria não tem nenhum dos dois", () => {
    for (const role of ROLES) {
      const e = derivarEixos(role);
      if (e.criaVinculo) {
        expect(e.setor, `setor de ${role}`).not.toBeNull();
        expect(e.contratacao, `contratação de ${role}`).not.toBeNull();
      } else {
        expect(e.setor, `setor de ${role}`).toBeNull();
        expect(e.contratacao, `contratação de ${role}`).toBeNull();
      }
    }
  });

  it("mapeia os vínculos operacionais para Engenharia (default do dono)", () => {
    for (const role of ["clt", "estagiario", "projetista_pj", "freelancer"] as Role[]) {
      expect(derivarEixos(role).setor).toBe("engenharia");
      expect(derivarEixos(role).revisar).toContain("setor_sem_origem");
    }
  });

  it("coordenador (enum supervisor) é Engenharia + CLT", () => {
    expect(derivarEixos("supervisor")).toMatchObject({
      tipo: "interno",
      setor: "engenharia",
      contratacao: "clt",
      criaVinculo: true,
    });
  });

  it("administrativo e ti ficam no próprio setor", () => {
    expect(derivarEixos("administrativo").setor).toBe("administrativo");
    expect(derivarEixos("ti").setor).toBe("ti");
  });

  it("nenhuma contratação derivada é `pro_labore` — pró-labore vem do Socio, não do perfil", () => {
    for (const role of ROLES) {
      expect(derivarEixos(role).contratacao).not.toBe("pro_labore");
    }
  });

  it("freelancer migra como `pj` e fica marcado para reclassificação", () => {
    const e = derivarEixos("freelancer");
    expect(e.contratacao).toBe("pj");
    expect(e.revisar).toContain("pj_ou_autonomo_rpa");
  });

  it("admin não ganha vínculo automático", () => {
    const e = derivarEixos("admin");
    expect(e.criaVinculo).toBe(false);
    expect(e.tipo).toBe("interno");
    expect(e.revisar).toContain("sem_vinculo_definir_a_mao");
  });

  it("não vaza estado entre chamadas (revisar é cópia)", () => {
    const a = derivarEixos("clt");
    a.revisar.push("socio_ativo");
    expect(derivarEixos("clt").revisar).not.toContain("socio_ativo");
  });
});

describe("aplicarSocio", () => {
  it("sócio ativo com vínculo passa a pró-labore", () => {
    const e = aplicarSocio(derivarEixos("supervisor"), true);
    expect(e.contratacao).toBe("pro_labore");
    expect(e.revisar).toContain("socio_ativo");
  });

  it("sócio ativo SEM vínculo (admin) não inventa contratação", () => {
    const e = aplicarSocio(derivarEixos("admin"), true);
    expect(e.criaVinculo).toBe(false);
    expect(e.contratacao).toBeNull();
  });

  it("não-sócio passa intacto", () => {
    const base = derivarEixos("clt");
    expect(aplicarSocio(base, false)).toEqual(base);
  });

  it("não altera o setor — sócio que projeta continua em Engenharia e não some dos Recursos", () => {
    expect(aplicarSocio(derivarEixos("clt"), true).setor).toBe("engenharia");
  });
});
