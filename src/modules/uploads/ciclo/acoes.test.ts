import { describe, expect, it } from "vitest";

import { escolhaDoCiclo, itensDoCiclo, type CicloDaLinha } from "./acoes";

function ciclo(p: Partial<CicloDaLinha> = {}): CicloDaLinha {
  return {
    participa: true,
    revisaoId: "r1",
    numero: 1,
    estado: "em_andamento",
    versao: 1,
    descricao: null,
    controles: [],
    novo: false,
    podeEnviar: true,
    podePublicar: true,
    podeAlterarPasta: true,
    podeBloquear: true,
    ...p,
  };
}
const ids = (c: CicloDaLinha, travado?: string) => itensDoCiclo(c, travado).map((i) => i.id);
const item = (c: CicloDaLinha, id: string) => itensDoCiclo(c).find((i) => i.id === id) as { desabilitado?: string } | undefined;

describe("itensDoCiclo", () => {
  it("em andamento: enviar para análise e bloqueio/restrição", () => {
    expect(ids(ciclo())).toEqual(["ciclo:enviar_analise", "ciclo:aplicar:bloqueio", "ciclo:aplicar:restricao"]);
  });

  it("em análise: publicar e devolver", () => {
    expect(ids(ciclo({ estado: "compartilhado" }))).toEqual(["ciclo:publicar", "ciclo:devolver", "ciclo:aplicar:bloqueio", "ciclo:aplicar:restricao"]);
  });

  it("publicado: liberar para obra, enviar ao cliente e arquivar", () => {
    expect(ids(ciclo({ estado: "publicado" }))).toEqual([
      "ciclo:aplicar:liberado_obra",
      "ciclo:aplicar:enviado_cliente",
      "ciclo:aplicar:bloqueio",
      "ciclo:aplicar:restricao",
      "ciclo:arquivar",
    ]);
  });

  it("arquivado: nada (somente leitura)", () => {
    expect(ids(ciclo({ estado: "arquivado" }))).toEqual([]);
  });

  it("perfil sem permissão: o item some (não fica desabilitado)", () => {
    expect(ids(ciclo({ estado: "compartilhado", podePublicar: false, podeBloquear: false }))).toEqual([]);
    expect(ids(ciclo({ podeEnviar: false, podeBloquear: false }))).toEqual([]);
  });

  it("bloqueada: as transições ficam desabilitadas com o motivo do servidor", () => {
    const c = ciclo({ estado: "compartilhado", controles: [{ id: "b1", tipo: "bloqueio", motivo: "ART", escopos: ["download"], automatico: false, origem: null }] });
    expect(item(c, "ciclo:publicar")?.desabilitado).toMatch(/bloqueada/);
    expect(ids(c)).toContain("ciclo:remover:b1");
  });

  it("restrição ativa desabilita liberar para obra; a dos apontamentos não sai à mão", () => {
    const c = ciclo({ estado: "publicado", controles: [{ id: "x1", tipo: "restricao", motivo: "Pendências", escopos: [], automatico: true, origem: "pendencias" }] });
    expect(item(c, "ciclo:aplicar:liberado_obra")?.desabilitado).toMatch(/restrição/);
    expect(item(c, "ciclo:remover:x1")?.desabilitado).toMatch(/sozinha/);
  });

  it("controle já ativo: oferece removê-lo, não aplicar de novo", () => {
    const c = ciclo({ estado: "publicado", controles: [{ id: "l1", tipo: "liberado_obra", motivo: "RT", escopos: [], automatico: false, origem: null }] });
    expect(ids(c)).not.toContain("ciclo:aplicar:liberado_obra");
    expect(ids(c)).toContain("ciclo:remover:l1");
  });

  it("fora do ciclo: nenhum item", () => {
    expect(ids(ciclo({ participa: false }))).toEqual([]);
  });

  it("ocupado: tudo desabilitado com o mesmo motivo", () => {
    expect(itensDoCiclo(ciclo(), "Aguarde").every((i) => (i as { desabilitado?: string }).desabilitado === "Aguarde")).toBe(true);
  });

  it("escolhaDoCiclo lê os ids de volta", () => {
    expect(escolhaDoCiclo("ciclo:publicar")).toEqual({ tipo: "transicao", acao: "publicar" });
    expect(escolhaDoCiclo("ciclo:aplicar:bloqueio")).toEqual({ tipo: "aplicar", controle: "bloqueio" });
    expect(escolhaDoCiclo("ciclo:remover:abc")).toEqual({ tipo: "remover", controleId: "abc" });
    expect(escolhaDoCiclo("renomear")).toBeNull();
  });
});
