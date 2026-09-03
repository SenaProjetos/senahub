import { describe, expect, it } from "vitest";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import {
  chaveDe,
  contarGeneros,
  filtrarCatalogo,
  generoDa,
  GRUPOS_CATALOGO,
  normalizarBusca,
  resumoDoRecurso,
  semTelaConcedida,
  TOTAL_PARES,
} from "@/lib/permissao-genero";

const recurso = (chave: string) => {
  const r = PERMISSOES_CATALOGO.find((x) => x.recurso === chave);
  if (!r) throw new Error(`recurso ${chave} sumiu do catálogo`);
  return r;
};

const acao = (rec: string, ac: string) => {
  const a = recurso(rec).acoes.find((x) => x.acao === ac);
  if (!a) throw new Error(`${rec}:${ac} sumiu do catálogo`);
  return a;
};

describe("generoDa", () => {
  it("classifica pelo catálogo, não por convenção de nome", () => {
    expect(generoDa(acao("projetos", "ver"))).toBe("tela");
    expect(generoDa(acao("projetos", "gerir"))).toBe("acao");
    expect(generoDa(acao("escopo", "global"))).toBe("dados");
  });

  it("uma ação que abre tela E escreve conta como tela", () => {
    // `configuracoes:gerir` é os dois; a linha mostra o selo "altera dados" à parte.
    const a = acao("configuracoes", "gerir");
    expect(generoDa(a)).toBe("tela");
    expect(a.leitura ?? false).toBe(false);
  });
});

describe("GRUPOS_CATALOGO", () => {
  it("ordena telas antes de funcionalidades e dados por último", () => {
    const arquivos = GRUPOS_CATALOGO.find((g) => g.recurso.recurso === "arquivos");
    const generos = arquivos!.acoes.map(generoDa);
    const idx = { tela: 0, acao: 1, dados: 2 } as const;
    const posicoes = generos.map((g) => idx[g]);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it("não perde nem duplica nenhum par do catálogo", () => {
    const doCatalogo = PERMISSOES_CATALOGO.flatMap((r) => r.acoes.map((a) => `${r.recurso}:${a.acao}`));
    const dosGrupos = GRUPOS_CATALOGO.flatMap((g) => g.acoes.map((a) => chaveDe(g.recurso, a)));
    expect(dosGrupos.sort()).toEqual(doCatalogo.sort());
    expect(TOTAL_PARES).toBe(doCatalogo.length);
  });
});

describe("normalizarBusca", () => {
  it("ignora acento e caixa", () => {
    expect(normalizarBusca("Ações")).toBe("acoes");
    expect(normalizarBusca("LICITAÇÕES")).toBe("licitacoes");
  });
});

describe("filtrarCatalogo", () => {
  it("sem busca nem filtro devolve o catálogo inteiro", () => {
    expect(filtrarCatalogo("")).toHaveLength(GRUPOS_CATALOGO.length);
  });

  it("casar o rótulo do recurso traz o grupo inteiro", () => {
    const r = filtrarCatalogo("licitações");
    const lic = r.find((g) => g.recurso.recurso === "licitacoes");
    expect(lic?.acoes).toHaveLength(recurso("licitacoes").acoes.length);
  });

  it("acha sem acento e pela chave técnica", () => {
    expect(filtrarCatalogo("licitacoes").some((g) => g.recurso.recurso === "licitacoes")).toBe(true);
    expect(filtrarCatalogo("escopo:global").flatMap((g) => g.acoes)).toHaveLength(1);
  });

  it("acha pela tela que a permissão abre", () => {
    // "Doc Studio" só aparece em `abre`, não no label da ação ("Ver e gerar documentos").
    const r = filtrarCatalogo("doc studio");
    expect(r.flatMap((g) => g.acoes.map((a) => a.acao))).toContain("ver");
  });

  it("filtro por gênero descarta recurso que fica vazio", () => {
    const soDados = filtrarCatalogo("", "dados");
    expect(soDados.map((g) => g.recurso.recurso).sort()).toEqual(["arquivos", "escopo"]);
    expect(soDados.flatMap((g) => g.acoes)).toHaveLength(2);
  });

  it("busca sem correspondência devolve vazio, não o catálogo", () => {
    expect(filtrarCatalogo("zzz-nao-existe")).toEqual([]);
  });
});

describe("semTelaConcedida", () => {
  const projetos = recurso("projetos");

  it("não alerta quando nada foi concedido", () => {
    expect(semTelaConcedida(projetos, () => false)).toBe(false);
  });

  it("não alerta quando alguma tela do recurso está concedida", () => {
    expect(semTelaConcedida(projetos, (k) => k === "projetos:ver")).toBe(false);
  });

  it("alerta com funcionalidade concedida e nenhuma tela do recurso", () => {
    expect(semTelaConcedida(projetos, (k) => k === "projetos:gerir")).toBe(true);
  });

  it("recurso sem nenhuma ação de tela nunca alerta", () => {
    // `escopo` só tem escopo de dados — não existe tela para faltar.
    expect(semTelaConcedida(recurso("escopo"), () => true)).toBe(false);
  });
});

describe("resumoDoRecurso / contarGeneros", () => {
  it("conta sobre o recurso inteiro e pluraliza em pt-BR", () => {
    expect(contarGeneros(recurso("clientes"))).toEqual({ tela: 1, acao: 1, dados: 0 });
    expect(resumoDoRecurso(recurso("clientes"))).toBe("1 tela · 1 ação");
  });

  it("omite gênero ausente em vez de escrever zero", () => {
    expect(resumoDoRecurso(recurso("escopo"))).toBe("1 de dados");
  });
});
