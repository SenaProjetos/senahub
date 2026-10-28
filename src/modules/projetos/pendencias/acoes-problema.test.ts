import { describe, expect, it } from "vitest";
import {
  ACAO_RESOLVER_NA_REVISAO,
  ACAO_RESPONDER,
  PREFIXO_ESTADO,
} from "@/modules/projetos/pendencias/acoes-apontamento";
import { ACAO_ABRIR_PRANCHA, deveOcultarMenu, itensDoProblema } from "@/modules/projetos/pendencias/acoes-problema";
import { MOTIVO_NAO_PARTICIPA, type ProblemaLinha } from "@/modules/projetos/pendencias/problemas";

function linha(p: Partial<ProblemaLinha> = {}): ProblemaLinha {
  return {
    id: "p1",
    numero: 4,
    texto: "Texto",
    pagina: 1,
    status: "aberta",
    severidade: null,
    tipo: null,
    prazo: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    fechadoEm: null,
    autorId: "autor",
    autor: "Autor",
    tarefaId: null,
    disciplinaId: "d1",
    disciplinaNome: "Estrutural",
    arquivo: "EST-01.pdf",
    uploadIdOrigem: "uo",
    uploadIdVigente: "uv",
    arquivoDisponivel: true,
    deOutraRevisao: false,
    revisaoOrigemId: "r1",
    revisaoVigenteId: "r1",
    revisaoVigenteNumero: 1,
    respostas: [],
    papeis: { ehValidador: false, ehResponsavel: false, ehGlobal: false },
    ...p,
  };
}

const ctx = { usuarioId: "autor", ehAdmin: false, podeValidar: true, projetoId: "proj" };
const ids = (l: ProblemaLinha, c = ctx) => itensDoProblema(l, c).map((i) => i.id);

describe("itensDoProblema", () => {
  it("projetista em aberta: Responder e Assumir, sem Fechar", () => {
    const r = ids(linha({ papeis: { ehValidador: false, ehResponsavel: true, ehGlobal: false } }));
    expect(r).toContain(ACAO_RESPONDER);
    expect(r).toContain(`${PREFIXO_ESTADO}em_correcao`);
    expect(r).not.toContain(`${PREFIXO_ESTADO}fechada`);
  });

  it("validador em resolvida: Fechar, Não procede e Reabrir", () => {
    const itens = itensDoProblema(
      linha({ status: "resolvida", papeis: { ehValidador: true, ehResponsavel: true, ehGlobal: false } }),
      ctx,
    );
    const rotulos = itens.map((i) => ("rotulo" in i ? i.rotulo : ""));
    expect(rotulos).toContain("Fechar");
    expect(rotulos).toContain("Não procede");
    expect(rotulos).toContain("Reabrir");
  });

  it("nunca oferece editar, excluir, classificar nem replicar", () => {
    const proibidos = ["editar", "excluir", "classificar", "replicar", "sep-excluir"];
    for (const status of ["aberta", "em_correcao", "resolvida", "adiado", "fechada"]) {
      for (const flag of [true, false]) {
        const l = linha({ status, papeis: { ehValidador: flag, ehResponsavel: flag, ehGlobal: flag } });
        const r = ids(l, { ...ctx, ehAdmin: flag, podeValidar: flag });
        for (const p of proibidos) expect(r).not.toContain(p);
      }
    }
  });

  it("não deixa separador sobrando", () => {
    const itens = itensDoProblema(linha({ papeis: { ehValidador: true, ehResponsavel: true, ehGlobal: true } }), {
      ...ctx,
      ehAdmin: true,
    });
    expect(itens.at(-1)?.tipo).not.toBe("separador");
  });

  it("quem não participa vê Responder desabilitado com o motivo do servidor", () => {
    const itens = itensDoProblema(linha(), { ...ctx, usuarioId: "outro", podeValidar: false });
    const r = itens.find((i) => i.id === ACAO_RESPONDER);
    expect(r && r.tipo === "acao" && r.desabilitado).toBe(MOTIVO_NAO_PARTICIPA);
  });

  it("quem participa vê Responder habilitado", () => {
    const r = itensDoProblema(linha(), ctx).find((i) => i.id === ACAO_RESPONDER);
    expect(r && r.tipo === "acao" && r.desabilitado).toBeFalsy();
  });

  it("apontamento herdado com projetista: Resolver na revisão, sem estado:resolvida", () => {
    const r = ids(
      linha({
        deOutraRevisao: true,
        revisaoOrigemId: "r0",
        revisaoVigenteId: "r1",
        revisaoVigenteNumero: 1,
        papeis: { ehValidador: false, ehResponsavel: true, ehGlobal: false },
      }),
    );
    expect(r).toContain(ACAO_RESOLVER_NA_REVISAO);
    expect(r).not.toContain(`${PREFIXO_ESTADO}resolvida`);
  });

  it("abre a prancha como link no início", () => {
    expect(itensDoProblema(linha(), ctx)[0]).toMatchObject({
      tipo: "link",
      id: ACAO_ABRIR_PRANCHA,
      rotulo: "Abrir na prancha",
      href: "/projetos/proj/arquivos/uv/visualizar?pin=4",
    });
  });

  it("arquivo indisponível: item desabilitado e nenhum link", () => {
    const itens = itensDoProblema(linha({ arquivoDisponivel: false }), ctx);
    expect(itens.some((i) => i.tipo === "link")).toBe(false);
    expect(itens[0]).toMatchObject({ tipo: "acao", id: ACAO_ABRIR_PRANCHA, rotulo: "Abrir na prancha", desabilitado: "Arquivo indisponível" });
  });
});

describe("deveOcultarMenu", () => {
  const abrir = { tipo: "link", id: ACAO_ABRIR_PRANCHA, rotulo: "Abrir na prancha", href: "/x" } as const;
  const responder = { tipo: "acao", id: ACAO_RESPONDER, rotulo: "Responder" } as const;
  const naoProcede = { tipo: "acao", id: `${PREFIXO_ESTADO}descartada`, rotulo: "Não procede" } as const;
  const inerte = (id: string) => ({ tipo: "acao", id, rotulo: id, desabilitado: "motivo" }) as const;

  it("uma ação só, e é Abrir na prancha → oculta", () => {
    expect(deveOcultarMenu([abrir, inerte(ACAO_RESPONDER)])).toBe(true);
  });
  it("uma ação só, e é Responder → oculta", () => {
    expect(deveOcultarMenu([inerte(ACAO_ABRIR_PRANCHA), responder])).toBe(true);
  });
  it("uma ação só, e é Não procede → mantém o menu", () => {
    expect(deveOcultarMenu([inerte(ACAO_ABRIR_PRANCHA), inerte(ACAO_RESPONDER), naoProcede])).toBe(false);
  });
  it("nenhuma ação ativa → oculta", () => {
    expect(deveOcultarMenu([inerte(ACAO_ABRIR_PRANCHA), inerte(ACAO_RESPONDER)])).toBe(true);
    expect(deveOcultarMenu([])).toBe(true);
  });
  it("várias ativas → mantém", () => {
    expect(deveOcultarMenu([abrir, responder])).toBe(false);
  });
});
