import { describe, expect, it } from "vitest";
import { ACAO_FED_BAIXAR, ACAO_FED_EXCLUIR_TUDO, ACAO_FED_EXCLUIR_VERSAO, itensDaVersaoFederada } from "./acoes";

const ids = (itens: { id: string }[]) => itens.filter((i) => !i.id.startsWith("sep")).map((i) => i.id);
const v = { revisao: "R01", downloadUrl: "/api/documentos/x/download", vigente: true };

describe("itensDaVersaoFederada", () => {
  it("sem gerir: só baixar", () => {
    expect(ids(itensDaVersaoFederada(v, { podeGerir: false, totalVersoes: 3 }))).toEqual([ACAO_FED_BAIXAR]);
  });
  it("com gerir e várias versões: excluir só esta", () => {
    expect(ids(itensDaVersaoFederada(v, { podeGerir: true, totalVersoes: 3 }))).toEqual([ACAO_FED_BAIXAR, ACAO_FED_EXCLUIR_VERSAO]);
  });
  it("a única versão só sai excluindo o modelo inteiro", () => {
    expect(ids(itensDaVersaoFederada(v, { podeGerir: true, totalVersoes: 1 }))).toEqual([ACAO_FED_BAIXAR, ACAO_FED_EXCLUIR_TUDO]);
  });
  it("todo item destrutivo pede confirmação", () => {
    for (const total of [1, 3]) {
      const destrutivos = itensDaVersaoFederada(v, { podeGerir: true, totalVersoes: total }).filter(
        (i) => i.tipo === "acao" && i.variant === "destructive",
      );
      expect(destrutivos.length).toBeGreaterThan(0);
      expect(destrutivos.every((i) => i.tipo === "acao" && i.confirmar)).toBe(true);
    }
  });
});
