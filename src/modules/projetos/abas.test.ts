import { describe, it, expect } from "vitest";
import { aplicarConfigAbas, abasParaEdicao, ordenarPorAtividade, ABAS_CONFIGURAVEIS } from "./abas";

const TODAS = ["", ...ABAS_CONFIGURAVEIS];

describe("aplicarConfigAbas", () => {
  it("sem config, mantém a ordem padrão com Visão Geral primeiro", () => {
    expect(aplicarConfigAbas(TODAS, null)).toEqual(TODAS);
  });

  it("aplica a ordem configurada e mantém Visão Geral primeiro mesmo se a config tentar movê-la", () => {
    const ordem = aplicarConfigAbas(TODAS, [
      { suffix: "/diario", oculta: false },
      { suffix: "/inputs", oculta: false },
    ]);
    expect(ordem.slice(0, 3)).toEqual(["", "/diario", "/inputs"]);
  });

  it("remove abas marcadas como ocultas", () => {
    const ordem = aplicarConfigAbas(TODAS, [{ suffix: "/extras", oculta: true }]);
    expect(ordem).not.toContain("/extras");
  });

  it("ignora aba oculta/reordenada que não está mais liberada por permissão", () => {
    const semFinanceiro = TODAS.filter((s) => s !== "/financeiro");
    const ordem = aplicarConfigAbas(semFinanceiro, [{ suffix: "/financeiro", oculta: false }]);
    expect(ordem).not.toContain("/financeiro");
  });

  it("aba nova (fora da config salva) aparece no final, na ordem padrão", () => {
    const ordem = aplicarConfigAbas(TODAS, [{ suffix: "/diario", oculta: false }]);
    expect(ordem[ordem.length - 1]).not.toBe("/diario");
    expect(ordem).toContain("/extras");
  });
});

describe("ordenarPorAtividade", () => {
  it("sem conteudoPorAba, mantém a ordem original", () => {
    expect(ordenarPorAtividade(TODAS, undefined)).toEqual(TODAS);
  });

  it("move abas vazias para o final, preservando ordem configurada em cada grupo", () => {
    const ordem = ["", "/disciplinas", "/inputs", "/financeiro", "/arquivos"];
    const conteudo = { "/disciplinas": true, "/inputs": false, "/financeiro": true, "/arquivos": false };
    expect(ordenarPorAtividade(ordem, conteudo)).toEqual([
      "",
      "/disciplinas",
      "/financeiro",
      "/inputs",
      "/arquivos",
    ]);
  });

  it("trata suffix ausente em conteudoPorAba como ativa (não avaliada)", () => {
    const ordem = ["", "/disciplinas", "/historico"];
    const conteudo = { "/disciplinas": false };
    expect(ordenarPorAtividade(ordem, conteudo)).toEqual(["", "/historico", "/disciplinas"]);
  });

  it("mantém Visão Geral sempre primeiro", () => {
    const ordem = ["", "/diario"];
    expect(ordenarPorAtividade(ordem, { "/diario": false })[0]).toBe("");
  });
});

describe("abasParaEdicao", () => {
  it("sem config, devolve todas as configuráveis visíveis na ordem padrão", () => {
    expect(abasParaEdicao(null)).toEqual(ABAS_CONFIGURAVEIS.map((suffix) => ({ suffix, oculta: false })));
  });

  it("preserva ordem salva e acrescenta as faltantes no final", () => {
    const editor = abasParaEdicao([{ suffix: "/historico", oculta: true }]);
    expect(editor[0]).toEqual({ suffix: "/historico", oculta: true });
    expect(editor).toHaveLength(ABAS_CONFIGURAVEIS.length);
  });

  it("descarta entradas duplicadas ou de suffix desconhecido", () => {
    const editor = abasParaEdicao([
      { suffix: "/diario", oculta: true },
      { suffix: "/diario", oculta: false },
      // @ts-expect-error suffix inválido de propósito
      { suffix: "/nao-existe", oculta: false },
    ]);
    expect(editor.filter((a) => a.suffix === "/diario")).toEqual([{ suffix: "/diario", oculta: true }]);
    expect(editor).toHaveLength(ABAS_CONFIGURAVEIS.length);
  });
});
