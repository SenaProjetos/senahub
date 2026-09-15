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
  perfilValidaEntregas: true,
  perfilAprovaDisciplina: true,
  perfilAtuaDisciplinaAlheia: true,
  perfilGereTodasTarefas: true,
  contratacao: "clt",
  jaTeveVinculo: true,
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

  // O caso que motivou a tela: Papel CLT + Perfil "Coordenador".
  describe("CLT com perfil Coordenador", () => {
    it("não enxerga todos os projetos enquanto o perfil não tiver escopo global", () => {
      expect(linha({}, "escopo").valor).toContain("membro ou responsável");
    });

    it("abre a fila e aprova a entrega pelo PERFIL, não pelo papel", () => {
      expect(linha({}, "aprovacoes").valor).toContain("aprova a entrega");
      expect(linha({ perfilAprovaDisciplina: false }, "aprovacoes").valor).toContain("não aprova");
      expect(linha({ perfilValidaEntregas: false }, "aprovacoes").valor).toContain("não abre /aprovacoes");
    });

    // O caso da coordenadora (2026-09-15): antes a linha dizia "depende do Papel".
    it("age na disciplina dos outros e gere as tarefas de todos pelo perfil", () => {
      expect(linha({}, "disciplina_alheia").tom).toBe("ok");
      expect(linha({}, "tarefas").valor).toContain("todas as pessoas");
    });

    it("bate ponto normalmente", () => {
      const l = linha({}, "jornada");
      expect(l.tom).toBe("ok");
      expect(l.valor).toContain("Bate ponto");
    });
  });

  it("escopo global sai do perfil ou do superUsuario, não do Papel", () => {
    expect(linha({ perfilEscopoGlobal: true }, "escopo").valor).toContain("Todos os projetos");
    // escopo global é só leitura desde 2026-09-15 — não pode prometer escrita
    expect(linha({ perfilEscopoGlobal: true }, "escopo").valor).toContain("só enxergar");
    expect(linha({ superUsuario: true }, "escopo").valor).toContain("Todos os projetos");
    // `supervisor` é GLOBAL_ROLES, mas `acessoGlobal()` não lê mais isso.
    expect(linha({ role: "supervisor" }, "escopo").valor).toContain("membro ou responsável");
  });

  it("o papel sozinho não concede mais nada disso (gates convertidos em 2026-09-15)", () => {
    const semPares = {
      role: "supervisor" as const,
      perfilValidaEntregas: false,
      perfilAprovaDisciplina: false,
      perfilAtuaDisciplinaAlheia: false,
      perfilGereTodasTarefas: false,
    };
    expect(linha(semPares, "disciplina_alheia").tom).toBe("neutro");
    expect(linha(semPares, "tarefas").tom).toBe("neutro");
    expect(linha(semPares, "aprovacoes").tom).toBe("neutro");
    expect(linha({ ...semPares, superUsuario: true }, "disciplina_alheia").tom).toBe("ok");
  });

  it("PJ registra apontamento, não ponto", () => {
    expect(linha({ role: "projetista_pj", contratacao: "pj" }, "jornada").valor).toContain("apontamento");
    expect(linha({ role: "freelancer", contratacao: "pj" }, "jornada").valor).toContain("apontamento");
  });

  // O bug de 2026-09-15: batida seguia o papel. Agora segue a contratação.
  it("Administrativo, TI e Coordenador contratados CLT batem ponto", () => {
    for (const role of ["administrativo", "ti", "supervisor"] as const) {
      const l = linha({ role, contratacao: "clt" }, "jornada");
      expect(l.tom, role).toBe("ok");
      expect(l.valor, role).toContain("Bate ponto");
    }
  });

  it("avisa, com o motivo, quem fica sem registrar hora", () => {
    expect(linha({ role: "supervisor", contratacao: "pro_labore" }, "jornada").valor).toContain("não é CLT nem estágio");
    expect(linha({ role: "clt", contratacao: null, jaTeveVinculo: true }, "jornada").valor).toContain("encerrado");
    expect(linha({ role: "administrativo", contratacao: null, jaTeveVinculo: false }, "jornada").valor).toContain("RH → Pessoas");
    expect(linha({ role: "administrativo", contratacao: null, jaTeveVinculo: false }, "jornada").tom).toBe("aviso");
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
