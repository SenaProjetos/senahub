import { describe, expect, it } from "vitest";
import type { ConversaDTO, MensagemDTO } from "./queries";
import { estadoInicial, juntarAnteriores, mesclarConversa, novasDoOutroLado } from "./mesclar";

function msg(
  id: string,
  criadaEm: string,
  decisao: MensagemDTO["decisao"] = null,
  lado: MensagemDTO["lado"] = "cliente",
): MensagemDTO {
  return { id, lado, autorNome: "Cliente", texto: id, criadaEm, anexos: [], decisao, minha: false };
}

function conversa(mensagens: MensagemDTO[], extra: Partial<ConversaDTO> = {}): ConversaDTO {
  return { projetoId: "p1", mensagens, temAnteriores: false, naoLidas: 0, decisoes: [], ...extra };
}

const t = (min: number) => `2026-11-21T10:${String(min).padStart(2, "0")}:00.000Z`;

describe("mesclarConversa", () => {
  it("mensagem nova entra no fim e as anteriores já carregadas ficam", () => {
    const atual = estadoInicial(conversa([msg("a", t(1)), msg("b", t(2)), msg("c", t(3))], { temAnteriores: true }));
    const novo = conversa([msg("c", t(3)), msg("d", t(4))], { temAnteriores: true, naoLidas: 1 });
    const r = mesclarConversa(atual, novo);
    expect(r.mensagens.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.temAnteriores).toBe(true);
    expect(r.naoLidas).toBe(1);
  });

  it("sem mensagem em comum e com mais páginas, recomeça da página nova", () => {
    const atual = estadoInicial(conversa([msg("a", t(1))]));
    const novo = conversa([msg("x", t(9))], { temAnteriores: true });
    expect(mesclarConversa(atual, novo).mensagens.map((m) => m.id)).toEqual(["x"]);
  });

  it("a marca de decisão das anteriores segue a lista de decisões nova", () => {
    const marcada = { resumo: "ok", marcadaPor: "Ana", marcadaEm: t(5) };
    const atual = estadoInicial(conversa([msg("a", t(1), marcada), msg("b", t(2))]));
    const novo = conversa([msg("b", t(2))], { temAnteriores: true });
    expect(mesclarConversa(atual, novo).mensagens[0]?.decisao).toBeNull();

    const remarcado = conversa([msg("b", t(2))], {
      temAnteriores: true,
      decisoes: [{ mensagemId: "a", resumo: "novo", trecho: "a", mensagemEm: t(1), marcadaPor: "Bia" }],
    });
    expect(mesclarConversa(atual, remarcado).mensagens[0]?.decisao).toMatchObject({ resumo: "novo", marcadaPor: "Bia" });
  });
});

describe("juntarAnteriores", () => {
  it("põe a página anterior no começo sem repetir", () => {
    const atual = estadoInicial(conversa([msg("b", t(2)), msg("c", t(3))], { temAnteriores: true }));
    const r = juntarAnteriores(atual, conversa([msg("a", t(1)), msg("b", t(2))], { temAnteriores: false }));
    expect(r.mensagens.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(r.temAnteriores).toBe(false);
  });
});

describe("novasDoOutroLado", () => {
  const lista = [msg("a", t(1)), msg("b", t(2), null, "equipe"), msg("c", t(3)), msg("d", t(4))];

  it("conta só as do outro lado depois da última já conhecida", () => {
    expect(novasDoOutroLado(lista, "equipe", t(2))).toBe(2);
    expect(novasDoOutroLado(lista, "cliente", t(1))).toBe(1);
    expect(novasDoOutroLado(lista, "equipe", t(4))).toBe(0);
  });

  it("sem referência (primeira carga) não anuncia nada", () => {
    expect(novasDoOutroLado(lista, "equipe", null)).toBe(0);
  });

  it("anteriores carregadas por 'Ver anteriores' não contam", () => {
    expect(novasDoOutroLado([msg("x", t(0)), ...lista], "equipe", t(4))).toBe(0);
  });
});
