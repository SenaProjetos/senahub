import { describe, expect, it } from "vitest";
import { agruparCards, filtrarCatalogo, opcoesDeVersao } from "./apresentacao";
import type { CardNaVersao, LinhaCatalogo } from "./versao";

function linha(id: string, nome: string, sigla: string | null, sinonimos: string[] = []): LinhaCatalogo {
  return { alvo: { tipo: "disciplina", id }, nome, sigla, sinonimos, situacao: "igual", siglaAnterior: null };
}
function card(id: string, nome: string, categoria: string | null, sigla: string | null, sinonimos: string[] = [], subs: LinhaCatalogo[] = []): CardNaVersao {
  return { ...linha(id, nome, sigla, sinonimos), categoria, subs };
}
function sub(id: string, nome: string, sigla: string | null): LinhaCatalogo {
  return { ...linha(id, nome, sigla), alvo: { tipo: "subdisciplina", id } };
}

const cards = [
  card("arq", "Arquitetura", "ARQUITETURA", "ARQ"),
  card("hid", "Hidrossanitário", "CIVIL", "HID", ["HDR"], [sub("agf", "Água fria", "AGF"), sub("esg", "Esgoto", "ESG")]),
  card("est", "Estrutural", "CIVIL", "EST"),
  card("orc", "Orçamento", null, "ORC"),
  card("ele", "Elétrica", "ELÉTRICA", "ELE"),
];

describe("agruparCards", () => {
  it("por categoria em ordem alfabética, 'Outras' por último, ordem interna preservada", () => {
    const grupos = agruparCards(cards);
    expect(grupos.map((g) => g.categoria)).toEqual(["ARQUITETURA", "CIVIL", "ELÉTRICA", "Outras"]);
    expect(grupos[1].cards.map((c) => c.nome)).toEqual(["Hidrossanitário", "Estrutural"]);
  });

  it("sem cards: sem grupos", () => {
    expect(agruparCards([])).toEqual([]);
  });
});

describe("filtrarCatalogo", () => {
  it("busca vazia devolve tudo", () => {
    expect(filtrarCatalogo(cards, "  ")).toBe(cards);
  });

  it("casa por nome sem acento nem caixa, e por sigla", () => {
    expect(filtrarCatalogo(cards, "eletrica").map((c) => c.alvo.id)).toEqual(["ele"]);
    expect(filtrarCatalogo(cards, "est").map((c) => c.alvo.id)).toEqual(["est"]);
    expect(filtrarCatalogo(cards, "ORC").map((c) => c.alvo.id)).toEqual(["orc"]);
  });

  it("casa por sinônimo", () => {
    expect(filtrarCatalogo(cards, "hdr").map((c) => c.alvo.id)).toEqual(["hid"]);
  });

  it("card aparece quando só uma sub casa, mostrando só as subs que casam", () => {
    const r = filtrarCatalogo(cards, "esg");
    expect(r.map((c) => c.alvo.id)).toEqual(["hid"]);
    expect(r[0].subs.map((s) => s.alvo.id)).toEqual(["esg"]);
  });

  it("card que casa mostra todas as subs", () => {
    const r = filtrarCatalogo(cards, "hidrossanitario");
    expect(r[0].subs.map((s) => s.alvo.id)).toEqual(["agf", "esg"]);
  });

  it("nada encontrado: lista vazia", () => {
    expect(filtrarCatalogo(cards, "zzz")).toEqual([]);
  });
});

describe("opcoesDeVersao", () => {
  const v = (numero: number, nome: string, publicadaEm: Date | null) => ({ numero, nome, publicadaEm });

  it("mais nova primeiro, com rascunho e vigente", () => {
    const r = opcoesDeVersao([v(1, "Padrão original", new Date("2026-01-01")), v(2, "Padrão 2026", null)]);
    expect(r).toEqual([
      { numero: 2, nome: "Padrão 2026", rascunho: true, vigente: false },
      { numero: 1, nome: "Padrão original", rascunho: false, vigente: true },
    ]);
  });

  it("vigente é a publicada de maior número, mesmo com rascunho no meio", () => {
    const r = opcoesDeVersao([v(1, "A", new Date()), v(2, "B", new Date()), v(3, "C", null)]);
    expect(r.map((o) => [o.numero, o.vigente, o.rascunho])).toEqual([
      [3, false, true],
      [2, true, false],
      [1, false, false],
    ]);
  });

  it("sem nenhuma publicada: ninguém é vigente", () => {
    expect(opcoesDeVersao([v(1, "A", null)]).some((o) => o.vigente)).toBe(false);
  });
});
