import { describe, expect, it } from "vitest";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { resumirAcesso, type EntradaResumo } from "./resumo-acesso";

const BASE: EntradaResumo = {
  role: "clt",
  ativo: true,
  temPerfil: true,
  perfilNome: "Coordenador",
  perfilEscopoGlobal: false,
  superUsuario: false,
  ehSocio: false,
};

function linha(e: Partial<EntradaResumo>, chave: string) {
  const r = resumirAcesso({ ...BASE, ...e }).find((l) => l.chave === chave);
  if (!r) throw new Error(`linha "${chave}" ausente`);
  return r;
}

describe("resumirAcesso", () => {
  it("avisa que sem Perfil de acesso nada é liberado", () => {
    const l = linha({ temPerfil: false, perfilNome: null }, "telas");
    expect(l.tom).toBe("aviso");
    expect(l.valor).toContain("nenhuma tela liberada");
  });

  it("conta inativa vence até um perfil atribuído", () => {
    expect(linha({ ativo: false }, "telas").valor).toContain("Conta inativa");
  });

  it("superUsuario diz que o perfil nem é consultado", () => {
    expect(linha({ superUsuario: true }, "telas").valor).toContain("bypass");
  });

  it("com perfil, nomeia o perfil que está concedendo", () => {
    const l = linha({}, "telas");
    expect(l.tom).toBe("ok");
    expect(l.valor).toContain("Coordenador");
  });

  // O caso que motivou a tela: CLT + Perfil "Coordenador" NÃO dá escopo global nem Aprovações.
  describe("CLT com perfil Coordenador", () => {
    it("não enxerga todos os projetos", () => {
      expect(linha({}, "escopo").valor).toContain("membro ou responsável");
    });

    it("não vê a fila de Aprovações, e diz que isso é do Papel", () => {
      expect(linha({}, "aprovacoes").valor).toContain("depende do Papel");
    });

    it("bate ponto normalmente", () => {
      const l = linha({}, "jornada");
      expect(l.tom).toBe("ok");
      expect(l.valor).toContain("Bate ponto");
    });
  });

  it("escopo global sai do perfil ou do superUsuario, não do Papel", () => {
    expect(linha({ perfilEscopoGlobal: true }, "escopo").valor).toContain("Todos os projetos");
    expect(linha({ superUsuario: true }, "escopo").valor).toContain("Todos os projetos");
    // `supervisor` é GLOBAL_ROLES, mas `acessoGlobal()` não lê mais isso.
    expect(linha({ role: "supervisor" }, "escopo").valor).toContain("membro ou responsável");
  });

  it("papel Coordenador ainda abre /aprovacoes (gate não convertido)", () => {
    expect(linha({ role: "supervisor" }, "aprovacoes").tom).toBe("ok");
    expect(linha({ role: "admin" }, "aprovacoes").tom).toBe("ok");
  });

  it("PJ registra apontamento, não ponto", () => {
    expect(linha({ role: "projetista_pj" }, "jornada").valor).toContain("apontamento");
    expect(linha({ role: "freelancer" }, "jornada").valor).toContain("apontamento");
  });

  // Trap real: a página /ponto aceita todo interno, mas `registrarBatida` tem `roles: CLT_ROLES`.
  it("avisa dos papéis que abrem o Ponto mas têm a batida recusada", () => {
    for (const role of ["administrativo", "supervisor", "admin"] as const) {
      const l = linha({ role }, "jornada");
      expect(l.tom).toBe("aviso");
      expect(l.valor).toContain("recusado");
    }
  });

  it("cliente não tem jornada", () => {
    expect(linha({ role: "cliente" }, "jornada").valor).toContain("Não se aplica");
  });

  it("piso de sócio só aparece para sócio", () => {
    expect(resumirAcesso(BASE).some((l) => l.chave === "socio")).toBe(false);
    expect(linha({ ehSocio: true }, "socio").valor).toContain("Coordenador");
  });
});

/**
 * `perfisAtivosParaSelect` (perfis/queries.ts) e `lib/session.ts` filtram `escopo:global` por
 * literal, sem constante compartilhada. Renomear no catálogo não quebra nem tsc nem lint: a
 * consulta passa a não achar nada e a tela informa "só os projetos onde é membro" para quem
 * enxerga tudo — perda silenciosa numa afirmação sobre escopo de dados. Este teste é o alarme.
 */
describe("acoplamento com o catálogo de permissões", () => {
  it("o par escopo:global continua existindo", () => {
    const escopo = PERMISSOES_CATALOGO.find((r) => r.recurso === "escopo");
    expect(escopo, "recurso 'escopo' sumiu do catálogo").toBeDefined();
    expect(
      escopo!.acoes.some((a) => a.acao === "global"),
      "ação 'global' sumiu — atualize perfis/queries.ts E lib/session.ts",
    ).toBe(true);
  });
});
