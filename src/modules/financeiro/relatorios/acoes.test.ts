import { describe, expect, it } from "vitest";
import type { AcaoItemAcao, AcaoItemLink } from "@/components/ui/acoes";
import {
  ACAO_COMPARAR_MES,
  ACAO_VER_LANCAMENTOS_DA_LINHA,
  itensDaLinhaDeDimensao,
  itensDoMesDeEvolucao,
  MOTIVO_SEM_FILTRO_NO_LIVRO_CAIXA,
} from "@/modules/financeiro/relatorios/acoes";

describe("ações do mês (evolução)", () => {
  it("o mês selecionado não tem 'comparar' consigo mesmo", () => {
    const atual = itensDoMesDeEvolucao({ rotulo: "Outubro", de: "2026-10-01", ate: "2026-10-31", ehAtual: true, base: "caixa" });
    expect(atual.some((i) => i.id === ACAO_COMPARAR_MES)).toBe(false);
    const outro = itensDoMesDeEvolucao({ rotulo: "Setembro", de: "2026-09-01", ate: "2026-09-30", ehAtual: false, base: "caixa" });
    expect(outro.some((i) => i.id === ACAO_COMPARAR_MES)).toBe(true);
  });
  it("ver DRE e exportar levam a data certa", () => {
    const itens = itensDoMesDeEvolucao({ rotulo: "Outubro", de: "2026-10-01", ate: "2026-10-31", ehAtual: true, base: "caixa" });
    const dre = itens.find((i) => i.tipo === "link" && i.id === "ver-dre-do-mes") as AcaoItemLink;
    expect(dre.href).toBe("/financeiro/relatorios?de=2026-10-01&ate=2026-10-31&base=caixa");
  });
  it("leva a base escolhida para a DRE e a exportação, e abre os lançamentos do mês", () => {
    const itens = itensDoMesDeEvolucao({ rotulo: "Outubro", de: "2026-09-01", ate: "2026-09-30", ehAtual: false, base: "competencia" });
    const href = (id: string) => (itens.find((i) => i.id === id) as AcaoItemLink).href;
    expect(href("ver-dre-do-mes")).toContain("base=competencia");
    expect(href("exportar-mes")).toContain("base=competencia");
    expect(href("ver-lancamentos-do-mes")).toBe("/financeiro/lancamentos?mes=2026-09");
  });
});

describe("ações da linha de dimensão", () => {
  it("centro e projeto são link de verdade", () => {
    const centro = itensDaLinhaDeDimensao({ chave: "c1", dimensao: "centro" })[0] as AcaoItemLink;
    expect(centro.href).toBe("/financeiro/lancamentos?centroId=c1");
    const projeto = itensDaLinhaDeDimensao({ chave: "p1", dimensao: "projeto" })[0] as AcaoItemLink;
    expect(projeto.href).toBe("/financeiro/lancamentos?projetoId=p1");
  });
  it("categoria, contato e tag ficam desabilitados com o motivo (o filtro não existe)", () => {
    for (const dimensao of ["categoria", "contato", "tag"] as const) {
      const item = itensDaLinhaDeDimensao({ chave: "x", dimensao })[0] as AcaoItemAcao;
      expect(item.id).toBe(ACAO_VER_LANCAMENTOS_DA_LINHA);
      expect(item.desabilitado).toBe(MOTIVO_SEM_FILTRO_NO_LIVRO_CAIXA);
    }
  });
});
