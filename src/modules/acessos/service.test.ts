import { describe, it, expect } from "vitest";
import {
  alvoCasaComViewer,
  permissoesNaCredencial,
  statusCredencial,
  diasAte,
  normalizarCompartilhamentos,
  type LinhaCompartilhamento,
  type ViewerCofre,
} from "./service";

const VIEWER: ViewerCofre = { id: "u1", perfilId: "p1", setor: "engenharia", superUsuario: false };

function linha(over: Partial<LinhaCompartilhamento>): LinhaCompartilhamento {
  return {
    tipoAlvo: "usuario",
    alvoId: "u1",
    podeVerCadastro: false,
    podeVerCredencial: false,
    podeEditar: false,
    podeGerenciarPermissoes: false,
    ...over,
  };
}

describe("alvoCasaComViewer", () => {
  it("casa por usuário, perfil e setor", () => {
    expect(alvoCasaComViewer({ tipoAlvo: "usuario", alvoId: "u1" }, VIEWER)).toBe(true);
    expect(alvoCasaComViewer({ tipoAlvo: "perfil", alvoId: "p1" }, VIEWER)).toBe(true);
    expect(alvoCasaComViewer({ tipoAlvo: "setor", alvoId: "engenharia" }, VIEWER)).toBe(true);
  });

  it("não casa com outro usuário, perfil ou setor", () => {
    expect(alvoCasaComViewer({ tipoAlvo: "usuario", alvoId: "u2" }, VIEWER)).toBe(false);
    expect(alvoCasaComViewer({ tipoAlvo: "perfil", alvoId: "p2" }, VIEWER)).toBe(false);
    expect(alvoCasaComViewer({ tipoAlvo: "setor", alvoId: "juridico" }, VIEWER)).toBe(false);
  });

  it("viewer sem perfil/setor não casa com esses alvos (não vira curinga)", () => {
    const sem: ViewerCofre = { ...VIEWER, perfilId: null, setor: null };
    expect(alvoCasaComViewer({ tipoAlvo: "perfil", alvoId: "p1" }, sem)).toBe(false);
    expect(alvoCasaComViewer({ tipoAlvo: "setor", alvoId: "engenharia" }, sem)).toBe(false);
  });

  it("tipoAlvo desconhecido nunca concede", () => {
    expect(alvoCasaComViewer({ tipoAlvo: "departamento", alvoId: "u1" }, VIEWER)).toBe(false);
    expect(alvoCasaComViewer({ tipoAlvo: "", alvoId: "u1" }, VIEWER)).toBe(false);
  });
});

describe("permissoesNaCredencial", () => {
  it("sem compartilhamento, nega tudo", () => {
    expect(permissoesNaCredencial(VIEWER, [])).toEqual({
      verCadastro: false,
      verCredencial: false,
      editar: false,
      gerenciarPermissoes: false,
    });
  });

  it("superUsuario recebe tudo, mesmo sem linha nenhuma", () => {
    const admin: ViewerCofre = { ...VIEWER, superUsuario: true };
    expect(permissoesNaCredencial(admin, [])).toEqual({
      verCadastro: true,
      verCredencial: true,
      editar: true,
      gerenciarPermissoes: true,
    });
  });

  it("§27: vê o cadastro sem ver a credencial", () => {
    const p = permissoesNaCredencial(VIEWER, [linha({ podeVerCadastro: true })]);
    expect(p.verCadastro).toBe(true);
    expect(p.verCredencial).toBe(false);
  });

  it("é aditivo: uma linha com false não revoga o que outra concede", () => {
    const p = permissoesNaCredencial(VIEWER, [
      linha({ tipoAlvo: "usuario", alvoId: "u1", podeVerCredencial: false }),
      linha({ tipoAlvo: "perfil", alvoId: "p1", podeVerCredencial: true }),
    ]);
    expect(p.verCredencial).toBe(true);
  });

  it("linha de outro alvo é ignorada por completo", () => {
    const p = permissoesNaCredencial(VIEWER, [
      linha({ tipoAlvo: "usuario", alvoId: "OUTRO", podeVerCadastro: true, podeVerCredencial: true }),
    ]);
    expect(p).toEqual({ verCadastro: false, verCredencial: false, editar: false, gerenciarPermissoes: false });
  });

  it("ver credencial implica ver cadastro (a senha mora dentro dele)", () => {
    const p = permissoesNaCredencial(VIEWER, [linha({ podeVerCredencial: true })]);
    expect(p.verCadastro).toBe(true);
  });

  it("responsável ganha cadastro e edição, mas NÃO a credencial", () => {
    const p = permissoesNaCredencial(VIEWER, [], { ehResponsavel: true });
    expect(p.verCadastro).toBe(true);
    expect(p.editar).toBe(true);
    expect(p.verCredencial).toBe(false);
  });

  it("responsável COM compartilhamento explícito revela", () => {
    const p = permissoesNaCredencial(VIEWER, [linha({ podeVerCredencial: true })], { ehResponsavel: true });
    expect(p.verCredencial).toBe(true);
  });
});

