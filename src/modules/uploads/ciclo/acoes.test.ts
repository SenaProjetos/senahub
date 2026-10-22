import { describe, expect, it } from "vitest";

import { avisoDaDescricao, escolhaDoCiclo, itensDoCiclo, type CicloDaLinha } from "./acoes";

function ciclo(p: Partial<CicloDaLinha> = {}): CicloDaLinha {
  return {
    participa: true,
    revisaoId: "r1",
    numero: 1,
    estado: "em_andamento",
    versao: 1,
    descricao: null,
    descricaoOrigem: null,
    descricaoCarimbo: null,
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
      "ciclo:aplicar:em_revisao",
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

  it('"Em revisão": marcar na publicada; com marca ativa só cancelar; sem permissão de pasta ou fora da publicada, nenhum', () => {
    const marcar = itensDoCiclo(ciclo({ estado: "publicado" })).find((i) => i.id === "ciclo:aplicar:em_revisao") as { rotulo: string; desabilitado?: string } | undefined;
    expect(marcar?.rotulo).toBe("Marcar em revisão…");
    expect(marcar?.desabilitado).toBeUndefined();

    const comMarca = ciclo({ estado: "publicado", controles: [{ id: "m1", tipo: "em_revisao", motivo: "Cliente pediu ajuste", escopos: [], automatico: false, origem: null }] });
    expect(ids(comMarca)).not.toContain("ciclo:aplicar:em_revisao");
    const cancelar = itensDoCiclo(comMarca).find((i) => i.id === "ciclo:remover:m1") as { rotulo: string } | undefined;
    expect(cancelar?.rotulo).toBe("Cancelar revisão…");

    const semPasta = ciclo({ estado: "publicado", podeAlterarPasta: false, controles: comMarca.controles });
    expect(ids(semPasta).some((i) => i.includes("em_revisao") || i === "ciclo:remover:m1")).toBe(false);
    expect(ids(ciclo({ estado: "publicado", podeAlterarPasta: false }))).not.toContain("ciclo:aplicar:em_revisao");
    expect(ids(ciclo({ estado: "compartilhado" }))).not.toContain("ciclo:aplicar:em_revisao");
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

describe("avisoDaDescricao", () => {
  it("em análise com descrição contestada: diz o que o carimbo dizia", () => {
    expect(avisoDaDescricao({ estado: "compartilhado", descricaoOrigem: "contestada", descricaoCarimbo: "REVISÕES" })).toBe(
      "Descrição digitada pelo projetista; o carimbo dizia: REVISÕES",
    );
    expect(avisoDaDescricao({ estado: "compartilhado", descricaoOrigem: "contestada", descricaoCarimbo: null })).toBe(
      "Descrição digitada pelo projetista; o carimbo não tinha descrição.",
    );
  });

  it("sem aviso: descrição do carimbo ou digitada, ou fora da análise", () => {
    expect(avisoDaDescricao({ estado: "compartilhado", descricaoOrigem: "carimbo", descricaoCarimbo: null })).toBeNull();
    expect(avisoDaDescricao({ estado: "compartilhado", descricaoOrigem: "digitada", descricaoCarimbo: null })).toBeNull();
    expect(avisoDaDescricao({ estado: "compartilhado", descricaoOrigem: null, descricaoCarimbo: null })).toBeNull();
    for (const estado of ["em_andamento", "publicado", "arquivado", null] as const) {
      expect(avisoDaDescricao({ estado, descricaoOrigem: "contestada", descricaoCarimbo: "REVISÕES" })).toBeNull();
    }
  });
});
