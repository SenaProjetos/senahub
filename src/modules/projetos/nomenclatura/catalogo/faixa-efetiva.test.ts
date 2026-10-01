import { describe, expect, it } from "vitest";
import { catalogoDev } from "@/test/catalogo-nomenclatura-snap";
import { catalogosDaVersao, siglasEfetivas } from "@/modules/uploads/nomenclatura/siglas-versao";
import { colisoes, operacoesComId, simular, type CatalogoSnap } from "./versao";

/**
 * Guarda da E3 (spec 2026-09-30-catalogo-nomenclatura-unificado §5.1): tirar um item da versão não
 * mexe nas linhas de sigla dele, então TODO leitor recorta pela faixa efetiva (sigla ∩ item ∩ card).
 * Se um leitor novo ler a linha crua, o card que saiu volta a "ocupar" a sigla na versão.
 * A trava de publicação (`siglas-queries.ts` → `todasAsSiglasComRotulo`) faz o mesmo recorte inline;
 * `siglasEfetivas` é a versão pura dele.
 */
function paraMotor(snap: CatalogoSnap) {
  return {
    disciplinas: snap.cards.map((c) => ({
      id: c.id,
      numeracao: null,
      numeracaoFim: null,
      versaoDesde: c.versaoDesde,
      versaoAte: c.versaoAte,
      siglas: c.siglas,
    })),
    subdisciplinas: snap.subs.map((s) => ({
      id: s.id,
      disciplinaCatalogoId: s.cardId,
      versaoDesde: s.versaoDesde,
      versaoAte: s.versaoAte,
      siglas: s.siglas,
    })),
    pranchas: snap.itens.map((i) => ({
      id: i.id,
      categoria: i.categoria,
      projetoId: null,
      versaoDesde: i.versaoDesde,
      versaoAte: i.versaoAte,
      siglas: i.siglas,
    })),
  };
}

describe("faixa efetiva: card que saiu não vale na versão, mesmo com a linha em aberto", () => {
  const saiu = simular(catalogoDev(), 2, operacoesComId([{ tipo: "sai", alvo: { tipo: "disciplina", id: "log" } }]));

  it("a linha de sigla continua em aberto (é o que a E3 muda)", () => {
    expect(saiu.cards.find((c) => c.id === "log")!.siglas[0]).toMatchObject({ sigla: "LOG", versaoAte: null });
  });

  it("motor de envio: não reconhece LOG na v2, reconhece na v1", () => {
    expect(catalogosDaVersao(paraMotor(saiu), 2).disciplinas.map((d) => d.codigo)).not.toContain("LOG");
    expect(catalogosDaVersao(paraMotor(saiu), 1).disciplinas.map((d) => d.codigo)).toContain("LOG");
  });

  it("trava de publicação: a linha é cortada na faixa do card", () => {
    const log = saiu.cards.find((c) => c.id === "log")!;
    expect(siglasEfetivas(log.siglas, log)).toEqual([expect.objectContaining({ sigla: "LOG", versaoDesde: 1, versaoAte: 1 })]);
  });

  it("colisão: outro card pode usar LOG na v2", () => {
    const s = simular(saiu, 2, operacoesComId([{ tipo: "card-novo", nome: "Lógica", sigla: "LOG" }]));
    expect(colisoes(s, [1, 2])).toEqual([]);
  });
});