describe("statusCredencial", () => {
  const hoje = new Date("2026-08-30T12:00:00Z");

  it("bloqueado e inativo são declarações humanas e vencem o cálculo", () => {
    expect(statusCredencial({ status: "bloqueado", vencimentoEm: new Date("2030-01-01") }, hoje)).toBe("bloqueado");
    expect(statusCredencial({ status: "inativo", vencimentoEm: new Date("2030-01-01") }, hoje)).toBe("inativo");
  });

  it("vencida vira bloqueado", () => {
    expect(statusCredencial({ status: "ativo", vencimentoEm: new Date("2026-08-01") }, hoje)).toBe("bloqueado");
  });

  it("vence dentro de 90 dias → expirando", () => {
    expect(statusCredencial({ status: "ativo", vencimentoEm: new Date("2026-09-21") }, hoje)).toBe("expirando");
  });

  it("vence depois de 90 dias → ativo", () => {
    expect(statusCredencial({ status: "ativo", vencimentoEm: new Date("2027-06-01") }, hoje)).toBe("ativo");
  });

  it("sem revisão há mais de 180 dias → atencao", () => {
    expect(statusCredencial({ status: "ativo", ultimaRevisaoEm: new Date("2026-01-01") }, hoje)).toBe("atencao");
  });

  it("revisada recentemente e sem vencimento → ativo", () => {
    expect(statusCredencial({ status: "ativo", ultimaRevisaoEm: new Date("2026-08-01") }, hoje)).toBe("ativo");
  });

  it("nunca revisada e sem vencimento → ativo (ausência não é alerta)", () => {
    expect(statusCredencial({ status: "ativo" }, hoje)).toBe("ativo");
  });
});

describe("diasAte", () => {
  const hoje = new Date("2026-08-30T23:00:00Z");

  it("conta dias inteiros, ignorando hora", () => {
    expect(diasAte(new Date("2026-08-30T01:00:00Z"), hoje)).toBe(0);
    expect(diasAte(new Date("2026-09-01T01:00:00Z"), hoje)).toBe(2);
    expect(diasAte(new Date("2026-08-28T23:00:00Z"), hoje)).toBe(-2);
  });

  it("sem data devolve null", () => {
    expect(diasAte(null, hoje)).toBeNull();
    expect(diasAte(undefined, hoje)).toBeNull();
  });
});

describe("normalizarCompartilhamentos", () => {
  const base = {
    podeVerCadastro: false,
    podeVerCredencial: false,
    podeEditar: false,
    podeGerenciarPermissoes: false,
  };

  it("funde linhas do mesmo alvo somando as concessões", () => {
    const r = normalizarCompartilhamentos([
      { ...base, tipoAlvo: "usuario", alvoId: "u1", podeVerCadastro: true },
      { ...base, tipoAlvo: "usuario", alvoId: "u1", podeVerCredencial: true },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].podeVerCadastro).toBe(true);
    expect(r[0].podeVerCredencial).toBe(true);
  });

  it("mantém alvos distintos separados", () => {
    const r = normalizarCompartilhamentos([
      { ...base, tipoAlvo: "usuario", alvoId: "u1", podeVerCadastro: true },
      { ...base, tipoAlvo: "perfil", alvoId: "u1", podeVerCadastro: true },
      { ...base, tipoAlvo: "usuario", alvoId: "u2", podeVerCadastro: true },
    ]);
    expect(r).toHaveLength(3);
  });

  it("descarta linha que não concede nada", () => {
    const r = normalizarCompartilhamentos([
      { ...base, tipoAlvo: "usuario", alvoId: "u1" },
      { ...base, tipoAlvo: "setor", alvoId: "engenharia", podeEditar: true },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].tipoAlvo).toBe("setor");
  });

  it("lista vazia continua vazia", () => {
    expect(normalizarCompartilhamentos([])).toEqual([]);
  });
});
